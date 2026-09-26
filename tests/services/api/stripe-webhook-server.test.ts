import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");
// TERMINAL_SUBSCRIPTION_STATUSES / ACTIVATABLE_SUBSCRIPTION_STATUSES（定数）は実物のまま使い、
// getStripeClient() のみモックする
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  getStripeClient: vi.fn(),
}));

import { getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  reactivateUserFromMirror,
  releaseEventClaim,
  revertUserToTrial,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// activateUserFromCheckoutSession
// ----------------------------------------------------------------
describe("activateUserFromCheckoutSession", () => {
  const baseSession = {
    id: "cs_123",
    client_reference_id: "1",
    metadata: { user_id: "1", auth_id: "auth-uuid" },
    customer: "cus_123",
    subscription: "sub_123",
  };

  const subscription = {
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  };

  it("既存行が無ければstripe_subscriptionsへINSERTし、usersをactive/generalに更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        // 1回目: 既存行チェック（無し）、2回目: upsert
        stripe_subscriptions: { data: null, error: null },
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    expect(result.currentPeriodEnd).toBe(new Date(1750000000 * 1000).toISOString());
    const subBuilder = mockClient.from.mock.results[1].value;
    expect(subBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 1,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        status: "active",
      })
    );
    const userBuilder = mockClient.from.mock.results[2].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "general" })
    );
    expect(userBuilder.neq).toHaveBeenCalledWith("status", "rejected");
  });

  it("同一契約（stripe_subscription_idが一致）の既存行はミラーを上書きし、昇格する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          {
            data: {
              stripe_subscription_id: "sub_123",
              status: "past_due",
              checkout_claimed_at: null,
              checkout_session_id: null,
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    const subBuilder = mockClient.from.mock.results[1].value;
    expect(subBuilder.update).toHaveBeenCalled();
    // 確認した時点の所有状態が変わっていない場合だけ書き込む（CAS）
    expect(subBuilder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
    expect(subBuilder.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
  });

  it("別の契約が現行（終端状態でない）として記録済みの場合、古いセッションのリプレイでミラーを上書きしない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: { stripe_subscription_id: "sub_other", status: "active" },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(false);
    expect(result.currentPeriodEnd).toBeNull();
    // 既存行チェックのみで、upsertは呼ばれない
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("別の契約が現行でも、既に終端状態（解約済み等）ならリプレイでの上書きを許可する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: { stripe_subscription_id: "sub_other", status: "canceled" }, error: null },
          { data: null, error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
  });

  it("Checkout手続き中（claim済み）の行はリプレイ扱いせず、ミラーを更新して昇格する", async () => {
    // claim行は stripe_subscription_id が無く status も番兵値のため、
    // 「別の現行契約が記録済み」と誤判定すると今まさに完了したCheckoutの昇格ごと失われる
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          {
            data: {
              stripe_subscription_id: null,
              status: "checkout_pending",
              checkout_claimed_at: "2026-08-10T00:00:00.000Z",
              checkout_session_id: "cs_123",
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    // ミラー更新時に処理権（claim）も解除する
    const subBuilder = mockClient.from.mock.results[1].value;
    expect(subBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        checkout_claimed_at: null,
        checkout_session_id: null,
      })
    );
    // 確認した処理権がそのまま残っている場合だけ解除する（CAS）
    expect(subBuilder.eq).toHaveBeenCalledWith("checkout_claimed_at", "2026-08-10T00:00:00.000Z");
  });

  it("確認後に行が変わった場合は書き込まず、競合が解消しなければエラーを返す（再送に委ねる）", async () => {
    // 条件付きUPDATEが0行＝確認から書き込みまでの間に処理権が動いた状況
    const existing = {
      data: {
        stripe_subscription_id: "sub_123",
        status: "past_due",
        checkout_claimed_at: null,
        checkout_session_id: null,
      },
      error: null,
    };
    const noRowUpdated = { data: [], error: null };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        // 「確認 → 0行更新」を試行回数ぶん繰り返す
        stripe_subscriptions: [
          existing,
          noRowUpdated,
          existing,
          noRowUpdated,
          existing,
          noRowUpdated,
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toContain("競合");
    expect(result.activated).toBe(false);
  });

  it("進行中のCheckout（別セッションのclaim）は古いセッションのリプレイで解除されない", async () => {
    // 解約済みユーザーが再度アップグレードを開始した直後に、古い成功ページURLを再訪した状況。
    // ここでclaimを解除すると、まだ決済可能なセッションを残したまま次のCheckoutを作れてしまう
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: {
            stripe_subscription_id: null,
            status: "checkout_pending",
            checkout_claimed_at: "2026-08-10T00:00:00.000Z",
            checkout_session_id: "cs_in_progress",
          },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(false);
    // 既存行チェックのみで、upsert（＝claimの解除）は行われない
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("client_reference_idが無い場合はmetadata.user_idにフォールバックする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      client_reference_id: null,
    } as never);

    expect(result.error).toBeNull();
  });

  it("ユーザーIDを特定できない場合はエラーを返し、DBを更新しない", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      client_reference_id: null,
      metadata: null,
    } as never);

    expect(result.error).not.toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("customer/subscription情報が無い場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      subscription: null,
    } as never);

    expect(result.error).not.toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("既存行チェックに失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBe(dbError.message);
    expect(result.activated).toBe(false);
  });

  it("stripe_subscriptions更新（upsert）に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: null, error: null },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBe(dbError.message);
    expect(result.activated).toBe(false);
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired"])(
    "サブスクが現に有効でない（%s）場合、stripe_subscriptionsのみ更新しusersは昇格しない",
    async (status) => {
      const mockClient = createMockSupabaseClient({
        tableResults: { stripe_subscriptions: { data: null, error: null } },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue({ ...subscription, status }) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result.error).toBeNull();
      expect(result.activated).toBe(false);
      // 昇格しなかった場合、currentPeriodEndは（内部的にはStripeから取得済みでも）nullを返す
      // 権限が変わっていないため、successページに実際の請求日を見せない
      expect(result.currentPeriodEnd).toBeNull();
      // 既存行チェック + upsertの2回のみで、usersへの更新は発生しない
      // （解約後のsuccessページURL再訪・コンビニ払い等の未入金checkout完了での昇格を防ぐ）
      expect(mockClient.from).toHaveBeenCalledTimes(2);
    }
  );

  describe("expectedClaimedAt（Checkout APIの自己復旧 #250）", () => {
    const heldClaimedAt = "2026-09-20T00:00:00+00:00";
    const pendingRow = (claimedAt: string | null) => ({
      stripe_subscription_id: null,
      status: "checkout_pending",
      checkout_claimed_at: claimedAt,
      checkout_session_id: null,
    });

    it("観測した処理権のままなら、通常どおりミラーを書き処理権を解除する", async () => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: pendingRow(heldClaimedAt), error: null },
            { data: [{ id: 1 }], error: null },
          ],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never, {
        expectedClaimedAt: heldClaimedAt,
      });

      expect(result).toMatchObject({ error: null, activated: true });
      const subBuilder = mockClient.from.mock.results[1].value;
      expect(subBuilder.eq).toHaveBeenCalledWith("checkout_claimed_at", heldClaimedAt);
    });

    it.each([
      ["別リクエストが確保し直した処理権", "2026-09-26T02:00:00+00:00"],
      ["解放済み", null],
    ])(
      "処理権が入れ替わっていれば（%s）何も書かず、Stripeにも問い合わせない",
      async (_label, currentClaimedAt) => {
        const retrieve = vi.fn().mockResolvedValue(subscription);
        const mockClient = createMockSupabaseClient({
          tableResults: {
            stripe_subscriptions: { data: pendingRow(currentClaimedAt), error: null },
          },
        });
        vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
        vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

        const result = await activateUserFromCheckoutSession(baseSession as never, {
          expectedClaimedAt: heldClaimedAt,
        });

        expect(result).toEqual({ error: null, activated: false, currentPeriodEnd: null });
        expect(mockClient.from).toHaveBeenCalledTimes(1);
        expect(retrieve).not.toHaveBeenCalled();
      }
    );

    it("読んだ後に処理権が入れ替わった場合は、CASで書き込めず読み直して何もしない", async () => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: pendingRow(heldClaimedAt), error: null },
            // CAS（checkout_claimed_at = heldClaimedAt）が0行＝入れ替わった
            { data: [], error: null },
            { data: pendingRow("2026-09-26T02:00:00+00:00"), error: null },
          ],
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never, {
        expectedClaimedAt: heldClaimedAt,
      });

      expect(result).toEqual({ error: null, activated: false, currentPeriodEnd: null });
      // 読み取り → CAS失敗 → 読み直しで止まり、usersは更新しない
      expect(mockClient.from).toHaveBeenCalledTimes(3);
    });
  });
});

