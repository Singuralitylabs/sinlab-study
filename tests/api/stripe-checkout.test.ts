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

import { POST } from "@/app/api/stripe/checkout/route";
import { SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE } from "@/app/constants/stripe";
import {
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const pendingAuth = {
  user: { id: "auth-uuid", email: "trial@example.com" },
  userId: 5,
  userStatus: "pending",
  userRole: "member",
};

const claimedAt = "2026-08-10T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStripeEnabled).mockReturnValue(true);
  vi.mocked(getServerAuth).mockResolvedValue(pendingAuth as never);
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

  it("処理権の確保はStripe呼び出しより前に行う", async () => {
    const order: string[] = [];
    vi.mocked(claimCheckoutSlot).mockImplementation(async () => {
      order.push("claim");
      return { outcome: "claimed", claimedAt, stripeCustomerId: null };
    });
    vi.mocked(fetchSubscriptionPrice).mockImplementation(async () => {
      order.push("price");
      return { amount: 1500, currency: "jpy" };
    });
    vi.mocked(createCheckoutSessionForUser).mockImplementation(async () => {
      order.push("checkout");
      return { url: "https://checkout.stripe.com/xxx" };
    });

    await POST();

    expect(order).toEqual(["claim", "price", "checkout"]);
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
    vi.mocked(getServerAuth).mockResolvedValue({ ...pendingAuth, userStatus } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(claimCheckoutSlot).not.toHaveBeenCalled();
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
  });

  it("既に契約中・手続き中の場合は409を返す（二重Checkout防止）", async () => {
    vi.mocked(claimCheckoutSlot).mockResolvedValue({ outcome: "conflict" });

    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: expect.stringContaining("既に決済手続き中、またはご契約済みです"),
    });
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

  it("料金取得に失敗した場合は503を返し、処理権を解放する", async () => {
    vi.mocked(fetchSubscriptionPrice).mockRejectedValue(new Error("stripe unavailable"));

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).toHaveBeenCalledWith(5, claimedAt);
  });

  it.each([
    { amount: null, currency: "jpy" },
    { amount: 1500, currency: "usd" },
  ])("確認できない料金（amount=$amount, currency=$currency）は503を返す", async (price) => {
    vi.mocked(fetchSubscriptionPrice).mockResolvedValue(price);

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(createCheckoutSessionForUser).not.toHaveBeenCalled();
    expect(releaseCheckoutSlot).toHaveBeenCalledWith(5, claimedAt);
  });

  it("Checkoutセッションの作成に失敗した場合は500を返し、処理権を解放する", async () => {
    vi.mocked(createCheckoutSessionForUser).mockRejectedValue(new Error("stripe error"));

    const res = await POST();

    expect(res.status).toBe(500);
    expect(releaseCheckoutSlot).toHaveBeenCalledWith(5, claimedAt);
  });
});
