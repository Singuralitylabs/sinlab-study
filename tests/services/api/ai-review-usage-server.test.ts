import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAIReviewUsage } from "@/app/services/api/ai-review-usage-server";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const NOW = new Date("2026-10-12T05:00:00Z");
const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchAIReviewUsage", () => {
  it("本人の提出に絞って failed を除いたレビューと当日の総件数を返す", async () => {
    const reviews = [
      { id: 1, submission_id: 11, status: "completed", created_at: "2026-10-12T01:00:00Z" },
    ];
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: { data: [{ id: 11 }, { id: 12 }], error: null },
        // The daily total is issued first: it runs in parallel with the submissions lookup.
        ai_reviews: [
          { data: null, error: null, count: 4 },
          { data: reviews, error: null },
        ],
      },
    });

    const usage = await fetchAIReviewUsage(client as never, {
      userId: 2,
      contentId: 5,
      includeDailyTotal: true,
      now: NOW,
    });

    expect(usage).toEqual({ contentReviews: reviews, todayTotal: 4 });

    const submissionsBuilder = client.from.mock.results[0].value;
    expect(submissionsBuilder.eq).toHaveBeenCalledWith("user_id", 2);
    expect(submissionsBuilder.eq).toHaveBeenCalledWith("content_id", 5);

    const contentBuilder = client.from.mock.results[2].value;
    expect(contentBuilder.in).toHaveBeenCalledWith("submission_id", [11, 12]);
    expect(contentBuilder.neq).toHaveBeenCalledWith("status", "failed");

    const totalBuilder = client.from.mock.results[1].value;
    expect(totalBuilder.eq).toHaveBeenCalledWith("submission.user_id", 2);
    expect(totalBuilder.neq).toHaveBeenCalledWith("status", "failed");
    // JST day start (not the UTC day start).
    expect(totalBuilder.gte).toHaveBeenCalledWith("created_at", "2026-10-11T15:00:00.000Z");
  });

  it("includeDailyTotal=false なら当日の総件数を問い合わせない", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: { data: [{ id: 11 }], error: null },
        ai_reviews: { data: [], error: null },
      },
    });

    const usage = await fetchAIReviewUsage(client as never, {
      userId: 3,
      contentId: 5,
      includeDailyTotal: false,
      now: NOW,
    });

    expect(usage).toEqual({ contentReviews: [], todayTotal: 0 });
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("提出が無ければレビュー取得を省略する", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        submissions: { data: [], error: null },
        ai_reviews: { data: null, error: null, count: 0 },
      },
    });

    const usage = await fetchAIReviewUsage(client as never, {
      userId: 2,
      contentId: 5,
      includeDailyTotal: true,
      now: NOW,
    });

    expect(usage).toEqual({ contentReviews: [], todayTotal: 0 });
    expect(client.from.mock.calls.map(([table]) => table)).toEqual(["submissions", "ai_reviews"]);
  });

  it.each([
    ["submissions", { submissions: { data: null, error: dbError } }],
    [
      "ai_reviews (content)",
      {
        submissions: { data: [{ id: 1 }], error: null },
        ai_reviews: { data: null, error: dbError },
      },
    ],
    [
      "ai_reviews (daily total)",
      {
        submissions: { data: [], error: null },
        ai_reviews: { data: null, error: dbError },
      },
    ],
  ])("%s の取得エラー時は null を返す（fail-closed）", async (_label, tableResults) => {
    const client = createMockSupabaseClient({ tableResults });

    await expect(
      fetchAIReviewUsage(client as never, {
        userId: 2,
        contentId: 5,
        includeDailyTotal: true,
        now: NOW,
      })
    ).resolves.toBeNull();
  });
});
