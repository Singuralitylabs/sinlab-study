import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const {
  mockSessionsCreate,
  mockSessionsRetrieve,
  mockSessionsList,
  mockSessionsExpire,
  mockPricesRetrieve,
  mockCustomersCreate,
  MockStripeError,
} = vi.hoisted(() => {
  class MockStripeError extends Error {
    code?: string;
    param?: string;
    statusCode?: number;
    constructor(opts: { message: string; code?: string; param?: string; statusCode?: number }) {
      super(opts.message);
      this.code = opts.code;
      this.param = opts.param;
      this.statusCode = opts.statusCode;
    }
  }
  return {
    mockSessionsCreate: vi.fn(),
    mockSessionsRetrieve: vi.fn(),
    mockSessionsList: vi.fn(),
    mockSessionsExpire: vi.fn(),
    mockPricesRetrieve: vi.fn(),
    mockCustomersCreate: vi.fn(),
    MockStripeError,
  };
});

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: mockSessionsCreate,
        retrieve: mockSessionsRetrieve,
        list: mockSessionsList,
        expire: mockSessionsExpire,
      },
    };
    prices = { retrieve: mockPricesRetrieve };
    customers = { create: mockCustomersCreate };
  }
  return { default: Object.assign(MockStripe, { errors: { StripeError: MockStripeError } }) };
});

vi.mock("@/app/services/api/supabase-server");

import {
  CHECKOUT_CLAIM_TTL_MS,
  CHECKOUT_PENDING_STATUS,
  claimCheckoutSlot,
  createCheckoutSession,
  createCheckoutSessionForUser,
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  isProrationBelowMinimum,
  isStripeEnabled,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
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
  checkout_session_id: string | null;
  stripe_customer_id: string | null;
};

/**
 * `stripe_subscriptions` の1行だけを保持するインメモリのSupabaseモック。
 * claim/release の排他は `user_id` のUNIQUE制約（重複INSERTは23505）と、条件付きUPDATEが
 * 「条件に合致する行が無ければ0行」になることに依存しているため、固定応答のモックでは
 * 並行リクエストやステータス絞り込みの挙動を検証できない。ここではその2点を再現する。
 *
 * @param initialRow 事前に存在する行（再契約・契約中ユーザーの検証用）
 */
