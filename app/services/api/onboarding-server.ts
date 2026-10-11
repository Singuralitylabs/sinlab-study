import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

export type OnboardingStatus = {
  completedAt: string | null;
};

/** Steps 2 and 3 only; step 1 reuses the theme progress summary. */
export type GettingStartedProgress = {
  hasSubmission: boolean;
  hasCompletedReview: boolean;
};

/**
 * Normal client (own-row SELECT already allowed by RLS). Deliberately not put in getServerAuth()
 * or the proxy.ts headers since only / uses it.
 */
export async function fetchOnboardingStatus(userId: number): Promise<{
  data: OnboardingStatus | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("オンボーディング状態取得エラー:", error.message);
    return { data: null, error };
  }

  return {
    data: { completedAt: data?.onboarding_completed_at ?? null },
    error: null,
  };
}

/**
 * Existence checks only, so limit(1). The two queries are independent and run in parallel. On
 * query failure treat the step as not achieved and continue (never block the dashboard).
 */
export async function fetchGettingStartedProgress(userId: number): Promise<{
  data: GettingStartedProgress;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const [submissionResult, reviewResult] = await Promise.all([
    supabase.from("submissions").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    supabase
      .from("ai_reviews")
      .select("id, submission:submissions!inner(user_id)")
      .eq("submission.user_id", userId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle(),
  ]);

  if (submissionResult.error) {
    console.error("はじめかた進捗の提出取得エラー:", submissionResult.error.message);
  }
  if (reviewResult.error) {
    console.error("はじめかた進捗のAIレビュー取得エラー:", reviewResult.error.message);
  }

  // Evaluate independently so one failure does not discard the other result.
  return {
    data: {
      hasSubmission: !submissionResult.error && !!submissionResult.data,
      hasCompletedReview: !reviewResult.error && !!reviewResult.data,
    },
    error: submissionResult.error ?? reviewResult.error,
  };
}

/**
 * Idempotent (overwrite only). No RLS UPDATE policy is added for self; uses service_role scoped
 * by the user_id filter (same pattern as submissions-server.ts) and updates only the
 * onboarding_completed_at column.
 */
export async function markOnboardingCompleted(userId: number): Promise<{
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("オンボーディング完了記録エラー:", error.message);
    return { error };
  }

  return { error: null };
}
