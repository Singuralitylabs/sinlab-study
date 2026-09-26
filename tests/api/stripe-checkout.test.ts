import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
// 定数（メッセージ等）は実物のまま使い、副作用のある関数のみモックする
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  claimCheckoutSlot: vi.fn(),
  createCheckoutSessionForUser: vi.fn(),
  fetchSubscriptionPrice: vi.fn(),
  isStripeEnabled: vi.fn(),
  releaseCheckoutSlot: vi.fn(),
}));
// extractUserId（純粋関数）は実物のまま使い、反映処理のみモックする
vi.mock("@/app/services/api/stripe-webhook-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-webhook-server")>()),
  activateUserFromCheckoutSession: vi.fn(),
  claimEvent: vi.fn(),
  reactivateUserFromMirror: vi.fn(),
}));
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/stripe/checkout/route";
import { SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE } from "@/app/constants/stripe";
import {
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  reactivateUserFromMirror,
} from "@/app/services/api/stripe-webhook-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

const trialAuth = {
  user: { id: "auth-uuid", email: "trial@example.com" },
  userId: 5,
  userStatus: "trial",
  userRole: "member",
};

const claimedAt = "2026-08-10T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStripeEnabled).mockReturnValue(true);
  vi.mocked(getServerAuth).mockResolvedValue(trialAuth as never);
  vi.mocked(claimCheckoutSlot).mockResolvedValue({
    outcome: "claimed",
    claimedAt,
    stripeCustomerId: null,
  });
  vi.mocked(createCheckoutSessionForUser).mockResolvedValue({
    url: "https://checkout.stripe.com/xxx",
  });
  vi.mocked(releaseCheckoutSlot).mockResolvedValue({ error: null });
  vi.mocked(fetchSubscriptionPrice).mockResolvedValue({ amount: 1500, currency: "jpy" });
  vi.mocked(reactivateUserFromMirror).mockResolvedValue({ error: null, activated: false });
  vi.mocked(claimEvent).mockResolvedValue({ claimed: true, processedAt: claimedAt, error: null });
});

