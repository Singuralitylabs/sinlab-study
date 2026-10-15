import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  claimAIReview,
  fetchAllSubmissionsWithReviews,
  fetchCompletedAIReviewByContentId,
  fetchCompletedAIReviewContentIds,
  fetchSubmissionsWithReviewsByUserId,
  updateAIReviewCompleted,
  updateAIReviewFailed,
} from "@/app/services/api/ai-review-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAllSubmissionsWithReviews", () => {
  it("指定ページの提出一覧と総数を返す（2ページ目は range(20, 39)）", async () => {
    const rows = [{ id: 21 }, { id: 22 }];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null, count: 42 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews({ page: 2, pageSize: 20 });

    expect(result.data).toEqual(rows);
    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(20, 39);
    expect(builder.order).toHaveBeenCalledWith("submitted_at", { ascending: false });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("管理画面向けにだけトークン数のカラムを select する", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchAllSubmissionsWithReviews();

    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.select.mock.calls[0][0]).toContain(
      "prompt_tokens, completion_tokens, thoughts_tokens"
    );
  });

  it("引数省略時は1ページ目を range(0, 19) で取得する", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews();

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(0, 19);
  });

  it("page / pageSize が不正値（0・NaN）でも1以上に正規化して range を組み立てる", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchAllSubmissionsWithReviews({ page: 0, pageSize: Number.NaN });

    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(0, 0);
  });

  it("DB エラー時、data: null / count: 0 とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError, count: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews({ page: 1, pageSize: 20 });

    expect(result.data).toBeNull();
    expect(result.count).toBe(0);
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchCompletedAIReviewByContentId", () => {
  it("完了済みAIレビューを持つ提出がある場合、そのAIレビューを返す（1クエリ）", async () => {
    const reviewData = { id: 10, status: "completed", submission_id: 1 };
    const mockClient = createMockSupabaseClient({
      queryResult: {
        data: { id: 1, content_id: 5, ai_review: reviewData },
        error: null,
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewByContentId(2, 5);

    expect(result.data).toEqual(reviewData);
    expect(result.submissionId).toBe(1);
    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("submissions");
    const builder = mockClient.from.mock.results[0].value;
    const [selectArg] = builder.select.mock.calls[0];
    expect(selectArg).toContain("review_json, score_kind, rubric_version, passed");
    expect(selectArg).not.toContain("*");
    expect(selectArg).not.toContain("tokens");
    expect(builder.eq).toHaveBeenCalledWith("user_id", 2);
    expect(builder.eq).toHaveBeenCalledWith("content_id", 5);
    expect(builder.eq).toHaveBeenCalledWith("ai_review.status", "completed");
  });

  it("該当なしの場合、data: null / error: null を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewByContentId(2, 5);

    expect(result.data).toBeNull();
    expect(result.submissionId).toBeNull();
    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("DBエラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewByContentId(2, 5);

    expect(result.data).toBeNull();
    expect(result.submissionId).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchCompletedAIReviewContentIds", () => {
  it("contentIdsが空配列ならDB照会せず空Setを返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewContentIds(2, []);

    expect(result.data).toEqual(new Set());
    expect(result.error).toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("完了済みAIレビューが存在するコンテンツIDのSetを返す（1クエリ）", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: {
        data: [
          { content_id: 10, ai_review: { status: "completed" } },
          { content_id: 20, ai_review: { status: "completed" } },
        ],
        error: null,
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewContentIds(2, [10, 20, 30]);

    expect(result.data).toEqual(new Set([10, 20]));
    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("submissions");
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith("content_id, ai_review:ai_reviews!inner(status)");
    expect(builder.eq).toHaveBeenCalledWith("user_id", 2);
    expect(builder.in).toHaveBeenCalledWith("content_id", [10, 20, 30]);
    expect(builder.eq).toHaveBeenCalledWith("ai_review.status", "completed");
  });

  it("DBエラー時、空Setとエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchCompletedAIReviewContentIds(2, [10, 20]);

    expect(result.data).toEqual(new Set());
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchSubmissionsWithReviewsByUserId", () => {
  const listSelect =
    "*, content:learning_contents(id, title, code_language, submission_file_slots, starter_files, show_preview, show_console), ai_review:ai_reviews(id, status, overall_score, review_content, reviewed_at, error_message, review_json, score_kind, rubric_version, passed)";

  it("指定ページの提出一覧と総数を返す（2ページ目は range(20, 39)）", async () => {
    const rows = [{ id: 21 }, { id: 22 }];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null, count: 42 },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsWithReviewsByUserId(10, { page: 2, pageSize: 20 });

    expect(result.data).toEqual(rows);
    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.select).toHaveBeenCalledWith(listSelect, { count: "exact" });
    expect(listSelect).not.toContain("tokens");
    expect(builder.eq).toHaveBeenCalledWith("user_id", 10);
    expect(builder.range).toHaveBeenCalledWith(20, 39);
    expect(builder.order).toHaveBeenCalledWith("submitted_at", { ascending: false });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("引数省略時は1ページ目を range(0, 19) で取得する", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsWithReviewsByUserId(10);

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(0, 19);
  });

  it("page / pageSize が不正値（0・NaN）でも1以上に正規化して range を組み立てる", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchSubmissionsWithReviewsByUserId(10, { page: 0, pageSize: Number.NaN });

    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(0, 0);
  });

  it("content / ai_reviews は一覧表示に必要なカラムのみ select する", async () => {
    const rows = [
      {
        id: 1,
        user_id: 10,
        content_id: 100,
        content: { id: 100, title: "課題1" },
        ai_review: { id: 50, status: "completed" },
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null, count: 1 },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsWithReviewsByUserId(10);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.select).toHaveBeenCalledWith(listSelect, { count: "exact" });
  });

  it("DB エラー時、data: null / count: 0 とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError, count: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsWithReviewsByUserId(10, { page: 1, pageSize: 20 });

    expect(result.data).toBeNull();
    expect(result.count).toBe(0);
    expect(result.error).toEqual(dbError);
  });
});

describe("updateAIReviewFailed / updateAIReviewCompleted", () => {
  const priorTokens = {
    data: { prompt_tokens: 100, completion_tokens: 20, thoughts_tokens: null },
    error: null,
  };

  it("failed 行に消費トークンを前回までの分へ加算して記録する（失敗でも課金されるため）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { ai_reviews: [priorTokens, { data: null, error: null }] },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await updateAIReviewFailed(4, "bad", {
      promptTokens: 10,
      completionTokens: 2,
      thoughtsTokens: null,
    });

    const update = mockClient.from.mock.results[1].value;
    expect(update.update).toHaveBeenCalledWith({
      status: "failed",
      error_message: "bad",
      prompt_tokens: 110,
      completion_tokens: 22,
      thoughts_tokens: null,
    });
  });

  it("トークン情報がない失敗ではトークン列に触れない", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: null } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await updateAIReviewFailed(4, "bad");

    expect(mockClient.from).toHaveBeenCalledTimes(1);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ status: "failed", error_message: "bad" });
  });

  it("completed 行に構造化結果・score_kind・rubric_version・passed・累計トークンを保存する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { ai_reviews: [priorTokens, { data: null, error: null }] },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    const reviewJson = {
      requirements: [],
      code_quality: { level: "fair" as const, comment: "c" },
      suggestions: [],
      advice: "a",
    };

    await updateAIReviewCompleted(4, {
      reviewContent: "md",
      overallScore: 50,
      reviewJson,
      scoreKind: "rubric",
      rubricVersion: 2,
      passed: null,
      modelUsed: "m",
      promptTokens: 1,
      completionTokens: 2,
      thoughtsTokens: 3,
    });

    const update = mockClient.from.mock.results[1].value;
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        review_json: reviewJson,
        score_kind: "rubric",
        rubric_version: 2,
        passed: null,
        prompt_tokens: 101,
        completion_tokens: 22,
        thoughts_tokens: 3,
      })
    );
  });

  it("累計の読み取りに失敗したときは、前回までの記録を小さい値で上書きしないようトークン列に触れない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mockClient = createMockSupabaseClient({
      tableResults: {
        ai_reviews: [
          { data: null, error: dbError },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await updateAIReviewFailed(4, "bad", {
      promptTokens: 5,
      completionTokens: 1,
      thoughtsTokens: null,
    });

    const update = mockClient.from.mock.results[1].value;
    expect(update.update).toHaveBeenCalledWith({ status: "failed", error_message: "bad" });
  });

  it("前回の記録がなければ今回の値だけを保存し、双方 NULL の項目は NULL のままにする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        ai_reviews: [
          {
            data: { prompt_tokens: null, completion_tokens: null, thoughts_tokens: null },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await updateAIReviewFailed(4, "bad", {
      promptTokens: 5,
      completionTokens: null,
      thoughtsTokens: null,
    });

    const update = mockClient.from.mock.results[1].value;
    expect(update.update).toHaveBeenCalledWith({
      status: "failed",
      error_message: "bad",
      prompt_tokens: 5,
      completion_tokens: null,
      thoughts_tokens: null,
    });
  });
});

