import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/stripe-server");

import { POST } from "@/app/api/stripe/portal/route";
import { createPortalSession } from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const activeAuth = {
  user: { id: "auth-uuid", email: "member@example.com" },
  userId: 5,
  userStatus: "active",
  userRole: "member",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(activeAuth as never);
  vi.mocked(createPortalSession).mockResolvedValue({ url: "https://billing.stripe.com/xxx" });
});

describe("POST /api/stripe/portal", () => {
  it("契約中のユーザーはPortalセッションを作成できる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: { stripe_customer_id: "cus_1" }, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://billing.stripe.com/xxx" });
    expect(createPortalSession).toHaveBeenCalledWith("cus_1");
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
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("rejectedユーザーは403を返す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...activeAuth, userStatus: "rejected" } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("サブスク行が無い場合は404を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const res = await POST();

    expect(res.status).toBe(404);
    expect(createPortalSession).not.toHaveBeenCalled();
  });
});
