import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_TOTAL_BUDGET_MS,
} from "@/app/constants/gemini";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/ai-review-server");
vi.mock("@/app/services/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/gemini")>();
  return {
    ...actual,
    generateReview: vi.fn(),
  };
});

import { maxDuration, POST } from "@/app/api/ai-review/route";
import {
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
  upsertPendingAIReview,
} from "@/app/services/api/ai-review-server";
import { generateReview } from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
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

describe("POST /api/ai-review - Gemini呼び出し後のステータス遷移", () => {
  const submissionRow = {
    id: 1,
    user_id: memberAuth.userId,
    content_id: 5,
    submission_type: "url",
    url: "https://example.com/work",
    content: {
      id: 5,
      exercise_instructions: "フォームを作る",
      reference_answer: null,
    },
  };

  beforeEach(() => {
    vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
    vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
    vi.mocked(isContentVisible).mockResolvedValue(true);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          // 1回目: 提出+コンテンツ取得（.single）、2回目: 同一コンテンツへの既存提出一覧（空 = 実行済みレビューなし）
          submissions: [
            { data: submissionRow, error: null },
            { data: [], error: null },
          ],
        },
      }) as never
    );
    vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 10 });
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(true);
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);
    vi.mocked(updateAIReviewFailed).mockResolvedValue(true);
  });

  it("正常系: completed に更新し200を返す", async () => {
    vi.mocked(generateReview).mockResolvedValue({
      reviewContent: "良いです。\n総合スコア: 90/100",
      overallScore: 90,
      modelUsed: "gemini-3.6-flash",
      promptTokens: 10,
      completionTokens: 20,
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(updateAIReviewCompleted).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        overallScore: 90,
      })
    );
    expect(updateAIReviewFailed).not.toHaveBeenCalled();
  });

  it("generateReviewが例外を投げた場合（タイムアウト等）はprocessingのまま残さずfailedへ遷移し502を返す", async () => {
    // generateReview()内部でのタイムアウト検知・エラーメッセージ生成自体は
    // tests/services/api/gemini.test.ts で検証済み。ここではroute側が
    // generateReview()の失敗理由によらず一律にfailedへ遷移させることのみを確認する
    vi.mocked(generateReview).mockRejectedValue(new Error("boom"));

    const res = await POST(request() as never);

    expect(res.status).toBe(502);
    expect(updateAIReviewFailed).toHaveBeenCalledWith(10, "boom");
    expect(updateAIReviewCompleted).not.toHaveBeenCalled();
  });
});

describe("maxDurationとGEMINI_TOTAL_BUDGET_MSの整合性", () => {
  it("GEMINI_TOTAL_BUDGET_MSはDB往復等のオーバーヘッド分の余裕を残してmaxDuration未満である", () => {
    const marginMs = 5_000;
    expect(GEMINI_TOTAL_BUDGET_MS + marginMs).toBeLessThanOrEqual(maxDuration * 1000);
  });
});
