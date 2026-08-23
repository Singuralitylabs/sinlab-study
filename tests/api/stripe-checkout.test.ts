import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
// TERMINAL_SUBSCRIPTION_STATUSES（定数）は実物のまま使い、副作用のある関数のみモックする
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  createCheckoutSession: vi.fn(),
  fetchSubscriptionPrice: vi.fn(),
  isStripeEnabled: vi.fn(),
}));

import { POST } from "@/app/api/stripe/checkout/route";
import { SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE } from "@/app/constants/stripe";
import {
  createCheckoutSession,
  fetchSubscriptionPrice,
  isStripeEnabled,
} from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const pendingAuth = {
  user: { id: "auth-uuid", email: "trial@example.com" },
  userId: 5,
  userStatus: "pending",
  userRole: "member",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStripeEnabled).mockReturnValue(true);
  vi.mocked(getServerAuth).mockResolvedValue(pendingAuth as never);
  vi.mocked(createCheckoutSession).mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
  vi.mocked(fetchSubscriptionPrice).mockResolvedValue({ amount: 1500, currency: "jpy" });
});

describe("POST /api/stripe/checkout", () => {
  it("お試しユーザーはCheckoutセッションを作成できる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(createCheckoutSession).toHaveBeenCalledWith(5, "auth-uuid", "trial@example.com", null);
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
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each(["active", "rejected"])("%sユーザーは403を返す", async (userStatus) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...pendingAuth, userStatus } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "trialing",
    "past_due",
    "incomplete",
  ])("既に有効なサブスク行（%s）がある場合は409を返す（二重Checkout防止）", async (status) => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: { id: 1, status }, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    "canceled",
    "unpaid",
    "incomplete_expired",
  ])("解約済み等（%s）のサブスク行が残っている場合は再契約できる", async (status) => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: { id: 1, status }, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalled();
  });

  it("解約済みの既存Customerがある場合、新規作成せず再利用する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: { id: 1, status: "canceled", stripe_customer_id: "cus_old" },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_old"
    );
  });

  it("STRIPE_ENABLEDが無効な場合は認証チェック前に503を返す", async () => {
    vi.mocked(isStripeEnabled).mockReturnValue(false);

    const res = await POST();

    expect(res.status).toBe(503);
    expect(getServerAuth).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(fetchSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("料金取得に失敗した場合は503を返しCheckoutを作らない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(fetchSubscriptionPrice).mockRejectedValue(new Error("stripe unavailable"));

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    { amount: null, currency: "jpy" },
    { amount: 1500, currency: "usd" },
  ])("確認できない料金（amount=$amount, currency=$currency）は503を返す", async (price) => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(fetchSubscriptionPrice).mockResolvedValue(price);

    const res = await POST();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