describe("claimAIReview", () => {
  const NOW = new Date("2026-10-12T05:00:00Z");
  const params = {
    userId: 2,
    submissionId: 7,
    contentId: 5,
    userStatus: "active" as const,
    now: NOW,
  };

  const mockRpc = (result: { data: unknown; error: unknown }) => {
    const mockClient = createMockSupabaseClient();
    mockClient.rpc.mockResolvedValue(result);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    return mockClient;
  };

  it("上限値・JST当日の開始・死んだ行の境界を引数にして claim_ai_review を1回だけ呼ぶ", async () => {
    const mockClient = mockRpc({
      data: { outcome: "claimed", review_id: 10, remaining: 1 },
      error: null,
    });

    const result = await claimAIReview(params);

    expect(result).toEqual({ kind: "claimed", reviewId: 10, remaining: 1 });
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);
    expect(mockClient.rpc).toHaveBeenCalledWith("claim_ai_review", {
      p_user_id: 2,
      p_submission_id: 7,
      p_content_id: 5,
      p_user_status: "active",
      p_stale_before: "2026-10-12T04:58:30.000Z",
      p_day_start: "2026-10-11T15:00:00.000Z",
      p_active_per_content_per_day: 2,
      p_active_per_day: 10,
      p_trial_per_content_lifetime: 1,
    });
  });

  it.each([
    [
      { outcome: "processing", review_id: 3 },
      { kind: "processing", reviewId: 3 },
    ],
    [
      { outcome: "limited", reason: "content_daily", remaining: 0 },
      { kind: "limited", reason: "content_daily", remaining: 0 },
    ],
    [
      { outcome: "limited", reason: "submission_reviewed", remaining: 1 },
      { kind: "limited", reason: "submission_reviewed", remaining: 1 },
    ],
    [{ outcome: "busy" }, { kind: "busy" }],
  ])("応答 %j を分類して返す", async (data, expected) => {
    mockRpc({ data, error: null });

    await expect(claimAIReview(params)).resolves.toEqual(expected);
  });

  it.each([
    ["RPC のエラー", { data: null, error: dbError }],
    ["想定外の outcome", { data: { outcome: "unknown" }, error: null }],
    ["review_id の無い claimed", { data: { outcome: "claimed" }, error: null }],
    ["未知の理由の limited", { data: { outcome: "limited", reason: "x" }, error: null }],
    ["空の応答", { data: null, error: null }],
  ])("%s では null を返す（枠を確保したことにしない）", async (_label, result) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc(result);

    await expect(claimAIReview(params)).resolves.toBeNull();
  });

  it("learner 以外の状態（null）は空文字で渡し、RPC 側の拒否に委ねる", async () => {
    const mockClient = mockRpc({ data: null, error: dbError });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await claimAIReview({ ...params, userStatus: null });

    expect(mockClient.rpc.mock.calls[0][1]).toMatchObject({ p_user_status: "" });
  });
});