describe("POST /api/stripe/checkout", () => {
  it("お試しユーザーはCheckoutセッションを作成できる", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(createCheckoutSessionForUser).toHaveBeenCalledWith(
      5,
      "auth-uuid",
      "trial@example.com",
      null,
      claimedAt
    );
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("Checkoutセッションの作成前に処理権を確保する（料金確認はSessionを作らないため先）", async () => {
    const order: string[] = [];
    vi.mocked(fetchSubscriptionPrice).mockImplementation(async () => {
      order.push("price");
      return { amount: 1500, currency: "jpy" };
    });
    vi.mocked(claimCheckoutSlot).mockImplementation(async () => {
      order.push("claim");
      return { outcome: "claimed", claimedAt, stripeCustomerId: null };
    });
    vi.mocked(createCheckoutSessionForUser).mockImplementation(async () => {
      order.push("checkout");
      return { url: "https://checkout.stripe.com/xxx" };
    });

    await POST();

    expect(order).toEqual(["price", "claim", "checkout"]);
  });

  it("手続き中のセッションが有効な場合は同じURLを返す（2つ目のセッションを作らない）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({
      outcome: "reusable",
      url: "https://checkout.stripe.com/live",
    });

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/live" });
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("未認証の場合は401を返す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it.each(["active", "rejected"])("%sユーザーは403を返す", async (userStatus) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...trialAuth, userStatus } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it("既に契約中・手続き中の場合は409を返す（二重Checkout防止）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({ outcome: "conflict" });

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "既に決済手続き中、またはご契約済みです" });
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    // 自分が確保したものではない処理権を解放しない
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("同一ユーザーの並行リクエストでは1つだけがCheckoutセッションを作成できる", async () => {
    // 実DBのUNIQUE制約に相当する挙動（先着1件のみclaim成功）をモックで再現する
    vi.mocked(claimCheckoutSlot)
      .mockResolvedValueOnce({ outcome: "claimed", claimedAt, stripeCustomerId: null })
      .mockResolvedValue({ outcome: "conflict" });

    const [first, second] = await Promise.all([POST(), POST()]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(createCheckoutSessionForUser).toHaveBeenCalledTimes(1);
  });

  it("保存済みCustomerがある場合はそのまま渡す（新規Customerを作らせない）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({
      outcome: "claimed",
      claimedAt,
      stripeCustomerId: "cus_old",
    });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(createCheckoutSessionForUser).toHaveBeenCalledWith(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_old",
      claimedAt
    );
  });

  it("処理権の確保に失敗した場合は500を返す", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({ outcome: "error", message: "db error" });

    const res = await POST();

    expect(res.status).toBe(500);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("STRIPE_ENABLEDが無効な場合は認証チェック前に503を返す", async () => {
    vi.mocked(isStripeEnabled).mockReturnValue(false);

    const res = await POST();

    expect(res.status).toBe(503);
    expect(getServerAuth).not.toHaveBeenCalled();
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(fetchSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("料金取得に失敗した場合は503を返し、処理権を確保しない", async () => {
    vi.mocked(fetchSubscriptionPrice).mockRejectedValue(new Error("stripe unavailable"));

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it.each([
    { amount: null, currency: "jpy" },
    { amount: 1500, currency: "usd" },
  ])("確認できない料金（amount=$amount, currency=$currency）は503を返す", async (price) => {
    vi.mocked(fetchSubscriptionPrice).mockResolvedValue(price);

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("Checkoutセッションの作成に失敗した場合は500を返し、処理権を解放する", async () => {
    vi.mocked(createCheckoutSessionForUser).mockRejectedValue(new Error("stripe error"));

    const res = await POST();

    expect(res.status).toBe(500);
    expect(releaseCheckoutSlot).toHaveBeenCalledWith(5, claimedAt);
  });
});

describe("POST /api/stripe/checkout（決済済みのまま反映されていない処理権の自己復旧 #250）", () => {
  const heldClaimedAt = "2026-09-20T00:00:00+00:00";
  /** 処理権が保持している決済済みセッション（本人のもの） */
  const paidSession = {
    id: "cs_paid",
    status: "complete",
    client_reference_id: "5",
    metadata: { user_id: "5" },
    customer: "cus_1",
    subscription: "sub_1",
  };

  function mockBlocked(sessions: unknown[] = [paidSession]) {
    return {
      outcome: "blocked" as const,
      completedSessions: sessions as never,
      heldClaimedAt,
    };
  }

  const notActivated = { error: null, activated: false, currentPeriodEnd: null };

  it("サブスクが解約済みなら、反映して処理権を解除したうえで再claimし、新しいCheckoutのURLを返す", async () => {
    vi.mocked(claimCheckoutSlot)
      .mockResolvedValueOnce(mockBlocked())
      .mockResolvedValueOnce({ outcome: "claimed", claimedAt, stripeCustomerId: "cus_1" });
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue(notActivated);

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/xxx" });
    // 並行リクエストが確保し直した処理権を解除しないよう、観測した処理権を渡す
    expect(activateUserFromCheckoutSession).toHaveBeenCalledWith(paidSession, {
      expectedClaimedAt: heldClaimedAt,
    });
    expect(claimCheckoutSlot).toHaveBeenCalledTimes(2);
    expect(createCheckoutSessionForUser).toHaveBeenCalledWith(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_1",
      claimedAt
    );
  });

  it("反映はStripeの呼び出し前・再claimの前に行う（処理権の確保 → Stripe呼び出しの順を崩さない）", async () => {
    const order: string[] = [];
    vi.mocked(claimCheckoutSlot).mockImplementation(async () => {
      order.push("claim");
      return order.includes("activate")
        ? { outcome: "claimed", claimedAt, stripeCustomerId: "cus_1" }
        : mockBlocked();
    });
    vi.mocked(activateUserFromCheckoutSession).mockImplementation(async () => {
      order.push("activate");
      return notActivated;
    });
    vi.mocked(createCheckoutSessionForUser).mockImplementation(async () => {
      order.push("checkout");
      return { url: "https://checkout.stripe.com/xxx" };
    });

    await POST();

    expect(order).toEqual(["claim", "activate", "claim", "checkout"]);
  });

  it("サブスクが有効なら、反映で会員へ昇格させ、新しいセッションは作らずsuccessページへ案内する（200）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue(mockBlocked());
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
      error: null,
      activated: true,
      currentPeriodEnd: "2026-10-27T00:00:00.000Z",
    });

    const res = await POST();

    // エラー表示ではなく通常の遷移として扱えるよう200でURLを返す（successページは冪等に同じ
    // 反映を行い、次回請求日つきの完了画面を出す）
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "/upgrade/success?session_id=cs_paid" });
    // 有効な契約がある状態で再claim・新しいセッション作成をしない（二重契約の防止）
    expect(claimCheckoutSlot).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("サブスクが未入金（incomplete）なら、反映後の再claimがconflictとなり409を返す（Checkoutは作らない）", async () => {
    vi.mocked(claimCheckoutSlot)
      .mockResolvedValueOnce(mockBlocked())
      .mockResolvedValueOnce({ outcome: "conflict" });
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue(notActivated);

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "既に決済手続き中、またはご契約済みです" });
    expect(activateUserFromCheckoutSession).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it("反映処理がエラーを返した場合は500を返し、処理権は残したまま（次回のリクエストで再試行）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue(mockBlocked());
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
      error: "db error",
      activated: false,
      currentPeriodEnd: null,
    });

    const res = await POST();

    expect(res.status).toBe(500);
    expect(claimCheckoutSlot).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
    // 一時的な失敗は再試行で解消しうるため、運用者への通知はしない
    expect(sendSlackCheckoutRecoveryNotification).not.toHaveBeenCalled();
  });

  it("反映処理が例外を投げた場合（Stripe API障害等）も500を返し、処理権は残したまま", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue(mockBlocked());
    vi.mocked(activateUserFromCheckoutSession).mockRejectedValue(new Error("stripe unavailable"));

    const res = await POST();

    expect(res.status).toBe(500);
    expect(claimCheckoutSlot).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: "決済済みのセッションが複数あります",
      sessions: [paidSession, { ...paidSession, id: "cs_paid_2", subscription: "sub_2" }],
    },
    {
      reason: "セッションのユーザーが一致しません",
      sessions: [{ ...paidSession, client_reference_id: "99", metadata: { user_id: "99" } }],
    },
    {
      reason: "セッションにcustomer/subscription情報がありません",
      sessions: [{ ...paidSession, subscription: null }],
    },
  ])(
    "再試行しても結果が変わらない状態（$reason）は反映せず409を返し、運用者へ通知する",
    async ({ reason, sessions }) => {
      vi.mocked(claimCheckoutSlot).mockResolvedValue(mockBlocked(sessions));

      const res = await POST();

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "既に決済手続き中、またはご契約済みです",
      });
      expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
      expect(claimCheckoutSlot).toHaveBeenCalledTimes(1);
      expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
      expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
        userId: 5,
        reason,
        sessionIds: sessions.map((session) => session.id),
      });
    }
  );

  it("再claimでも決済済みのまま（並行する手続きが決済済みになった等）なら反映を繰り返さず409を返す", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue(mockBlocked());
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue(notActivated);

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "既に決済手続き中、またはご契約済みです" });
    expect(claimCheckoutSlot).toHaveBeenCalledTimes(2);
    expect(activateUserFromCheckoutSession).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it.each([
    { outcome: "reusable" as const, url: "https://checkout.stripe.com/live" },
    { outcome: "conflict" as const },
    { outcome: "claimed" as const, claimedAt, stripeCustomerId: null },
  ])(
    "blocked 以外（$outcome）では反映処理を呼ばない（既存経路の挙動を変えない）",
    async (claim) => {
      vi.mocked(claimCheckoutSlot).mockResolvedValue(claim);

      await POST();

      expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
      expect(claimCheckoutSlot).toHaveBeenCalledTimes(1);
    }
  );
});