function createRaceSupabaseClient(initialRow?: Partial<FakeSubscriptionRow>) {
  let row: FakeSubscriptionRow | null = initialRow
    ? {
        status: "canceled",
        checkout_claimed_at: null,
        checkout_session_id: null,
        stripe_customer_id: null,
        ...initialRow,
      }
    : null;

  return {
    getRow: () => row,
    from: () => {
      let operation: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      let statuses: string[] | null = null;
      let claimFilter: { kind: "released" } | { kind: "before"; value: string } | null = null;
      let selected = false;
      const equals: Record<string, unknown> = {};

      const matchesEquals = (current: FakeSubscriptionRow) =>
        Object.entries(equals).every(
          ([column, value]) =>
            column === "user_id" || current[column as keyof FakeSubscriptionRow] === value
        );

      const run = () => {
        const current = row;
        if (operation === "insert") {
          if (current) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          row = {
            status: String(payload.status),
            checkout_claimed_at: (payload.checkout_claimed_at as string | null) ?? null,
            checkout_session_id: null,
            stripe_customer_id: null,
          };
          return { data: null, error: null };
        }
        if (operation === "select") {
          return { data: current && matchesEquals(current) ? { ...current } : null, error: null };
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
                current.checkout_claimed_at < claimFilter.value;
          const claimableByEquals = claimFilter === null && matchesEquals(current);
          if (!statuses.includes(current.status) || !(claimable || claimableByEquals)) {
            return { data: [], error: null };
          }
          row = { ...current, ...payload } as FakeSubscriptionRow;
          return { data: [{ stripe_customer_id: current.stripe_customer_id }], error: null };
        }
        // Customer保存・セッションid保存・releaseなど、等値条件のみのUPDATE
        if (!matchesEquals(current)) {
          return { data: selected ? [] : null, error: null };
        }
        row = { ...current, ...payload } as FakeSubscriptionRow;
        return { data: selected ? [{ id: 1 }] : null, error: null };
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
        select: () => {
          selected = true;
          return builder;
        },
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
          claimFilter = { kind: "before", value };
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
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });

    const result = await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing");
    expect(params).not.toHaveProperty("customer_email");
  });

  it("billing_cycle_anchor_configを定数どおりに渡す", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });

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
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });

    await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("create_prorations");
  });

  it("アンカー直前（日割り額が最低請求額を下回る）の登録はproration_behaviorがnoneになる", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });
    // 27日 0:00 UTC の30分前 = 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const justBeforeAnchor = new Date("2026-08-26T23:30:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "cus_existing", justBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("none");
  });

  it("expires_atを常に32分後に固定する（claimのTTLより短く保ち二重契約の窓を塞ぐ）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });

    await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.expires_at).toBe(Math.floor((midMonth.getTime() + sessionLifetimeMs) / 1000));
  });

  it("Checkout Sessionの有効期限はclaimのTTLより短い（TTL経過時に古いセッションが必ず失効する）", () => {
    // TTLは有効期限からの導出値のため、この不等号は構造的に保たれる（回帰検知用の確認）
    expect(sessionLifetimeMs).toBeLessThan(CHECKOUT_CLAIM_TTL_MS);
  });

  it("アンカー直前でもexpires_atは32分後（アンカーを跨ぐ猶予はStripeの最低30分要件の範囲内）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });
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
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });

    const result = await createCheckoutSession(5, "auth-uuid", "cus_existing", midMonth);

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx", id: "cs_test" });
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
    mockSessionsRetrieve.mockReset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ミラー行が無い場合はINSERTで処理権を確保する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
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
    const builder = mockClient.from.mock.results[1].value;
    // 契約が記録されていない行だけを対象にし、解放済み（NULL）の行を奪う
    expect(builder.in).toHaveBeenCalledWith("status", NON_CURRENT_SUBSCRIPTION_STATUSES);
    expect(builder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
    // 復帰しうる契約の痕跡（subscription id・期間末）は消さない
    expect(builder.update).toHaveBeenCalledWith({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: null,
    });
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

describe("claimCheckoutSlot（既存行の状態別）", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  beforeEach(() => {
    mockSessionsRetrieve.mockReset();
    mockSessionsList.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["active", "trialing", "past_due", "incomplete"])(
    "契約が記録されている行（%s）は奪わずconflictを返す",
    async (status) => {
      const fake = createRaceSupabaseClient({ status, stripe_customer_id: "cus_1" });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

      const result = await claimCheckoutSlot(5, now);

      expect(result).toEqual({ outcome: "conflict" });
      expect(fake.getRow()?.status).toBe(status);
      expect(mockSessionsRetrieve).not.toHaveBeenCalled();
    }
  );

  it.each(["canceled", "unpaid", "incomplete_expired", "paused"])(
    "契約が終わっている行（%s）は再契約のために奪える",
    async (status) => {
      const fake = createRaceSupabaseClient({ status, stripe_customer_id: "cus_1" });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

      const result = await claimCheckoutSlot(5, now);

      expect(result).toMatchObject({ outcome: "claimed", stripeCustomerId: "cus_1" });
      expect(fake.getRow()?.status).toBe(CHECKOUT_PENDING_STATUS);
    }
  );

  it("手続き中のセッションがまだ有効なら、新しく作らず同じURLを再利用する", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: "cs_live",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsRetrieve.mockResolvedValue({
      id: "cs_live",
      status: "open",
      url: "https://checkout.stripe.com/live",
    });

    const result = await claimCheckoutSlot(5, new Date(now.getTime() + 60 * 1000));

    expect(result).toEqual({ outcome: "reusable", url: "https://checkout.stripe.com/live" });
    expect(mockSessionsRetrieve).toHaveBeenCalledWith("cs_live");
    // claimは奪わない（確保時刻は元のまま）
    expect(fake.getRow()?.checkout_claimed_at).toBe(now.toISOString());
  });

  it("手続き中のセッションが失効していれば、TTLを待たずに奪える", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: "cs_expired",
      stripe_customer_id: "cus_1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsRetrieve.mockResolvedValue({ id: "cs_expired", status: "expired", url: null });

    const claimedAt = new Date(now.getTime() + 60 * 1000);
    const result = await claimCheckoutSlot(5, claimedAt);

    expect(result).toMatchObject({ outcome: "claimed", stripeCustomerId: "cus_1" });
    expect(fake.getRow()?.checkout_claimed_at).toBe(claimedAt.toISOString());
    expect(fake.getRow()?.checkout_session_id).toBeNull();
  });

  it("決済済みで反映待ちのセッションは奪わない（決済済みの上に2件目を作らせない）", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: "cs_paid",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsRetrieve.mockResolvedValue({ id: "cs_paid", status: "complete", url: null });

    // TTLを超えた時刻でも奪わない
    const result = await claimCheckoutSlot(5, new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS + 1));

    expect(result).toEqual({ outcome: "conflict" });
    expect(fake.getRow()?.checkout_claimed_at).toBe(now.toISOString());
  });

  it("セッションid未記録でも、Customerに紐づく有効なセッションがあれば再利用する", async () => {
    // セッション作成後・記録前に落ちた場合の復旧。記録漏れのまま新しいセッションを作らない
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: null,
      stripe_customer_id: "cus_1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsList.mockResolvedValue({
      data: [{ id: "cs_untracked", status: "open", url: "https://checkout.stripe.com/untracked" }],
    });

    const result = await claimCheckoutSlot(5, new Date(now.getTime() + 60 * 1000));

    expect(result).toEqual({ outcome: "reusable", url: "https://checkout.stripe.com/untracked" });
    // 処理権の確保時刻以降に作られたセッションだけを対象にする（過去の契約を拾わない）
    expect(mockSessionsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", created: { gte: expect.any(Number) } })
    );
    expect(fake.getRow()?.checkout_claimed_at).toBe(now.toISOString());
  });

  it("セッションid未記録で有効なセッションが無ければ、TTLを待たずに奪える", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: null,
      stripe_customer_id: "cus_1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsList.mockResolvedValue({ data: [] });

    const claimedAt = new Date(now.getTime() + 60 * 1000);
    const result = await claimCheckoutSlot(5, claimedAt);

    expect(result).toMatchObject({ outcome: "claimed", stripeCustomerId: "cus_1" });
    expect(fake.getRow()?.checkout_claimed_at).toBe(claimedAt.toISOString());
  });

  it("セッションid未記録でも、決済済みのセッションがあれば奪わない", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: null,
      stripe_customer_id: "cus_1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsList.mockResolvedValue({
      data: [{ id: "cs_paid", status: "complete", url: null }],
    });

    const result = await claimCheckoutSlot(5, new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS + 1));

    expect(result).toEqual({ outcome: "conflict" });
  });

  it("セッションもCustomerも記録されていない手続き中の行は、TTL経過後にのみ奪える", async () => {
    // Customerが無い＝Stripeへ照会する手がかりが無いため、TTLによる救済に委ねる
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: null,
      stripe_customer_id: null,
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

    const beforeTtl = new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS - 60 * 1000);
    expect(await claimCheckoutSlot(5, beforeTtl)).toEqual({ outcome: "conflict" });

    const afterTtl = new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS + 60 * 1000);
    expect(await claimCheckoutSlot(5, afterTtl)).toMatchObject({ outcome: "claimed" });
    expect(mockSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("Stripeへ問い合わせられない場合もTTLによる救済は働く", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: now.toISOString(),
      checkout_session_id: "cs_unknown",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);
    mockSessionsRetrieve.mockRejectedValue(new Error("Stripe API一時エラー"));

    const beforeTtl = new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS - 60 * 1000);
    expect(await claimCheckoutSlot(5, beforeTtl)).toEqual({ outcome: "conflict" });

    const afterTtl = new Date(now.getTime() + CHECKOUT_CLAIM_TTL_MS + 60 * 1000);
    expect(await claimCheckoutSlot(5, afterTtl)).toMatchObject({ outcome: "claimed" });
  });
});

