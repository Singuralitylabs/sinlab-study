import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 決済済みのまま反映されなかった処理権の自己復旧（#250）を、実物の Route Handler・
 * `claimCheckoutSlot()`・`activateUserFromCheckoutSession()` を通しで動かして検証する。
 * DB（`stripe_subscriptions` / `users`）は状態を持つインメモリのフェイク、Stripe SDK はモックで
 * 置き換える（Stripe API は実呼び出ししない）。
 *
 * 各テストは本番で確認した固定状態（`checkout_pending` のまま `complete` なセッションを保持し、
 * `stripe_subscription_id` が NULL）から始める。
 */

const {
  mockSessionsCreate,
  mockSessionsRetrieve,
  mockSessionsList,
  mockSessionsExpire,
  mockSubscriptionsRetrieve,
  mockPricesRetrieve,
  mockCustomersCreate,
  MockStripeError,
} = vi.hoisted(() => {
  class MockStripeError extends Error {
    statusCode?: number;
  }
  return {
    mockSessionsCreate: vi.fn(),
    mockSessionsRetrieve: vi.fn(),
    mockSessionsList: vi.fn(),
    mockSessionsExpire: vi.fn(),
    mockSubscriptionsRetrieve: vi.fn(),
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
    subscriptions = { retrieve: mockSubscriptionsRetrieve };
    prices = { retrieve: mockPricesRetrieve };
    customers = { create: mockCustomersCreate };
  }
  return { default: Object.assign(MockStripe, { errors: { StripeError: MockStripeError } }) };
});
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/auth/server-auth");

import { POST } from "@/app/api/stripe/checkout/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * `stripe_subscriptions`（user_id でユニーク）と `users` だけを持つ、状態付きの Supabase フェイク。
 * 条件付き UPDATE が「条件に合致する行だけを更新する」ことを再現し、claim の CAS・
 * ミラー更新の CAS をそのまま通す。
 */
