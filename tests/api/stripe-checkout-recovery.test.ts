import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises self-recovery of a claim left paid-but-unapplied (#250) through the real Route Handler,
 * claimCheckoutSlot() and activateUserFromCheckoutSession(). The DB is a stateful in-memory fake
 * and the Stripe SDK is mocked (no real calls). Each test starts from the state seen in production:
 * checkout_pending holding a complete session, with stripe_subscription_id NULL.
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
 * Stateful Supabase fake with only stripe_subscriptions (unique by user_id) and users. Conditional
 * UPDATEs only touch matching rows, so the claim CAS and the mirror CAS run for real.
 */
function createFakeDatabase(initial: { subscription: Row; user: Row }) {
  const tables: Record<string, Row[]> = {
    stripe_subscriptions: [{ ...initial.subscription }],
    users: [{ ...initial.user }],
    stripe_events: [],
  };
  /** Tables whose next UPDATE fails once (simulates a mid-way failure). */
  const failNextUpdate = new Set<string>();

  return {
    events: () => tables.stripe_events,
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
          const uniqueKey = table === "stripe_events" ? "id" : "user_id";
          if (table !== "users" && rows.some((r) => r[uniqueKey] === payload[uniqueKey])) {
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
        /**
         * Interprets only `col.neq.value` / `col.is.null` of PostgREST's `or`, which this test
         * uses.
         */
        or(expression: string) {
          const conditions: Filter[] = expression.split(",").map((condition) => {
            const [column, operator, value] = condition.split(".");
            if (operator === "is" && value === "null") {
              return (row) => (row[column] ?? null) === null;
            }
            if (operator === "neq") {
              // Like SQL, comparison with NULL is never true.
              return (row) => row[column] != null && row[column] !== value;
            }
            throw new Error(`未対応の or 条件: ${condition}`);
          });
          filters.push((row) => conditions.some((condition) => condition(row)));
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
        // biome-ignore lint/suspicious/noThenProperty: mimics the Supabase builder thenable
        then: (onfulfilled: (v: ReturnType<typeof run>) => unknown) =>
          Promise.resolve(run()).then(onfulfilled),
      };
      return builder;
    },
  };
}

const USER_ID = 19;
const HELD_CLAIMED_AT = "2026-09-20T00:00:00.000Z";

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
  // Advance time so the module-scope Price cache (5 min TTL) doesn't leak between tests.
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
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_19" })
    );
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_session_id: "cs_new",
      stripe_customer_id: "cus_19",
      stripe_subscription_id: "sub_19",
    });
    expect(db.subscription().checkout_claimed_at).not.toBe(HELD_CLAIMED_AT);
    expect(db.user()).toMatchObject({ status: "trial", membership_type: null });

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
    // The first is canceled and fetching the second (active) fails transiently. Applying one at a
    // time would release the claim on the first and then fail on the second, letting the next
    // request create a new Checkout on top of an active contract.
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

    expect(failed.status).toBe(500);
    expect(db.subscription()).toMatchObject({ status: "active", checkout_claimed_at: null });
    expect(db.user()).toMatchObject({ status: "trial" });

    const retried = await POST();

    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ url: "/upgrade" });
    expect(db.user()).toMatchObject({ status: "active", membership_type: "general" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("セッションのユーザーが本人と一致しない場合は、他人の契約を書き込まず409のまま運用者へ通知する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsRetrieve.mockResolvedValue({
      ...paidSession,
      client_reference_id: "99",
      metadata: { user_id: "99", auth_id: "other-auth" },
    });

    const res = await POST();

    expect(res.status).toBe(409);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(db.subscription()).toMatchObject({
      status: "checkout_pending",
      checkout_claimed_at: HELD_CLAIMED_AT,
      stripe_subscription_id: null,
    });
    expect(db.user()).toMatchObject({ status: "trial", membership_type: null });
    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
      userId: USER_ID,
      reason: "セッションのユーザーが一致しません",
      sessionIds: ["cs_live_paid"],
    });
  });

  it("Stripeがサブスクを返せない（404）恒久的な失敗は、500を繰り返さず409として運用者へ通知する", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    const notFound = Object.assign(new MockStripeError("No such subscription"), {
      statusCode: 404,
    });
    mockSubscriptionsRetrieve.mockRejectedValue(notFound);

    const res = await POST();

    expect(res.status).toBe(409);
    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Stripeが処理を拒否しました（404）" })
    );
    expect(db.subscription()).toMatchObject({ checkout_claimed_at: HELD_CLAIMED_AT });
  });

  it("自動復旧できない状態で何度押されても、運用者への通知は1回に抑える", async () => {
    const db = stuckDatabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(db as never);
    mockSessionsRetrieve.mockResolvedValue({ ...paidSession, subscription: null });

    for (let i = 0; i < 5; i++) {
      expect((await POST()).status).toBe(409);
    }

    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledTimes(1);
    expect(db.events()).toEqual([
      expect.objectContaining({ id: `checkout_recovery_notice:${USER_ID}:cs_live_paid` }),
    ]);
  });
});
