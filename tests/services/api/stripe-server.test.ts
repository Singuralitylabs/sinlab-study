import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const { mockSessionsCreate, mockPricesRetrieve, mockCustomersCreate, MockStripeError } = vi.hoisted(
  () => {
    class MockStripeError extends Error {
      code?: string;
      param?: string;
      constructor(opts: { message: string; code?: string; param?: string }) {
        super(opts.message);
        this.code = opts.code;
        this.param = opts.param;
      }
    }
    return {
      mockSessionsCreate: vi.fn(),
      mockPricesRetrieve: vi.fn(),
      mockCustomersCreate: vi.fn(),
      MockStripeError,
    };
  }
);

vi.mock("stripe", () => {
  class MockStripe {
    checkout = { sessions: { create: mockSessionsCreate } };
    prices = { retrieve: mockPricesRetrieve };
    customers = { create: mockCustomersCreate };
  }
  return { default: Object.assign(MockStripe, { errors: { StripeError: MockStripeError } }) };
});

vi.mock("@/app/services/api/supabase-server");

import {
  CHECKOUT_CLAIM_TTL_MINUTES,
  CHECKOUT_PENDING_STATUS,
  claimCheckoutSlot,
  createCheckoutSession,
  createCheckoutSessionForUser,
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  isProrationBelowMinimum,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

/** `stripe.prices.retrieve()` のモック応答を設定する共通ヘルパー（既定値: 月額¥3000） */
function mockPrice(
  overrides: {
    unitAmount?: number | null;
    currency?: string;
    interval?: string;
    intervalCount?: number;
  } = {}
) {
  const { unitAmount = 3000, currency = "jpy", interval = "month", intervalCount = 1 } = overrides;
  mockPricesRetrieve.mockResolvedValue({
    unit_amount: unitAmount,
    currency,
    recurring: { interval, interval_count: intervalCount },
  });
}

type FakeSubscriptionRow = {
  status: string;
  checkout_claimed_at: string | null;
  stripe_customer_id: string | null;
};

/**
 * `stripe_subscriptions` の1行だけを保持するインメモリのSupabaseモック。
 * claim/release の排他は `user_id` のUNIQUE制約（重複INSERTは23505）と、条件付きUPDATEが
 * 「条件に合致する行が無ければ0行」になることに依存しているため、固定応答のモックでは
 * 並行リクエストの挙動を検証できない。ここではその2点だけを再現する。
 */
function createRaceSupabaseClient() {
  let row: FakeSubscriptionRow | null = null;

  return {
    from: () => {
      let operation: "insert" | "update" = "insert";
      let payload: Record<string, unknown> = {};
      let statuses: string[] | null = null;
      let claimFilter: { kind: "released" } | { kind: "stale"; before: string } | null = null;
      const equals: Record<string, unknown> = {};

      const run = () => {
        const current = row;
        if (operation === "insert") {
          if (current) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          row = {
            status: String(payload.status),
            checkout_claimed_at: (payload.checkout_claimed_at as string | null) ?? null,
            stripe_customer_id: null,
          };
          return { data: { stripe_customer_id: null }, error: null };
        }
        if (!current) {
          return { data: [], error: null };
        }
        // claim（.in("status", ...) 付き）の条件付きUPDATE
        if (statuses !== null) {
          const claimable =
            claimFilter?.kind === "released"
              ? current.checkout_claimed_at === null
              : claimFilter !== null &&
                current.checkout_claimed_at !== null &&
                current.checkout_claimed_at < claimFilter.before;
          if (!statuses.includes(current.status) || !claimable) {
            return { data: [], error: null };
          }
          row = { ...current, ...payload } as FakeSubscriptionRow;
          return { data: [{ stripe_customer_id: current.stripe_customer_id }], error: null };
        }
        // release など、等値条件のみのUPDATE
        const matches = Object.entries(equals).every(
          ([column, value]) =>
            column === "user_id" || current[column as keyof FakeSubscriptionRow] === value
        );
        if (matches) {
          row = { ...current, ...payload } as FakeSubscriptionRow;
        }
        return { data: null, error: null };
      };

      const builder = {
        insert(values: Record<string, unknown>) {
          operation = "insert";
          payload = values;
          return builder;
        },
        update(values: Record<string, unknown>) {
          operation = "update";
          payload = values;
          return builder;
        },
        select: () => builder,
        eq(column: string, value: unknown) {
          equals[column] = value;
          return builder;
        },
        in(_column: string, values: string[]) {
          statuses = values;
          return builder;
        },
        is(_column: string, _value: null) {
          claimFilter = { kind: "released" };
          return builder;
        },
        lt(_column: string, value: string) {
          claimFilter = { kind: "stale", before: value };
          return builder;
        },
        maybeSingle: () => Promise.resolve(run()),
        // biome-ignore lint/suspicious/noThenProperty: Supabase クエリビルダーの thenable を再現するため意図的に定義
        then: (onfulfilled: (v: ReturnType<typeof run>) => unknown) =>
          Promise.resolve(run()).then(onfulfilled),
      };
      return builder;
    },
  };
}

// Priceのモジュールスコープキャッシュ（5分TTL）がテスト間で残らないよう、
// テストごとに実時刻をTTLより大きい10分ずつ進める。テストが明示的に渡す
// `now`（アンカー判定用の日時）はDate.now()を使わない実時刻指定のため影響を受けない
let fakeNowMs = new Date("2099-01-01T00:00:00.000Z").getTime();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fakeNowMs += 10 * 60 * 1000;
  vi.setSystemTime(fakeNowMs);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchStripeSubscriptionByUserId", () => {
  it("サブスクリプション情報を返す", async () => {
    const row = {
      status: "active",
      cancel_at_period_end: false,
      current_period_end: "2026-09-01T00:00:00+00:00",
    };
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: row, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toEqual(row);
    expect(result.error).toBeNull();
  });

  it("サブスクリプションが無い場合はnullを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it("DBエラー時はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("createCheckoutSession", () => {
  // 月中の登録を想定した固定時刻（アンカーまで十分な余裕があり、日割り額が最低請求額を
  // 下回らないケース）。個別テストで境界値を検証する際は上書きする
  const midMonth = new Date("2026-08-10T00:00:00.000Z");
  /** Checkout Sessionの有効期間（Stripeの最低30分＋安全マージン2分） */
  const sessionLifetimeMs = 32 * 60 * 1000;

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockPricesRetrieve.mockReset();
    mockPrice();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Customerを指定して作成し、customer_emailは渡さない（Customerの一意性を保つため）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    const result = await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing");
    expect(params).not.toHaveProperty("customer_email");
  });

  it("billing_cycle_anchor_configを定数どおりに渡す", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.billing_cycle_anchor_config).toEqual({
      day_of_month: 27,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("日割り額が最低請求額以上のときはproration_behaviorがcreate_prorationsになる", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("create_prorations");
  });

  it("アンカー直前（日割り額が最低請求額を下回る）の登録はproration_behaviorがnoneになる", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    // 27日 0:00 UTC の30分前 = 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const justBeforeAnchor = new Date("2026-08-26T23:30:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "cus_existing", justBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("none");
  });

  it("expires_atを常に32分後に固定する（claimのTTLより短く保ち二重契約の窓を塞ぐ）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.expires_at).toBe(Math.floor((midMonth.getTime() + sessionLifetimeMs) / 1000));
  });

  it("Checkout Sessionの有効期限はclaimのTTLより短い（TTL経過時に古いセッションが必ず失効する）", () => {
    expect(sessionLifetimeMs).toBeLessThan(CHECKOUT_CLAIM_TTL_MINUTES * 60 * 1000);
  });

  it("アンカー直前でもexpires_atは32分後（アンカーを跨ぐ猶予はStripeの最低30分要件の範囲内）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    // アンカー30分前。無償化ウィンドウ内だが、有効期限は一律32分後（アンカーの2分後）となる
    const justBeforeAnchor = new Date("2026-08-26T23:30:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "cus_existing", justBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.expires_at).toBe(
      Math.floor(new Date("2026-08-27T00:02:00.000Z").getTime() / 1000)
    );
  });

  it("Price取得に失敗した場合はcreate_prorationsにフォールバックし、Checkout作成自体は継続する", async () => {
    mockPricesRetrieve.mockReset();
    mockPricesRetrieve.mockRejectedValue(new Error("Stripe API一時エラー"));
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    const result = await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("create_prorations");
  });

  it("Stripeのエラーはそのままthrowする（Customerの作り直しは呼び出し元の責務）", async () => {
    mockSessionsCreate.mockRejectedValue(
      new MockStripeError({ message: "No such price", code: "resource_missing", param: "price" })
    );

    await expect(createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth)).rejects.toThrow(
      "No such price"
    );
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("claimCheckoutSlot", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  const uniqueViolation = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ミラー行が無い場合はINSERTで処理権を確保する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: { stripe_customer_id: null }, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimCheckoutSlot(5, now);

    expect(result).toEqual({
      outcome: "claimed",
      claimedAt: now.toISOString(),
      stripeCustomerId: null,
    });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 5,
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
    });
  });

  it("解放済みの行が残っている場合は奪い直し、保存済みCustomerを再利用する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: null, error: uniqueViolation },
          { data: [{ stripe_customer_id: "cus_old" }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimCheckoutSlot(5, now);

    expect(result).toEqual({
      outcome: "claimed",
      claimedAt: now.toISOString(),
      stripeCustomerId: "cus_old",
    });
    // 解放済み（checkout_claimed_at IS NULL）の行だけを対象にしていること
    const builder = mockClient.from.mock.results[1].value;
    expect(builder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
  });

  it("有効な処理権が生きている場合はconflictを返す（二重Checkoutの防止）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: null, error: uniqueViolation },
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimCheckoutSlot(5, now);

    expect(result).toEqual({ outcome: "conflict" });
  });

  it("TTLを超えて放置された処理権は奪い直せる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: null, error: uniqueViolation },
          { data: [], error: null },
          { data: [{ stripe_customer_id: "cus_old" }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimCheckoutSlot(5, now);

    expect(result).toEqual({
      outcome: "claimed",
      claimedAt: now.toISOString(),
      stripeCustomerId: "cus_old",
    });
    const builder = mockClient.from.mock.results[2].value;
    expect(builder.lt).toHaveBeenCalledWith(
      "checkout_claimed_at",
      new Date(now.getTime() - CHECKOUT_CLAIM_TTL_MINUTES * 60 * 1000).toISOString()
    );
  });

  it("一意制約違反以外のDBエラーはerrorを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimCheckoutSlot(5, now);

    expect(result).toEqual({ outcome: "error", message: dbError.message });
  });

  it("SUPABASE_SERVICE_ROLE_KEY未設定時はthrowする（Cookieクライアントへの暗黙のフォールバック防止）", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    await expect(claimCheckoutSlot(5, now)).rejects.toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("claimCheckoutSlot（並行リクエスト）", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("同一ユーザーの並行リクエストでは片方だけが処理権を確保できる", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createRaceSupabaseClient() as never);

    const [first, second] = await Promise.all([
      claimCheckoutSlot(5, now),
      claimCheckoutSlot(5, now),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["claimed", "conflict"]);
  });

  it("処理権を解放すれば再度確保できる（Checkout作成失敗後のリトライ）", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createRaceSupabaseClient() as never);

    const first = await claimCheckoutSlot(5, now);
    expect(first.outcome).toBe("claimed");
    expect((await claimCheckoutSlot(5, now)).outcome).toBe("conflict");

    if (first.outcome !== "claimed") {
      throw new Error("claim できていること");
    }
    await releaseCheckoutSlot(5, first.claimedAt);

    expect((await claimCheckoutSlot(5, now)).outcome).toBe("claimed");
  });

  it("TTL経過前は解放されていない処理権を奪えない", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createRaceSupabaseClient() as never);

    expect((await claimCheckoutSlot(5, now)).outcome).toBe("claimed");

    const beforeTtl = new Date(now.getTime() + (CHECKOUT_CLAIM_TTL_MINUTES - 1) * 60 * 1000);
    expect((await claimCheckoutSlot(5, beforeTtl)).outcome).toBe("conflict");

    const afterTtl = new Date(now.getTime() + (CHECKOUT_CLAIM_TTL_MINUTES + 1) * 60 * 1000);
    expect((await claimCheckoutSlot(5, afterTtl)).outcome).toBe("claimed");
  });
});