describe("POST /api/stripe/checkout（契約済みなのにお試しのままの不整合の解消 #250）", () => {
  it("conflict のとき、ミラー行の有効な契約で再昇格できたら契約画面へ案内する（200）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({ outcome: "conflict" });
    vi.mocked(reactivateUserFromMirror).mockResolvedValue({ error: null, activated: true });

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "/upgrade" });
    expect(reactivateUserFromMirror).toHaveBeenCalledWith(5);
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it("再昇格しなかった・失敗した場合は従来どおり409を返す", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({ outcome: "conflict" });
    vi.mocked(reactivateUserFromMirror)
      .mockResolvedValueOnce({ error: "db error", activated: false })
      .mockRejectedValueOnce(new Error("stripe unavailable"));

    const first = await POST();
    const second = await POST();

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toEqual({
      error: "既に決済手続き中、またはご契約済みです",
    });
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it.each([
    { outcome: "reusable" as const, url: "https://checkout.stripe.com/live" },
    { outcome: "claimed" as const, claimedAt, stripeCustomerId: null },
    { outcome: "error" as const, message: "db error" },
  ])("conflict 以外（$outcome）では再昇格を試みない", async (claim) => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue(claim);

    await POST();

    expect(reactivateUserFromMirror).not.toHaveBeenCalled();
  });
});
