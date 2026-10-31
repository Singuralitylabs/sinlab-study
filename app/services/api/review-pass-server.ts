import type { PostgrestError } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** True when this exercise completes only by a passing review. False when it does not. */
export async function contentRequiresReviewPass(
  supabase: ServerClient,
  contentId: number
): Promise<{ requiresPass: boolean; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc("content_requires_review_pass", {
    p_content_id: contentId,
  });
  if (error) {
    console.error("合格判定対象の確認エラー:", error.message);
    return { requiresPass: false, error };
  }
  return { requiresPass: data === true, error: null };
}

/**
 * Whether this user has any completed review with passed = true for the content. A later failing
 * resubmission does not clear it: completion stays once a pass exists.
 */
export async function userHasPassingReview(
  supabase: ServerClient,
  userId: number,
  contentId: number
): Promise<{ hasPass: boolean; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, ai_review:ai_reviews!inner(id)")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .eq("ai_review.status", "completed")
    .eq("ai_review.passed", true)
    .limit(1);

  if (error) {
    console.error("合格レビューの確認エラー:", error.message);
    return { hasPass: false, error };
  }
  return { hasPass: (data?.length ?? 0) > 0, error: null };
}

/**
 * True when a pass is required and the stored rubric cannot produce one (empty requirements).
 * False when a pass is achievable, or when the exercise is not pass-gated.
 */
export async function contentReviewPassUnachievable(
  supabase: ServerClient,
  contentId: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("content_review_pass_unachievable", {
    p_content_id: contentId,
  });
  if (error) {
    console.error("合格不能の確認エラー:", error.message);
    return false;
  }
  return data === true;
}

export async function fetchContentRequiresReviewPass(contentId: number): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { requiresPass } = await contentRequiresReviewPass(supabase, contentId);
  return requiresPass;
}

export async function fetchContentReviewPassUnachievable(contentId: number): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  return contentReviewPassUnachievable(supabase, contentId);
}

export async function fetchUserHasPassingReview(
  userId: number,
  contentId: number
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { hasPass } = await userHasPassingReview(supabase, userId, contentId);
  return hasPass;
}

export type ExerciseReviewPassState = {
  requiresPass: boolean;
  passUnachievable: boolean;
  hasPassingReview: boolean;
};

/**
 * One round-trip for the exercise content page (#502). Keeps the existing two RPCs for progress /
 * certificates / triggers. Fail-closed: RPC errors yield all-false.
 */
export async function fetchExerciseReviewPassState(
  contentId: number
): Promise<ExerciseReviewPassState> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_exercise_review_pass_state", {
    p_content_id: contentId,
  });
  if (error) {
    console.error("演習の合格要否の確認エラー:", error.message);
    return { requiresPass: false, passUnachievable: false, hasPassingReview: false };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { requiresPass: false, passUnachievable: false, hasPassingReview: false };
  }
  const row = data as Record<string, unknown>;
  return {
    requiresPass: row.requires_pass === true,
    passUnachievable: row.pass_unachievable === true,
    hasPassingReview: row.has_passing_review === true,
  };
}
