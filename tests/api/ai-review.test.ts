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
          // First call: submission + content (.single); second: existing submissions for the same
          // content (empty = no completed review).
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
    // Timeout detection and error messages inside generateReview() are covered in
    // tests/services/api/gemini.test.ts; here only check that the route always moves to failed
    // regardless of why generateReview() failed.
    vi.mocked(generateReview).mockRejectedValue(new Error("boom"));

    const res = await POST(request() as never);

    expect(res.status).toBe(502);
    expect(updateAIReviewFailed).toHaveBeenCalledWith(10, "boom");
    expect(updateAIReviewCompleted).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-review - 回数制限（#304）", () => {
  // 2026-10-12 14:00 JST; the JST day started at 2026-10-11T15:00:00Z.
  const NOW = new Date("2026-10-12T05:00:00Z");
  const TODAY = "2026-10-12T01:00:00Z";
  const YESTERDAY = "2026-10-11T14:59:59Z";

  const submissionRow = (userId: number, submissionId = 1) => ({
    id: submissionId,
    user_id: userId,
    content_id: 5,
    submission_type: "url",
    url: "https://example.com/work",
    content: { id: 5, exercise_instructions: "フォームを作る", reference_answer: null },
  });

  const review = (id: number, submissionId: number, overrides: Record<string, unknown> = {}) => ({
    id,
    submission_id: submissionId,
    status: "completed",
    created_at: TODAY,
    ...overrides,
  });

  const setup = ({
    auth,
    submissionId = 1,
    ownSubmissionIds = [1],
    reviews = [],
    todayTotal = 0,
  }: {
    auth: typeof memberAuth;
    submissionId?: number;
    ownSubmissionIds?: number[];
    reviews?: ReturnType<typeof review>[];
    todayTotal?: number;
  }) => {
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: [
          { data: submissionRow(auth.userId, submissionId), error: null },
          { data: ownSubmissionIds.map((id) => ({ id })), error: null },
        ],
        ai_reviews: [
          { data: reviews, error: null },
          { data: null, error: null, count: todayTotal },
        ],
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
    vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 10 });
    vi.mocked(updateAIReviewProcessing).mockResolvedValue(true);
    vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);
    vi.mocked(updateAIReviewFailed).mockResolvedValue(true);
    vi.mocked(generateReview).mockResolvedValue({
      reviewContent: "ok",
      overallScore: 80,
      modelUsed: "gemini-3.6-flash",
      promptTokens: 1,
      completionTokens: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("active: 当日1回目は許可し、200に残り回数を含める", async () => {
    setup({ auth: memberAuth });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, remaining: 1 });
    expect(generateReview).toHaveBeenCalledTimes(1);
  });

  it("active: 当日2回目（新しい提出）は許可する", async () => {
    setup({
      auth: memberAuth,
      submissionId: 2,
      ownSubmissionIds: [1, 2],
      reviews: [review(1, 1)],
      todayTotal: 1,
    });

    const res = await POST(request({ submissionId: 2 }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ remaining: 0 });
  });

  it("active: 当日3回目は429で remaining=0 / resetsAt（JST翌0時）/ 回数入りメッセージを返す", async () => {
    setup({
      auth: memberAuth,
      submissionId: 3,
      ownSubmissionIds: [1, 2, 3],
      reviews: [review(1, 1), review(2, 2)],
      todayTotal: 2,
    });

    const res = await POST(request({ submissionId: 3 }) as never);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "本日のこの課題の AI レビュー回数（2 回）を使い切りました。明日また提出できます",
      remaining: 0,
      resetsAt: "2026-10-12T15:00:00.000Z",
    });
    expect(upsertPendingAIReview).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("active: JST日付境界より前（前日）のレビューは当日の回数に数えない", async () => {
    setup({
      auth: memberAuth,
      submissionId: 3,
      ownSubmissionIds: [1, 2, 3],
      reviews: [review(1, 1, { created_at: YESTERDAY }), review(2, 2)],
      todayTotal: 1,
    });

    const res = await POST(request({ submissionId: 3 }) as never);

    expect(res.status).toBe(200);
  });

  it("active: 当日の総回数が上限に達していれば別コンテンツの1回目でも429", async () => {
    setup({ auth: memberAuth, todayTotal: 10 });

    const res = await POST(request() as never);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe(
      "本日の AI レビュー回数の上限（10 回）に達しました。明日またご利用ください"
    );
    expect(body.remaining).toBe(0);
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("active: 当日の総回数が上限未満（9回）なら許可する", async () => {
    setup({ auth: memberAuth, todayTotal: 9 });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
  });

  it("active: 同じ提出の再レビューは429（日次の枠が残っていても）", async () => {
    setup({ auth: memberAuth, reviews: [review(1, 1)], todayTotal: 1 });

    const res = await POST(request() as never);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error:
        "この提出の AI レビューは実行済みです。コードを直して新しく提出すると再レビューできます",
      remaining: 1,
    });
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("active: failed は回数に数えられず、同じ提出を再実行できる", async () => {
    // fetchAIReviewUsage excludes failed rows in SQL, so a failed-only content yields no rows.
    setup({ auth: memberAuth, reviews: [], todayTotal: 0 });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
  });

  it("同じ提出が processing 中なら202を返し、新規にレビューを開始しない", async () => {
    setup({
      auth: memberAuth,
      reviews: [review(7, 1, { status: "processing" })],
      todayTotal: 1,
    });

    const res = await POST(request() as never);

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      message: "AIレビューは現在生成中です",
      review: { id: 7, status: "processing" },
    });
    expect(upsertPendingAIReview).not.toHaveBeenCalled();
  });

  it("trial: 1回目は許可する（お試し用キー経路のまま）", async () => {
    setup({ auth: trialAuth });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(vi.mocked(generateReview).mock.calls[0][0].apiKey).toBe("trial-key");
  });

  it("trial: 2回目（新しい提出）は429で trial 向けメッセージと remaining=0 を返す", async () => {
    setup({
      auth: trialAuth,
      submissionId: 2,
      ownSubmissionIds: [1, 2],
      reviews: [review(1, 1, { created_at: "2026-09-01T00:00:00Z" })],
    });

    const res = await POST(request({ submissionId: 2 }) as never);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error:
        "お試しプランでは AI レビューは 1 課題につき 1 回です。有料会員は 1 日 2 回まで再レビューできます",
      remaining: 0,
      resetsAt: "2026-10-12T15:00:00.000Z",
    });
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("trial: 当日の総件数は問い合わせない（日次上限を適用しない）", async () => {
    const client = setup({ auth: trialAuth });

    await POST(request() as never);

    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "submissions",
      "submissions",
      "ai_reviews",
    ]);
  });

  it("本人の提出に絞った集計をする（user_id 条件）", async () => {
    const client = setup({ auth: memberAuth });

    await POST(request() as never);

    const ownSubmissionsBuilder = client.from.mock.results[1].value;
    expect(ownSubmissionsBuilder.eq).toHaveBeenCalledWith("user_id", memberAuth.userId);
    const totalBuilder = client.from.mock.results[3].value;
    expect(totalBuilder.eq).toHaveBeenCalledWith("submission.user_id", memberAuth.userId);
  });

  it("他人の提出は403で、回数集計に進まない", async () => {
    const client = setup({ auth: { ...memberAuth, userId: 99 } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          submissions: { data: submissionRow(memberAuth.userId), error: null },
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("非公開になったコンテンツは403（可視性チェックを維持）", async () => {
    setup({ auth: memberAuth });
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(generateReview).not.toHaveBeenCalled();
  });

  it("回数の集計に失敗したら500を返し、レビューを開始しない（fail-closed）", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: [
          { data: submissionRow(memberAuth.userId), error: null },
          { data: null, error: { message: "db error" } },
        ],
      },
    });
    vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
    expect(generateReview).not.toHaveBeenCalled();
  });
});

describe("maxDurationとGEMINI_TOTAL_BUDGET_MSの整合性", () => {
  it("GEMINI_TOTAL_BUDGET_MSはDB往復等のオーバーヘッド分の余裕を残してmaxDuration未満である", () => {
    const marginMs = 5_000;
    expect(GEMINI_TOTAL_BUDGET_MS + marginMs).toBeLessThanOrEqual(maxDuration * 1000);
  });
});