// ----------------------------------------------------------------
// reactivateUserFromMirror
// ----------------------------------------------------------------
describe("reactivateUserFromMirror", () => {
  const liveSubscription = (status: string) => ({
    id: "sub_123",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  });
  const activeRow = {
    stripe_subscription_id: "sub_123",
    status: "active",
    checkout_claimed_at: null,
  };

  it("ミラー行が有効な契約で、Stripeのライブ状態も有効なら、ミラーを更新して昇格する", async () => {
    const retrieve = vi.fn().mockResolvedValue(liveSubscription("active"));
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: true });
    expect(retrieve).toHaveBeenCalledWith("sub_123");
    const subBuilder = mockClient.from.mock.results[1].value;
    // 読んだ時点と同じ契約・同じ状態・処理権なしのままの行だけを更新する（取得後に並行する
    // 解約Webhookが書いた canceled を、古いスナップショットで上書きしない）
    expect(subBuilder.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
    expect(subBuilder.eq).toHaveBeenCalledWith("status", "active");
    expect(subBuilder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
    const userBuilder = mockClient.from.mock.results[2].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "general" })
    );
    expect(userBuilder.neq).toHaveBeenCalledWith("status", "rejected");
  });

  it.each([
    ["行が無い", null],
    ["契約が記録されていない", { ...activeRow, stripe_subscription_id: null }],
    ["手続き中（処理権あり）", { ...activeRow, checkout_claimed_at: "2026-09-26T00:00:00+00:00" }],
    ["解約済み", { ...activeRow, status: "canceled" }],
    ["手続き中の番兵値", { ...activeRow, status: "checkout_pending" }],
  ])("ミラー行が対象外（%s）なら何もしない", async (_label, row) => {
    const retrieve = vi.fn();
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: row, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it.each(["incomplete", "past_due"])(
    "ミラー行が %s のままでも、Stripe上で有効になっていれば昇格する（Webhookが届かなかった場合）",
    async (mirrorStatus) => {
      const retrieve = vi.fn().mockResolvedValue(liveSubscription("active"));
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: { ...activeRow, status: mirrorStatus }, error: null },
            { data: [{ id: 1 }], error: null },
          ],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

      const result = await reactivateUserFromMirror(1);

      expect(result).toEqual({ error: null, activated: true });
      expect(retrieve).toHaveBeenCalledWith("sub_123");
      const subBuilder = mockClient.from.mock.results[1].value;
      expect(subBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
      expect(subBuilder.eq).toHaveBeenCalledWith("status", mirrorStatus);
    }
  );

  it("Stripeのライブ状態が有効でなければ、ミラーだけ更新して昇格しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(liveSubscription("canceled")) },
    } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("読んだ後に行が変わっていれば（更新0行）昇格しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(liveSubscription("active")) },
    } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("DBエラーはエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: dbError.message, activated: false });
  });
});

