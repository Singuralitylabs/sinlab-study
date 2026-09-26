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
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/stripe/checkout/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

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
  /** 次の1回だけDBエラーにするテーブル（UPDATE）。反映の途中失敗を再現する */
  const failNextUpdate = new Set<string>();

  return {
    subscription: () => tables.stripe_subscriptions[0],
    user: () => tables.users[0],
    failNextUpdate: (table: string) => failNextUpdate.add(table),
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
        if (operation === "update" && failNextUpdate.delete(table)) {
          return { data: null, error: { code: "PGRST001", message: "db error" } };
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

  it("サブスクが有効なら、会員へ昇格させてsuccessページへ案内し、新しいセッションは作らない", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("active"));

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "/upgrade/success?session_id=cs_live_paid",
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

  it("セッションid未記録でも、照会で見つかった決済済みセッションが1件なら同じく復旧する", async () => {
    const db = stuckDatabase();
    Object.assign(db.subscription(), { checkout_session_id: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsList.mockResolvedValue({ data: [paidSession] });
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("canceled"));

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/cs_new" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("照会で決済済みセッションが複数見つかった場合は、何も書き換えず409のまま運用者へ通知する（途中失敗で有効な契約の上に2件目を作らせない）", async () => {
    const db = stuckDatabase();
    Object.assign(db.subscription(), { checkout_session_id: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    const canceledPaid = { ...paidSession, id: "cs_paid_old", subscription: "sub_old" };
    mockSessionsList.mockResolvedValue({ data: [canceledPaid, paidSession] });
    // 1件目は解約済み、2件目（有効）の取得は一時エラー。1件ずつ反映すると、1件目で処理権が
    // 解けた後に2件目で失敗し、次のリクエストが有効な契約の上に新しいCheckoutを作れてしまう
    mockSubscriptionsRetrieve.mockImplementation(async (id: string) => {
      if (id === "sub_old") {
        return { ...subscriptionWithStatus("canceled"), id: "sub_old" };
      }
      throw new Error("Stripe API一時エラー");
    });

    const first = await POST();
    const second = await POST();

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_claimed_at: HELD_CLAIMED_AT,
      stripe_subscription_id: null,
    });
    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
      userId: USER_ID,
      reason: "決済済みのセッションが複数あります",
      sessionIds: ["cs_paid_old", "cs_live_paid"],
    });
  });

  it("決済済みのセッションとまだ決済できるセッションが並存する場合は、後者を失効させてから復旧する（二重払いへ案内しない）", async () => {
    const db = stuckDatabase();
    Object.assign(db.subscription(), { checkout_session_id: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsList.mockResolvedValue({
      data: [
        paidSession,
        { id: "cs_open", status: "open", url: "https://checkout.stripe.com/cs_open" },
      ],
    });
    mockSessionsExpire.mockResolvedValue({ id: "cs_open", status: "expired" });
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("active"));

    const res = await POST();

    expect(mockSessionsExpire).toHaveBeenCalledWith("cs_open");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "/upgrade/success?session_id=cs_live_paid",
    });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.user()).toMatchObject({ status: "active", membership_type: "general" });
  });

  it("並存するまだ決済できるセッションを失効させられなければ、何も書き換えず409のまま", async () => {
    const db = stuckDatabase();
    Object.assign(db.subscription(), { checkout_session_id: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsList.mockResolvedValue({
      data: [
        paidSession,
        { id: "cs_open", status: "open", url: "https://checkout.stripe.com/cs_open" },
      ],
    });
    mockSessionsExpire.mockRejectedValue(new Error("Stripe API一時エラー"));

    const res = await POST();

    expect(res.status).toBe(409);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_claimed_at: HELD_CLAIMED_AT,
    });
  });

  it("セッションにsubscriptionが無い（反映が必ず失敗する）場合は、500を繰り返さず409として運用者へ通知する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsRetrieve.mockResolvedValue({ ...paidSession, subscription: null });

    const res = await POST();

    expect(res.status).toBe(409);
    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, sessionIds: ["cs_live_paid"] })
    );
    expect(db.subscription()).toMatchObject({ checkout_claimed_at: HELD_CLAIMED_AT });
  });

  it("反映で会員昇格の更新だけが失敗しても、次のリクエストでミラー行の有効な契約から再昇格する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSubscriptionsRetrieve.mockResolvedValue(subscriptionWithStatus("active"));
    db.failNextUpdate("users");

    const failed = await POST();

    // ミラー行（処理権の解除を含む）は書けたが、ユーザーはお試しのまま
    expect(failed.status).toBe(500);
    expect(db.subscription()).toMatchObject({ status: "active", checkout_claimed_at: null });
    expect(db.user()).toMatchObject({ status: "trial" });

    const retried = await POST();

    // 契約中として409を返し続けるのではなく、Stripeのライブ状態を確かめて昇格させる
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ url: "/upgrade" });
    expect(db.user()).toMatchObject({ status: "active", membership_type: "general" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });
});
