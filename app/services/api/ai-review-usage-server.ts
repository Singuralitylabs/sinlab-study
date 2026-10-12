import { getJstDayWindow, type ReviewUsageRow } from "@/app/lib/ai-review-limits";
import type { createServerSupabaseClient } from "./supabase-server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface AIReviewUsage {
  contentReviews: (ReviewUsageRow & { id: number })[];
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
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("id")
    .eq("user_id", userId)
    .eq("content_id", contentId);

  if (submissionsError) {
    console.error("AIレビュー回数集計エラー (submissions):", submissionsError.message);
    return null;
  }

  const submissionIds = (submissions ?? []).map((s) => s.id);

  let contentReviews: AIReviewUsage["contentReviews"] = [];
  if (submissionIds.length > 0) {
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("id, submission_id, status, created_at")
      .in("submission_id", submissionIds)
      .neq("status", "failed");

    if (error) {
      console.error("AIレビュー回数集計エラー (ai_reviews):", error.message);
      return null;
    }
    contentReviews = data ?? [];
  }

  let todayTotal = 0;
  if (includeDailyTotal) {
    const { startIso } = getJstDayWindow(now);
    const { count, error } = await supabase
      .from("ai_reviews")
      .select("id, submission:submissions!inner(user_id)", { count: "exact", head: true })
      .eq("submission.user_id", userId)
      .neq("status", "failed")
      .gte("created_at", startIso);

    if (error) {
      console.error("AIレビュー回数集計エラー (daily total):", error.message);
      return null;
    }
    todayTotal = count ?? 0;
  }

  return { contentReviews, todayTotal };
}
