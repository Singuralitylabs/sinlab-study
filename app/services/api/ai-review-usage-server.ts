import {
  getJstDayWindow,
  type ReviewUsageRow,
  staleReviewCutoff,
} from "@/app/lib/ai-review-limits";
import type { createServerSupabaseClient } from "./supabase-server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface AIReviewUsage {
  contentReviews: ReviewUsageRow[];
  todayTotal: number;
}

/**
 * Every query is pinned to `userId`: admin / maintainer RLS lets them SELECT all ai_reviews, so
 * relying on RLS alone would count other users' reviews against them. `failed` rows are excluded
 * so a Gemini failure never consumes an allowance. todayTotal is skipped (0) for callers that
 * don't apply the daily total (trial).
 */
export async function fetchAIReviewUsage(
  supabase: ServerSupabaseClient,
  {
    userId,
    contentId,
    includeDailyTotal,
    now = new Date(),
  }: { userId: number; contentId: number; includeDailyTotal: boolean; now?: Date }
): Promise<AIReviewUsage | null> {
  const fetchContentReviews = async (): Promise<AIReviewUsage["contentReviews"] | null> => {
    const { data, error } = await supabase
      .from("ai_reviews")
      .select(
        "id, submission_id, status, created_at, submission:submissions!inner(user_id, content_id)"
      )
      .eq("submission.user_id", userId)
      .eq("submission.content_id", contentId)
      .neq("status", "failed");

    if (error) {
      console.error("AIレビュー回数集計エラー (ai_reviews):", error.message);
      return null;
    }
    return (data ?? []).map(({ id, submission_id, status, created_at }) => ({
      id,
      submission_id,
      status,
      created_at,
    }));
  };

  // Independent of the per-content lookup, so it runs alongside it instead of after it.
  const fetchTodayTotal = async (): Promise<number | null> => {
    if (!includeDailyTotal) {
      return 0;
    }
    const { startIso } = getJstDayWindow(now);
    const { count, error } = await supabase
      .from("ai_reviews")
      .select("id, submission:submissions!inner(user_id)", { count: "exact", head: true })
      .eq("submission.user_id", userId)
      .neq("status", "failed")
      // A dead pending / processing row (killed run) must not count, same as in the per-content
      // lookup (countableRows).
      .or(`status.eq.completed,created_at.gt.${staleReviewCutoff(now).toISOString()}`)
      .gte("created_at", startIso);

    if (error) {
      console.error("AIレビュー回数集計エラー (daily total):", error.message);
      return null;
    }
    return count ?? 0;
  };

  const [contentReviews, todayTotal] = await Promise.all([
    fetchContentReviews(),
    fetchTodayTotal(),
  ]);
  if (contentReviews === null || todayTotal === null) {
    return null;
  }

  return { contentReviews, todayTotal };
}