// ----------------------------------------------------------------
// syncSubscriptionStatus
// ----------------------------------------------------------------
describe("syncSubscriptionStatus", () => {
  const makeSubscription = (status: string) => ({
    id: "sub_123",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  });

  // Webhookイベントは到着順が保証されないため、イベントのスナップショットではなく
  // Stripe APIから再取得したライブ状態を使う。テストでは再取得後の状態を
  // mockGetStripeClient の引数で指定する
  const mockGetStripeClient = (liveStatus: string) => {
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ ...makeSubscription(liveStatus) }),
      },
    } as never);
  };

  it("canceledへ遷移した場合、ミラー更新に加えrevertUserToTrialを呼ぶ", async () => {
    mockGetStripeClient("canceled");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: { user_id: 7 }, error: null },
          { data: null, error: null },
        ],
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("canceled") as never);

    expect(result.error).toBeNull();
    const userBuilder = mockClient.from.mock.results[2].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trial", membership_type: null })
    );
    expect(userBuilder.eq).toHaveBeenNthCalledWith(2, "membership_type", "general");
  });

  it.each(["unpaid", "incomplete_expired"])(
    "%sへ遷移した場合もrevertUserToTrialを呼ぶ",
    async (status) => {
      mockGetStripeClient(status);
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: { user_id: 7 }, error: null },
            { data: null, error: null },
          ],
          users: { data: null, error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

      await syncSubscriptionStatus(makeSubscription(status) as never);

      const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
      expect(usersCalls).toHaveLength(1);
    }
  );

  it("past_dueの場合はミラー更新のみで降格しない", async () => {
    mockGetStripeClient("past_due");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: { user_id: 7 }, error: null },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("past_due") as never);

    expect(result.error).toBeNull();
    const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
    expect(usersCalls).toHaveLength(0);
  });

  it("イベントのスナップショットではなく、Stripe APIから再取得したライブ状態を書き込む（順序逆転対策）", async () => {
    // イベント自体は古い"active"のスナップショットだが、再取得すると既に"canceled"
    mockGetStripeClient("canceled");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: { user_id: 7 }, error: null },
          { data: null, error: null },
        ],
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await syncSubscriptionStatus(makeSubscription("active") as never);

    const subBuilder = mockClient.from.mock.results[1].value;
    expect(subBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
    // 再取得結果が終端状態のため降格まで実行される
    const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
    expect(usersCalls).toHaveLength(1);
  });

  it("該当するstripe_subscriptions行が無い場合は何もしない（イベント順序逆転対策）", async () => {
    mockGetStripeClient("active");
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("active") as never);

    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------
// revertUserToTrial
// ----------------------------------------------------------------
describe("revertUserToTrial", () => {
  it("membership_type='general'の行のみを対象にUPDATEする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trial", membership_type: null })
    );
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", 9);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "membership_type", "general");
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result.error).toBe(dbError.message);
  });
});

