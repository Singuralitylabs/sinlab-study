import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_API_KEY_ENV, GEMINI_API_KEY_TRIAL_ENV } from "@/app/constants/gemini";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/gemini")>();
  return { ...actual, generateGradingRubricDraft: vi.fn() };
});

import { POST } from "@/app/api/manage/contents/grading-rubric/draft/route";
import { generateGradingRubricDraft } from "@/app/services/api/gemini";
import { getServerAuth } from "@/app/services/auth/server-auth";

const auth = (userRole: string | null, userStatus = "active") => ({
  user: { id: "auth-uuid" },
  userId: 1,
  userStatus,
  userRole,
});

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/contents/grading-rubric/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = { exercise_instructions: "フォームを作る", reference_answer: "模範" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
  vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "trial-key");
  vi.mocked(getServerAuth).mockResolvedValue(auth("maintainer") as never);
  vi.mocked(generateGradingRubricDraft).mockResolvedValue([{ name: "A", description: "a" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/manage/contents/grading-rubric/draft", () => {
  it("未認証は401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(401);
    expect(generateGradingRubricDraft).not.toHaveBeenCalled();
  });

  it("member は403（コンテンツ管理権限なし）", async () => {
    vi.mocked(getServerAuth).mockResolvedValue(auth("member") as never);

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(403);
    expect(generateGradingRubricDraft).not.toHaveBeenCalled();
  });

  it("rejected は403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue(auth("admin", "rejected") as never);

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(403);
    expect(generateGradingRubricDraft).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"])("%s は下書きを取得できる（保存はしない）", async (role) => {
    vi.mocked(getServerAuth).mockResolvedValue(auth(role) as never);

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ requirements: [{ name: "A", description: "a" }] });
    expect(generateGradingRubricDraft).toHaveBeenCalledWith({
      exerciseInstructions: "フォームを作る",
      referenceAnswer: "模範",
      apiKey: "member-key",
    });
  });

  it("演習指示が空・欠落なら400", async () => {
    expect((await POST(request({ exercise_instructions: "  " }) as never)).status).toBe(400);
    expect((await POST(request({}) as never)).status).toBe(400);
    expect(generateGradingRubricDraft).not.toHaveBeenCalled();
  });

  it("会員用キー未設定なら503（お試し用キーは使わない）", async () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, "");

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(503);
    expect(generateGradingRubricDraft).not.toHaveBeenCalled();
  });

  it("生成に失敗したら502でメッセージを返し、キーは含めない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateGradingRubricDraft).mockRejectedValue(new Error("形式が不正でした"));

    const res = await POST(request(validBody) as never);

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("形式が不正でした");
    expect(text).not.toContain("member-key");
  });
});
