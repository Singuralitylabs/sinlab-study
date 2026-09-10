import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUBMISSION_CONTENT_COLUMNS } from "@/app/services/api/submissions-server";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchAllSubmissionsWithReviews,
  fetchCompletedAIReviewByContentId,
  fetchCompletedAIReviewContentIds,
  fetchSubmissionsWithReviewsByUserId,
} from "@/app/services/api/ai-review-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchAllSubmissionsWithReviews
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// fetchCompletedAIReviewByContentId
// ----------------------------------------------------------------
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
    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("submissions");
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith("id, content_id, ai_review:ai_reviews!inner(*)");
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
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchCompletedAIReviewContentIds
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// fetchSubmissionsWithReviewsByUserId
// ----------------------------------------------------------------
describe("fetchSubmissionsWithReviewsByUserId", () => {
  it("content の本文などの重いカラムを取得しないカラム定義で select する", async () => {
    const rows = [
      {
        id: 1,
        user_id: 10,
        content_id: 100,
        content: { id: 100, title: "課題1", content_type: "exercise" },
        ai_review: { id: 50, status: "completed" },
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsWithReviewsByUserId(10);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.select).toHaveBeenCalledWith(
      `*, content:learning_contents(${SUBMISSION_CONTENT_COLUMNS}), ai_review:ai_reviews(*)`
    );
  });
});
