import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAIReviewUsage } from "@/app/services/api/ai-review-usage-server";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const NOW = new Date("2026-10-12T05:00:00Z");
const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchAIReviewUsage", () => {
  const embedded = { user_id: 2, content_id: 5 };

  it("本人・対象コンテンツに絞って failed を除いたレビューと当日の総件数を返す", async () => {
    const rows = [
      {
        id: 1,
        submission_id: 11,
        status: "completed",
        created_at: "2026-10-12T01:00:00Z",
        submission: embedded,
      },
    ];
    const client = createMockSupabaseClient({
      tableResults: {
        ai_reviews: [
          { data: rows, error: null },
          { data: null, error: null, count: 4 },
        ],
      },
    });

    const usage = await fetchAIReviewUsage(client as never, {
      userId: 2,
      contentId: 5,
      includeDailyTotal: true,
      now: NOW,
    });

    expect(usage).toEqual({
      contentReviews: [
        { id: 1, submission_id: 11, status: "completed", created_at: "2026-10-12T01:00:00Z" },
      ],
      todayTotal: 4,
    });
    expect(client.from).toHaveBeenCalledTimes(2);

    const contentBuilder = client.from.mock.results[0].value;
    expect(contentBuilder.eq).toHaveBeenCalledWith("submission.user_id", 2);
    expect(contentBuilder.eq).toHaveBeenCalledWith("submission.content_id", 5);
    expect(contentBuilder.neq).toHaveBeenCalledWith("status", "failed");

    const totalBuilder = client.from.mock.results[1].value;
    expect(totalBuilder.eq).toHaveBeenCalledWith("submission.user_id", 2);
    expect(totalBuilder.neq).toHaveBeenCalledWith("status", "failed");
    // JST day start (not the UTC day start).
    expect(totalBuilder.gte).toHaveBeenCalledWith("created_at", "2026-10-11T15:00:00.000Z");
    // A pending / processing row older than the stale cutoff (NOW - 90s) must not count.
    expect(totalBuilder.or).toHaveBeenCalledWith(
      "status.eq.completed,created_at.gt.2026-10-12T04:58:30.000Z"
    );
  });

  it("includeDailyTotal=false なら当日の総件数を問い合わせない", async () => {
    const client = createMockSupabaseClient({
      tableResults: { ai_reviews: { data: [], error: null } },
    });

    const usage = await fetchAIReviewUsage(client as never, {
      userId: 3,
      contentId: 5,
      includeDailyTotal: false,
      now: NOW,
    });

    expect(usage).toEqual({ contentReviews: [], todayTotal: 0 });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "ai_reviews (content)",
      [
        { data: null, error: dbError },
        { data: null, error: null, count: 0 },
      ],
    ],
    [
      "ai_reviews (daily total)",
      [
        { data: [], error: null },
        { data: null, error: dbError },
      ],
    ],
  ])("%s の取得エラー時は null を返す（fail-closed）", async (_label, aiReviews) => {
    const client = createMockSupabaseClient({ tableResults: { ai_reviews: aiReviews } });

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
