import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/onboarding-server");

import { POST } from "@/app/api/onboarding/complete/route";
import { markOnboardingCompleted } from "@/app/services/api/onboarding-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(markOnboardingCompleted).mockResolvedValue({ error: null });
});

describe("POST /api/onboarding/complete - 認可", () => {
  it("未認証は401を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(markOnboardingCompleted).not.toHaveBeenCalled();
  });

  it("userId 無しは403を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userId: null,
    } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(markOnboardingCompleted).not.toHaveBeenCalled();
  });

  it("rejected ユーザーは403を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(markOnboardingCompleted).not.toHaveBeenCalled();
  });
});

describe("POST /api/onboarding/complete - 書き込み", () => {
  it("成功時は呼び出したユーザー本人の完了を記録して200を返す", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(markOnboardingCompleted).toHaveBeenCalledWith(memberAuth.userId);
    expect(await res.json()).toEqual({ success: true });
  });

  it("member 以外のロールでも成功扱いにする", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userRole: "admin",
    } as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(markOnboardingCompleted).toHaveBeenCalledWith(memberAuth.userId);
  });

  it("DB エラー時は500を返す", async () => {
    vi.mocked(markOnboardingCompleted).mockResolvedValue({
      error: { message: "db error", code: "PGRST001" },
    } as never);

    const res = await POST();

    expect(res.status).toBe(500);
  });
});