describe("releaseCheckoutSlot", () => {
  const claimedAt = "2026-08-10T00:00:00.000Z";

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("自分の処理権だけを解放する（行は消さずCustomerを残す）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseCheckoutSlot(5, claimedAt);

    expect(result).toEqual({ error: null });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ checkout_claimed_at: null });
    expect(builder.eq).toHaveBeenCalledWith("user_id", 5);
    expect(builder.eq).toHaveBeenCalledWith("status", CHECKOUT_PENDING_STATUS);
    expect(builder.eq).toHaveBeenCalledWith("checkout_claimed_at", claimedAt);
  });

  it("DBエラー時はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseCheckoutSlot(5, claimedAt);

    expect(result).toEqual({ error: dbError.message });
  });
});

describe("createCheckoutSessionForUser", () => {
  const claimedAt = "2026-08-10T00:00:00.000Z";
  const now = new Date("2026-08-10T00:00:00.000Z");

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockCustomersCreate.mockReset();
    mockPricesRetrieve.mockReset();
    mockPrice();
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("保存済みCustomerがある場合は新規作成せず再利用する", async () => {
    const result = await createCheckoutSessionForUser(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_existing",
      claimedAt,
      now
    );

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate.mock.calls[0][0].customer).toBe("cus_existing");
  });

  it("Customer未確保の場合は作成してミラー行へ保存し、そのCustomerでCheckoutを作る", async () => {
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: [{ id: 1 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createCheckoutSessionForUser(
      5,
      "auth-uuid",
      "trial@example.com",
      null,
      claimedAt,
      now
    );

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      {
        email: "trial@example.com",
        metadata: { user_id: "5", auth_id: "auth-uuid" },
      },
      { idempotencyKey: "checkout-customer-5" }
    );
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ stripe_customer_id: "cus_new" });
    expect(builder.eq).toHaveBeenCalledWith("checkout_claimed_at", claimedAt);
    expect(mockSessionsCreate.mock.calls[0][0].customer).toBe("cus_new");
  });

  it("Customerを保存できなかった場合はCheckoutを作らずthrowする（孤児Customerを作らない）", async () => {
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(
      createCheckoutSessionForUser(5, "auth-uuid", "trial@example.com", null, claimedAt, now)
    ).rejects.toThrow("Stripe Customerの保存に失敗しました");
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("処理権を奪われていた場合（更新0行）はCheckoutを作らずthrowする", async () => {
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(
      createCheckoutSessionForUser(5, "auth-uuid", "trial@example.com", null, claimedAt, now)
    ).rejects.toThrow("Checkout作成の処理権が失われました");
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("保存済みCustomerがStripe側に存在しない場合は作り直して保存し、1度だけ再試行する", async () => {
    mockSessionsCreate.mockReset();
    mockSessionsCreate
      .mockRejectedValueOnce(
        new MockStripeError({
          message: "No such customer",
          code: "resource_missing",
          param: "customer",
        })
      )
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/fallback" });
    mockCustomersCreate.mockResolvedValue({ id: "cus_replacement" });
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: [{ id: 1 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createCheckoutSessionForUser(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_deleted",
      claimedAt,
      now
    );

    expect(result).toEqual({ url: "https://checkout.stripe.com/fallback" });
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "checkout-customer-5-replace-cus_deleted",
    });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
    expect(mockSessionsCreate.mock.calls[1][0].customer).toBe("cus_replacement");
  });

  it("Customer以外のStripeエラーは再試行せずthrowする", async () => {
    mockSessionsCreate.mockReset();
    mockSessionsCreate.mockRejectedValue(
      new MockStripeError({ message: "No such price", code: "resource_missing", param: "price" })
    );

    await expect(
      createCheckoutSessionForUser(
        5,
        "auth-uuid",
        "trial@example.com",
        "cus_existing",
        claimedAt,
        now
      )
    ).rejects.toThrow("No such price");
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("isProrationBelowMinimum", () => {
  beforeEach(() => {
    mockPricesRetrieve.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("月中の登録では最低請求額を下回らない", async () => {
    mockPrice();

    const result = await isProrationBelowMinimum(new Date("2026-08-10T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("アンカー30分前の登録は最低請求額を下回る（遠く下回る側のサニティチェック）", async () => {
    mockPrice();

    // 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(true);
  });

  it("アンカー24時間前の登録は最低請求額を下回らない（遠く下回らない側のサニティチェック）", async () => {
    mockPrice();

    // 月額3000円換算（7月分の周期は31日）で日割り額は約97円（¥50以上）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("日割り額がちょうど49円のとき（¥50未満の境界）はtrueを返す", async () => {
    mockPrice();

    // 7月分の周期(31日=2,678,400,000ms)に対し、remainingMs = 49 * 892,800 = 43,747,200ms
    // ちょうど日割り額49円（Math.round(49) = 49 < 50）になる時刻
    const result = await isProrationBelowMinimum(new Date("2026-08-26T11:50:52.800Z"));

    expect(result).toBe(true);
  });

  it("日割り額がちょうど50円のとき（¥50ちょうどの境界）はfalseを返す", async () => {
    mockPrice();

    // remainingMs = 50 * 892,800 = 44,640,000ms（=12時間24分）
    // ちょうど日割り額50円（Math.round(50) = 50。厳密な不等号 `< 50` によりfalse）になる時刻
    const result = await isProrationBelowMinimum(new Date("2026-08-26T11:36:00.000Z"));

    expect(result).toBe(false);
  });

  it("JPY以外の通貨の場合は判定できないためfalseを返す", async () => {
    mockPrice({ currency: "usd" });

    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(false);
  });

  it("1ヶ月間隔でないPrice（誤設定）の場合は判定できないためfalseを返す", async () => {
    mockPrice({ unitAmount: 30000, interval: "year" });

    // 年額換算なら本来ごく僅かな日割り額になるはずの時刻だが、月次前提が崩れるため
    // 判定自体を行わずfalseを返す
    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(false);
  });
});

describe("fetchSubscriptionPrice", () => {
  beforeEach(() => {
    mockPricesRetrieve.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("月額(1ヶ月間隔)のPriceは金額を返す", async () => {
    mockPrice();

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: 3000, currency: "jpy" });
  });

  it("月額以外の間隔のPriceはamount: nullを返す", async () => {
    mockPrice({ unitAmount: 30000, interval: "year" });

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: null, currency: "jpy" });
  });
});

describe("isStripeEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("STRIPE_ENABLEDが'true'の場合はtrueを返す", () => {
    vi.stubEnv("STRIPE_ENABLED", "true");

    expect(isStripeEnabled()).toBe(true);
  });

  it.each([
    undefined,
    "false",
    "1",
    "TRUE",
    "",
  ])("STRIPE_ENABLEDが%s（'true'以外）の場合はfalseを返す（フェイルクローズ）", (value) => {
    if (value !== undefined) {
      vi.stubEnv("STRIPE_ENABLED", value);
    }

    expect(isStripeEnabled()).toBe(false);
  });
});
