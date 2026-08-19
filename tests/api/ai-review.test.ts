import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_API_KEY_ENV, GEMINI_API_KEY_TRIAL_ENV } from "@/app/constants/gemini";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/gemini")>();
  return {
    ...actual,
    generateReview: vi.fn(),
  };
});

import { POST } from "@/app/api/ai-review/route";
import { generateReview } from "@/app/services/api/gemini";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const pendingAuth = {
  user: { id: "auth-uuid-trial" },
  userId: 3,
  userStatus: "pending",
  userRole: "member",
};

const request = (body: unknown = { submissionId: 1 }) =>
  new Request("http://localhost/api/ai-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(GEMINI_API_KEY_ENV, "");
  vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ai-review", () => {
  it("rejected ユーザーは403を返し、レビュー生成を呼ばない", async () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "アクセスが拒否されています" });
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("active で会員用キー未設定なら503（お試し用キーがあっても使わない）", async () => {
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "trial-key");
    vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "AIレビュー機能が設定されていません" });
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("pending で会員用・お試し用キーがどちらも未設定なら503", async () => {
    vi.mocked(getServerAuth).mockResolvedValue(pendingAuth as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(503);
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("未認証は401を返す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(401);
    expect(generateReview).not.toHaveBeenCalled();
  });
});