// ----------------------------------------------------------------
// claimEvent / releaseEventClaim
//
// event.idへの素のINSERTを「claim」として使う（upsertではないため、同一event.idの
// 並行リクエストは一意制約により片方だけが成功する＝原子的な排他制御になる）。
// ハンドラ失敗時のみreleaseEventClaimで解放し、Stripeの再送が再度claimできるようにする。
// ----------------------------------------------------------------
describe("claimEvent", () => {
  it("未処理のイベントの場合、claimに成功しclaimed=trueを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result.claimed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.processedAt).toEqual(expect.any(String));
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_1", type: "checkout.session.completed" })
    );
  });

  it("既にclaim済み（一意制約違反）でTTL内の場合、再claimせずclaimed=falseをエラー無しで返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        // 1回目: INSERTが一意制約違反、2回目: 再claim UPDATEが対象0行（TTL内のため）
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: null });
  });

  it("既にclaim済み（一意制約違反）でTTLを超えて放置されている場合、再claimしclaimed=trueを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: [{ id: "evt_1" }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result.claimed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.processedAt).toEqual(expect.any(String));
    const reclaimBuilder = mockClient.from.mock.results[1].value;
    expect(reclaimBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ processed_at: expect.any(String) })
    );
    expect(reclaimBuilder.eq).toHaveBeenCalledWith("id", "evt_1");
    expect(reclaimBuilder.lt).toHaveBeenCalledWith("processed_at", expect.any(String));
  });

  it("TTLを指定した場合は、その時間を超えて放置されたclaimだけを再claimする（通知の重複抑止用）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T04:00:00.000Z"));
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { code: "23505", message: "duplicate key" } },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("checkout_recovery_notice:1:cs_1", "notice", 60);

    expect(result).toEqual({ claimed: false, processedAt: null, error: null });
    const builder = mockClient.from.mock.results[1].value;
    expect(builder.lt).toHaveBeenCalledWith("processed_at", "2026-09-26T03:00:00.000Z");
    vi.useRealTimers();
  });

  it("再claim確認に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: dbError.message });
  });

  it("一意制約違反以外のDBエラーの場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: dbError.message });
  });
});

describe("releaseEventClaim", () => {
  it("event.idかつ自分がclaimしたprocessed_atと一致する行のみ削除する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseEventClaim("evt_1", "2026-01-01T00:00:00.000Z");

    expect(result).toEqual({ error: null });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", "evt_1");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "processed_at", "2026-01-01T00:00:00.000Z");
  });

  it("解放に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseEventClaim("evt_1", "2026-01-01T00:00:00.000Z");

    expect(result).toEqual({ error: dbError.message });
  });
});