describe("claimCheckoutSlot（並行リクエスト）", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  beforeEach(() => {
    mockSessionsRetrieve.mockReset();
    mockSessionsList.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
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
    // セッション未記録の間は再利用もできないため、後発は待たされる（二重作成はしない）
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
    expect(builder.update).toHaveBeenCalledWith({
      checkout_claimed_at: null,
      checkout_session_id: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("user_id", 5);
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
    mockSessionsExpire.mockReset();
    mockCustomersCreate.mockReset();
    mockPricesRetrieve.mockReset();
    mockPrice();
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx", id: "cs_new" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("保存済みCustomerがある場合は新規作成せず再利用し、セッションidを記録する", async () => {
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: claimedAt,
      stripe_customer_id: "cus_existing",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

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
    // 次のリクエストが有効性を確認できるよう、確保したセッションを記録する
    expect(fake.getRow()?.checkout_session_id).toBe("cs_new");
  });

  it("Customer未確保の場合は作成してミラー行へ保存し、そのCustomerでCheckoutを作る", async () => {
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: claimedAt,
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

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
      // ユーザー単位で固定しつつ、パラメータ（メール）が変わればkeyも変わる
      { idempotencyKey: expect.stringMatching(/^checkout-customer-5-[0-9a-f]{16}$/) }
    );
    expect(fake.getRow()?.stripe_customer_id).toBe("cus_new");
    expect(mockSessionsCreate.mock.calls[0][0].customer).toBe("cus_new");
  });

  it("メールアドレスが異なればidempotency keyも変わる", async () => {
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: claimedAt,
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

    await createCheckoutSessionForUser(5, "auth-uuid", "a@example.com", null, claimedAt, now);
    await createCheckoutSessionForUser(5, "auth-uuid", "b@example.com", null, claimedAt, now);

    const [first, second] = mockCustomersCreate.mock.calls.map((call) => call[1].idempotencyKey);
    expect(first).not.toBe(second);
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
          statusCode: 404,
        })
      )
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/fallback", id: "cs_fallback" });
    mockCustomersCreate.mockResolvedValue({ id: "cus_replacement" });
    const fake = createRaceSupabaseClient({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: claimedAt,
      stripe_customer_id: "cus_deleted",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake as never);

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
      idempotencyKey: expect.stringMatching(
        /^checkout-customer-5-[0-9a-f]{16}-replace-cus_deleted$/
      ),
    });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
    expect(mockSessionsCreate.mock.calls[1][0].customer).toBe("cus_replacement");
    expect(fake.getRow()?.stripe_customer_id).toBe("cus_replacement");
  });

  it("Customer以外のStripeエラーは再試行しない。4xxは「作成されていない」と確定でき処理権を解放できる", async () => {
    mockSessionsCreate.mockReset();
    mockSessionsCreate.mockRejectedValue(
      new MockStripeError({
        message: "No such price",
        code: "resource_missing",
        param: "price",
        statusCode: 400,
      })
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
    ).rejects.toMatchObject({ name: "CheckoutCreationError", claimReleasable: true });
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("通信エラー等ではセッションが作られた可能性が残るため、処理権を解放させない", async () => {
    mockSessionsCreate.mockReset();
    // タイムアウト等でHTTPステータスを受け取れていないケース
    mockSessionsCreate.mockRejectedValue(new MockStripeError({ message: "Connection timeout" }));

    await expect(
      createCheckoutSessionForUser(
        5,
        "auth-uuid",
        "trial@example.com",
        "cus_existing",
        claimedAt,
        now
      )
    ).rejects.toMatchObject({ name: "CheckoutCreationError", claimReleasable: false });
  });

  it("セッションidを記録できない場合は、作ったセッションを失効させてから失敗する", async () => {
    // 処理権を奪われている等で0行更新になるケース
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    mockSessionsExpire.mockResolvedValue({ id: "cs_new", status: "expired" });

    await expect(
      createCheckoutSessionForUser(
        5,
        "auth-uuid",
        "trial@example.com",
        "cus_existing",
        claimedAt,
        now
      )
    ).rejects.toMatchObject({ name: "CheckoutCreationError", claimReleasable: true });
    expect(mockSessionsExpire).toHaveBeenCalledWith("cs_new");
  });

  it("失効にも失敗した場合は処理権を解放させない（有効なセッションが残りうるため）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    mockSessionsExpire.mockRejectedValue(new Error("expire failed"));

    await expect(
      createCheckoutSessionForUser(
        5,
        "auth-uuid",
        "trial@example.com",
        "cus_existing",
        claimedAt,
        now
      )
    ).rejects.toMatchObject({ name: "CheckoutCreationError", claimReleasable: false });
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

  it.each([undefined, "false", "1", "TRUE", ""])(
    "STRIPE_ENABLEDが%s（'true'以外）の場合はfalseを返す（フェイルクローズ）",
    (value) => {
      if (value !== undefined) {
        vi.stubEnv("STRIPE_ENABLED", value);
      }

      expect(isStripeEnabled()).toBe(false);
    }
  );
});
