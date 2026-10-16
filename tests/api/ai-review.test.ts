import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_REVIEW_STALE_AFTER_MS,
  GEMINI_ALTERNATE_MODEL_NAME,
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_MODEL_NAME,
  GEMINI_TOTAL_BUDGET_MS,
} from "@/app/constants/gemini";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/ai-review-server");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/services/api/progress-server", () => ({
  saveContentProgress: vi.fn().mockResolvedValue({ ok: true, contentWasAlreadyCompleted: false }),
}));
vi.mock("@/app/services/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/gemini")>();
  return {
    ...actual,
    generateReview: vi.fn(),
  };
});

import { maxDuration, POST } from "@/app/api/ai-review/route";
import {
  claimAIReview,
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
} from "@/app/services/api/ai-review-server";
import { resolveAiReviewThemeNotice } from "@/app/services/api/certificates-server";
import {
  generateReview,
  ReviewGenerationError,
  type ReviewResult,
} from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { saveContentProgress } from "@/app/services/api/progress-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const reviewResult = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
  reviewJson: {
    requirements: [{ key: "r1", name: "要件", status: "met", comment: "ok" }],
    code_quality: { level: "good", comment: "ok" },
    suggestions: [],
    advice: "next",
  },
  scoreKind: "rubric",
  rubricVersion: 2,
  reviewContent: "良いです。",
  overallScore: 100,
  passed: null,
  modelUsed: GEMINI_MODEL_NAME,
  promptTokens: 10,
  completionTokens: 20,
  thoughtsTokens: 30,
  ...overrides,
});

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const trialAuth = {
  user: { id: "auth-uuid-trial" },
  userId: 3,
  userStatus: "trial",
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

  it("trial で会員用・お試し用キーがどちらも未設定なら503", async () => {
    vi.mocked(getServerAuth).mockResolvedValue(trialAuth as never);

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
    },
  };

  beforeEach(() => {
    vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
    vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
    vi.mocked(isContentVisible).mockResolvedValue(true);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          // First call: submission + content (.single); second: existing submissions for the same
          // content (empty = no completed review).
          submissions: { data: submissionRow, error: null },
        },
      }) as never
    );
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "claimed", reviewId: 10, remaining: 1 });
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(true);
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);
    vi.mocked(updateAIReviewFailed).mockResolvedValue(true);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          learning_contents: {
            data: { grading_rubric: null, reference_answer: null },
            error: null,
          },
        },
      }) as never
    );
  });

  it("正常系: completed に更新し200を返す", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ overallScore: 90 }));

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(updateAIReviewCompleted).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        overallScore: 90,
        scoreKind: "rubric",
        rubricVersion: 2,
        passed: null,
        reviewJson: expect.objectContaining({ advice: "next" }),
        promptTokens: 10,
        completionTokens: 20,
        thoughtsTokens: 30,
      })
    );
    expect(updateAIReviewFailed).not.toHaveBeenCalled();
  });

  it("代替モデルで成功したレビューは model_used にそのモデルを保存して返す", async () => {
    vi.mocked(generateReview).mockResolvedValue(
      reviewResult({ modelUsed: GEMINI_ALTERNATE_MODEL_NAME })
    );

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateAIReviewCompleted).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ modelUsed: GEMINI_ALTERNATE_MODEL_NAME })
    );
    expect(body.review.model_used).toBe(GEMINI_ALTERNATE_MODEL_NAME);
  });

  it("全モデル失敗の混雑文言は failed に記録し、受講生にはその文言だけ返す", async () => {
    const message = "AIが混み合っています。しばらく時間を置いてから再試行してください。";
    vi.mocked(generateReview).mockRejectedValue(
      new ReviewGenerationError(message, {
        promptTokens: 3,
        completionTokens: 1,
        thoughtsTokens: null,
      })
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: message });
    expect(updateAIReviewFailed).toHaveBeenCalledWith(10, message, {
      promptTokens: 3,
      completionTokens: 1,
      thoughtsTokens: null,
    });
    expect(updateAIReviewCompleted).not.toHaveBeenCalled();
  });

  it("processing への更新に失敗したら failed にして500を返し、Gemini は呼ばない", async () => {
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
    expect(generateReview).not.toHaveBeenCalled();
    expect(updateAIReviewFailed).toHaveBeenCalledWith(10, expect.stringContaining("更新に失敗"));
  });

  it("完了の保存に失敗したら成功を返さず500にする", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult());
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("保存に失敗");
    expect(updateAIReviewFailed).toHaveBeenCalledWith(
      10,
      expect.stringContaining("保存に失敗"),
      expect.objectContaining({ promptTokens: 10, completionTokens: 20, thoughtsTokens: 30 })
    );
  });

  it("合格（passed = true）なら完了を記録する", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ passed: true }));

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(saveContentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: memberAuth.userId,
        userStatus: memberAuth.userStatus,
        userRole: memberAuth.userRole,
        contentId: 5,
        isCompleted: true,
        scheduleCertificate: false,
      })
    );
  });

  it("不合格では完了を記録しない", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ passed: false }));

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(saveContentProgress).not.toHaveBeenCalled();
  });

  it("完了の保存に失敗してもレビューは 200 のまま", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ passed: true, overallScore: 90 }));
    vi.mocked(saveContentProgress).mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "進捗の更新に失敗しました",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.review).toMatchObject({ status: "completed", passed: true, overall_score: 90 });
  });

  it("完了の保存が例外を投げてもレビューは 200 のまま", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ passed: true }));
    vi.mocked(saveContentProgress).mockRejectedValueOnce(new Error("progress down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("レスポンスには構造化結果を含めるがトークン数は含めない", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult());

    const res = await POST(request() as never);
    const body = await res.json();

    expect(body.review).toMatchObject({
      score_kind: "rubric",
      rubric_version: 2,
      passed: null,
      review_json: expect.objectContaining({ advice: "next" }),
    });
    expect(JSON.stringify(body)).not.toMatch(/tokens/i);
  });

  it("コンテンツの採点基準を検証して generateReview に渡す（不正な値は null 扱い）", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult());
    const rubric = {
      version: 2,
      requirements: [{ key: "r1", name: "要件", description: "" }],
    };
    const withRubric = (grading_rubric: unknown) =>
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(
        createMockSupabaseClient({
          tableResults: {
            learning_contents: {
              data: { grading_rubric, reference_answer: null },
              error: null,
            },
          },
        }) as never
      );

    withRubric(rubric);
    await POST(request() as never);
    expect(vi.mocked(generateReview).mock.calls[0][0].gradingRubric).toEqual(rubric);

    withRubric({ requirements: "broken" });
    await POST(request() as never);
    expect(vi.mocked(generateReview).mock.calls[1][0].gradingRubric).toBeNull();
  });

  it("generateReviewが例外を投げた場合（タイムアウト等）はprocessingのまま残さずfailedへ遷移し502を返す", async () => {
    // Timeout detection and error messages inside generateReview() are covered in
    // tests/services/api/gemini.test.ts; here only check that the route always moves to failed
    // regardless of why generateReview() failed.
    vi.mocked(generateReview).mockRejectedValue(new Error("boom"));

    const res = await POST(request() as never);

    expect(res.status).toBe(502);
    expect(updateAIReviewFailed).toHaveBeenCalledWith(10, "boom", undefined);
    expect(updateAIReviewCompleted).not.toHaveBeenCalled();
  });

  it("検証失敗で ReviewGenerationError になった場合は消費トークンを failed 行に記録する", async () => {
    const usage = { promptTokens: 200, completionTokens: 20, thoughtsTokens: 100 };
    vi.mocked(generateReview).mockRejectedValue(
      new ReviewGenerationError("AIレビューの結果の形式が不正でした", usage)
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(502);
    expect(updateAIReviewFailed).toHaveBeenCalledWith(
      10,
      "AIレビューの結果の形式が不正でした",
      usage
    );
  });

  it("completed の応答に発行結果を足しても、レビュー本体は completed のまま", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ passed: true }));
    vi.mocked(resolveAiReviewThemeNotice).mockResolvedValue({
      themeId: 5,
      themeName: "テーマ",
      certificateId: 31,
      blockedByMissingName: false,
      remaining: {
        incompleteContents: 0,
        unsubmittedExercises: 0,
        exercisesNeedingRetry: 0,
      },
    });

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.review.status).toBe("completed");
    expect(body.themeCompletion.certificateId).toBe(31);
    expect(resolveAiReviewThemeNotice).toHaveBeenCalledWith(
      expect.objectContaining({ contentId: 5, passed: true })
    );
  });

  it("発行やメールが失敗しても completed の成否は変えない", async () => {
    vi.mocked(generateReview).mockResolvedValue(reviewResult());
    vi.mocked(resolveAiReviewThemeNotice).mockRejectedValue(new Error("mail down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.review.status).toBe("completed");
    expect(body.themeCompletion).toBeUndefined();
    expect(updateAIReviewFailed).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-review - 回数制限と枠の確保（#304 / #343）", () => {
  // 2026-10-12 14:00 JST; the JST day started at 2026-10-11T15:00:00Z.
  const NOW = new Date("2026-10-12T05:00:00Z");

  const submissionRow = (userId: number, submissionId = 1) => ({
    id: submissionId,
    user_id: userId,
    content_id: 5,
    submission_type: "url",
    url: "https://example.com/work",
    content: { id: 5, exercise_instructions: "フォームを作る" },
  });

  const setup = ({
    auth,
    submissionId = 1,
  }: {
    auth: typeof memberAuth;
    submissionId?: number;
  }) => {
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: { data: submissionRow(auth.userId, submissionId), error: null },
      },
    });
    vi.mocked(getServerAuth).mockResolvedValue(auth as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    return client;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "trial-key");
    vi.mocked(isContentVisible).mockResolvedValue(true);
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "claimed", reviewId: 10, remaining: 1 });
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(true);
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);
    vi.mocked(updateAIReviewFailed).mockResolvedValue(true);
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ overallScore: 80 }));
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          learning_contents: {
            data: { grading_rubric: null, reference_answer: null },
            error: null,
          },
        },
      }) as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("判定と枠の確保は claimAIReview() 1回で行い、本人・コンテンツ・状態・時刻を渡す", async () => {
    setup({ auth: memberAuth });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(claimAIReview).toHaveBeenCalledTimes(1);
    expect(claimAIReview).toHaveBeenCalledWith({
      userId: memberAuth.userId,
      submissionId: 1,
      contentId: 5,
      userStatus: "active",
      now: NOW,
    });
  });

  it("確保できたら200に確保後の残り回数を含める", async () => {
    setup({ auth: memberAuth });
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "claimed", reviewId: 10, remaining: 0 });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, remaining: 0 });
    expect(updateAIReviewProcessing).toHaveBeenCalledWith(10);
    expect(generateReview).toHaveBeenCalledTimes(1);
  });

  it("trial: お試し用キー経路のまま確保する", async () => {
    setup({ auth: trialAuth });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(claimAIReview).toHaveBeenCalledWith(expect.objectContaining({ userStatus: "trial" }));
    expect(vi.mocked(generateReview).mock.calls[0][0].apiKey).toBe("trial-key");
  });

  it.each([
    {
      label: "active の content_daily",
      auth: memberAuth,
      reason: "content_daily" as const,
      remaining: 0,
      body: {
        error: "本日のこの課題の AI レビュー回数（2 回）を使い切りました。明日また提出できます",
        reason: "content_daily",
        remaining: 0,
        resetsAt: "2026-10-12T15:00:00.000Z",
      },
    },
    {
      label: "active の user_daily",
      auth: memberAuth,
      reason: "user_daily" as const,
      remaining: 0,
      body: {
        error: "本日の AI レビュー回数の上限（10 回）に達しました。明日またご利用ください",
        reason: "user_daily",
        remaining: 0,
        resetsAt: "2026-10-12T15:00:00.000Z",
      },
    },
    {
      label: "active の submission_reviewed（resetsAt なし）",
      auth: memberAuth,
      reason: "submission_reviewed" as const,
      remaining: 1,
      body: {
        error:
          "この提出の AI レビューは実行済みです。コードを直して新しく提出すると再レビューできます",
        reason: "submission_reviewed",
        remaining: 1,
        resetsAt: null,
      },
    },
    {
      label: "trial の trial_lifetime（resetsAt なし）",
      auth: trialAuth,
      reason: "trial_lifetime" as const,
      remaining: 0,
      body: {
        error:
          "お試しプランでは AI レビューは 1 課題につき 1 回です。有料会員は 1 日 2 回まで再レビューできます",
        reason: "trial_lifetime",
        remaining: 0,
        resetsAt: null,
      },
    },
  ])("$label は429で理由・残り回数・メッセージを返し、Gemini を呼ばない", async (c) => {
    setup({ auth: c.auth });
    vi.mocked(claimAIReview).mockResolvedValue({
      kind: "limited",
      reason: c.reason,
      remaining: c.remaining,
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual(c.body);
    expect(updateAIReviewProcessing).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("同じ提出が処理中なら202を返し、新規にレビューを開始しない", async () => {
    setup({ auth: memberAuth });
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "processing", reviewId: 7 });

    const res = await POST(request() as never);

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      message: "AIレビューは現在生成中です",
      review: { id: 7, status: "processing" },
    });
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("枠を取れなかったとき（busy）は409を返し、Gemini を呼ばない", async () => {
    setup({ auth: memberAuth });
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "busy" });

    const res = await POST(request() as never);

    expect(res.status).toBe(409);
    expect(generateReview).not.toHaveBeenCalled();
    expect(updateAIReviewProcessing).not.toHaveBeenCalled();
  });

  it("他人の提出は403で、枠の確保に進まない", async () => {
    setup({ auth: { ...memberAuth, userId: 99 } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          submissions: { data: submissionRow(memberAuth.userId), error: null },
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(claimAIReview).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("非公開になったコンテンツは403で、枠を確保しない（可視性チェックを維持）", async () => {
    setup({ auth: memberAuth });
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(claimAIReview).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("枠の確保（回数の確認）に失敗したら500を返し、レビューを開始しない（fail-closed）", async () => {
    setup({ auth: memberAuth });
    vi.mocked(claimAIReview).mockResolvedValue(null);

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
    expect(generateReview).not.toHaveBeenCalled();
    expect(updateAIReviewProcessing).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-review - 単一ファイル提出の言語", () => {
  const mockSubmission = (submission: Record<string, unknown>) => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          submissions: [
            {
              data: {
                id: 1,
                user_id: memberAuth.userId,
                content_id: 5,
                submission_type: "code",
                url: null,
                ...submission,
              },
              error: null,
            },
          ],
        },
      }) as never
    );
  };

  beforeEach(() => {
    vi.stubEnv(GEMINI_API_KEY_ENV, "member-key");
    vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
    vi.mocked(isContentVisible).mockResolvedValue(true);
    vi.mocked(claimAIReview).mockResolvedValue({ kind: "claimed", reviewId: 10, remaining: 1 });
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(true);
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);
    vi.mocked(generateReview).mockResolvedValue(reviewResult({ overallScore: 80 }));
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          learning_contents: {
            data: { grading_rubric: null, reference_answer: null },
            error: null,
          },
        },
      }) as never
    );
  });

  it("code_content の提出には課題の code_language を言語として渡す", async () => {
    mockSubmission({
      code_content: "SELECT 1;",
      code_files: null,
      content: { id: 5, exercise_instructions: "SQLを書く", code_language: "sql" },
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(generateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: {
          type: "code",
          files: [{ filename: "", language: "sql", content: "SELECT 1;" }],
        },
      })
    );
  });

  it("複数ファイル提出は各ファイルの言語をそのまま渡す", async () => {
    const files = [
      { filename: "a.sh", language: "bash", content: "echo a" },
      { filename: "b.json", language: "json", content: "{}" },
    ];
    mockSubmission({
      code_content: null,
      code_files: files,
      content: { id: 5, exercise_instructions: "課題", code_language: "javascript" },
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(generateReview).toHaveBeenCalledWith(
      expect.objectContaining({ submission: { type: "code", files } })
    );
  });

  it("提出が starter_files と同一なら 400（claim 前）", async () => {
    const starter = [{ filename: "index.html", language: "html", content: "<div></div>" }];
    mockSubmission({
      code_content: null,
      code_files: [{ filename: "index.html", language: "html", content: "<div></div>\n" }],
      content: {
        id: 5,
        exercise_instructions: "課題",
        code_language: "javascript",
        starter_files: starter,
      },
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "初期コードから変更してください" });
    expect(claimAIReview).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });
});

describe("maxDurationとGEMINI_TOTAL_BUDGET_MSの整合性", () => {
  it("GEMINI_TOTAL_BUDGET_MSはDB往復等のオーバーヘッド分の余裕を残してmaxDuration未満である", () => {
    const marginMs = 5_000;
    expect(GEMINI_TOTAL_BUDGET_MS + marginMs).toBeLessThanOrEqual(maxDuration * 1000);
  });

  it("AI_REVIEW_STALE_AFTER_MSは実行中の行を死んだ扱いにしないようmaxDurationより長い", () => {
    expect(AI_REVIEW_STALE_AFTER_MS).toBeGreaterThan(maxDuration * 1000);
  });
});