function createFakeDatabase(initial: { subscription: Row; user: Row }) {
  const tables: Record<string, Row[]> = {
    stripe_subscriptions: [{ ...initial.subscription }],
    users: [{ ...initial.user }],
  };

  return {
    subscription: () => tables.stripe_subscriptions[0],
    user: () => tables.users[0],
    from(table: string) {
      let operation: "select" | "insert" | "update" = "select";
      let payload: Row = {};
      let selected = false;
      const filters: Filter[] = [];

      const run = () => {
        const rows = tables[table];
        if (operation === "insert") {
          if (table === "stripe_subscriptions" && rows.some((r) => r.user_id === payload.user_id)) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          rows.push({ ...payload });
          return { data: null, error: null };
        }
        const matched = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "select") {
          return { data: matched[0] ? { ...matched[0] } : null, error: null };
        }
        for (const row of matched) {
          Object.assign(row, payload);
        }
        return { data: selected ? matched.map((row) => ({ ...row })) : null, error: null };
      };

      const builder = {
        insert(values: Row) {
          operation = "insert";
          payload = values;
          return builder;
        },
        update(values: Row) {
          operation = "update";
          payload = values;
          return builder;
        },
        select() {
          selected = true;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        neq(column: string, value: unknown) {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        is(column: string, value: null) {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        lt(column: string, value: string) {
          filters.push((row) => typeof row[column] === "string" && (row[column] as string) < value);
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

const USER_ID = 19;
const HELD_CLAIMED_AT = "2026-09-20T00:00:00.000Z";

/** 決済は完了しているが、Webhook・successページのどちらでも反映されなかったセッション */
const paidSession = {
  id: "cs_live_paid",
  status: "complete",
  url: null,
  client_reference_id: String(USER_ID),
  metadata: { user_id: String(USER_ID), auth_id: "auth-uuid" },
  customer: "cus_19",
  subscription: "sub_19",
};

function subscriptionWithStatus(status: string) {
  return {
    id: "sub_19",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1790467200 }] },
  };
}

/** 本番で確認した固定状態 */
function stuckDatabase() {
  return createFakeDatabase({
    subscription: {
      id: 1,
      user_id: USER_ID,
      status: "checkout_pending",
      checkout_claimed_at: HELD_CLAIMED_AT,
      checkout_session_id: "cs_live_paid",
      stripe_customer_id: "cus_19",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      current_period_end: null,
    },
    user: { id: USER_ID, status: "trial", membership_type: null },
  });
}

let fakeNowMs = new Date("2099-01-01T00:00:00.000Z").getTime();

beforeEach(() => {
  vi.clearAllMocks();
  // Priceのモジュールスコープキャッシュ（5分TTL）がテスト間で残らないよう時刻を進める
  vi.useFakeTimers({ toFake: ["Date"] });
  fakeNowMs += 10 * 60 * 1000;
  vi.setSystemTime(fakeNowMs);
  vi.stubEnv("STRIPE_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid", email: "user19@example.com" },
    userId: USER_ID,
    userStatus: "trial",
    userRole: "member",
  } as never);
  mockPricesRetrieve.mockResolvedValue({
    unit_amount: 3000,
    currency: "jpy",
    recurring: { interval: "month", interval_count: 1 },
  });
  mockSessionsRetrieve.mockImplementation(async (id: string) => {
    if (id === paidSession.id) {
      return paidSession;
    }
    return { id, status: "open", url: `https://checkout.stripe.com/${id}` };
  });
  mockSessionsCreate.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.com/cs_new" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("決済済みのまま反映されなかった処理権の自己復旧（#250）", () => {
  it("Stripe側で解約済みなら、反映して処理権を解き、同じCustomerで新しいCheckoutへ案内する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("canceled"));

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/cs_new" });
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_19");
    // 保存済みCustomerを再利用し、新しいCustomerを作らない
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_19" })
    );
    // 新しい処理権が新しいセッションを保持し、解約済み契約の痕跡は残る
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_session_id: "cs_new",
      stripe_customer_id: "cus_19",
      stripe_subscription_id: "sub_19",
    });
    expect(db.subscription().checkout_claimed_at).not.toBe(HELD_CLAIMED_AT);
    // 解約済みのため昇格はしない
    expect(db.user()).toMatchObject({ status: "trial", membership_type: null });

    // 以後は通常の「手続き中」経路に戻る（同じURLを再利用し、2つ目のセッションを作らない）
    const again = await POST();
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ url: "https://checkout.stripe.com/cs_new" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("サブスクが有効なら、会員へ昇格させて再読み込みを促し、新しいセッションは作らない", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("active"));

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "お支払い済みのご契約を反映しました。ページを再読み込みしてください",
    });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "active",
      stripe_subscription_id: "sub_19",
      checkout_claimed_at: null,
      checkout_session_id: null,
    });
    expect(db.user()).toMatchObject({ status: "active", membership_type: "general" });
  });

  it("サブスクが未入金（incomplete）なら、契約の状態を反映したうえで409のまま（Checkoutは作らない）", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("incomplete"));

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "既に決済手続き中、またはご契約済みです" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "incomplete",
      stripe_subscription_id: "sub_19",
      checkout_claimed_at: null,
    });
    expect(db.user()).toMatchObject({ status: "trial" });
  });

  it("反映中にStripeが応答しなければ500を返して処理権を残し、次のリクエストで復旧する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error("Stripe API一時エラー"));

    const failed = await POST();

    expect(failed.status).toBe(500);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_claimed_at: HELD_CLAIMED_AT,
      checkout_session_id: "cs_live_paid",
    });

    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("canceled"));
    const retried = await POST();

    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ url: "https://checkout.stripe.com/cs_new" });
  });

  it("セッションid未記録で、照会で見つかった決済済みセッションのうち1件でも有効なら新しいセッションを作らない", async () => {
    const db = stuckDatabase();
    Object.assign(db.subscription(), { checkout_session_id: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    const canceledPaid = { ...paidSession, id: "cs_paid_old", subscription: "sub_old" };
    mockSessionsList.mockResolvedValue({ data: [canceledPaid, paidSession] });
    mockSubscriptionsRetrieve.mockImplementation(async (id: string) =>
      id === "sub_old"
        ? { ...subscriptionWithStatus("canceled"), id: "sub_old" }
        : subscriptionWithStatus("active")
    );

    const res = await POST();

    expect(res.status).toBe(409);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({ status: "active", stripe_subscription_id: "sub_19" });
    expect(db.user()).toMatchObject({ status: "active", membership_type: "general" });
  });
});
