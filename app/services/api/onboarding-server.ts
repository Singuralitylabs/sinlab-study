import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/** ウェルカムダイアログの表示済み状態 */
export type OnboardingStatus = {
  completedAt: string | null;
};

/** はじめかたチェックリストの達成状態（ステップ2・3のみ。ステップ1はテーマ進捗サマリーを再利用する） */
export type GettingStartedProgress = {
  hasSubmission: boolean;
  hasCompletedReview: boolean;
};

/**
 * 自分の onboarding_completed_at を取得する（通常クライアント。本人 SELECT は既存 RLS で許可済み）。
 * getServerAuth() と proxy.ts のヘッダーには載せない（/ でしか使わないため）。
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
    data: { completedAt: (data?.onboarding_completed_at as string | null) ?? null },
    error: null,
  };
}

/**
 * チェックリストのステップ2・3（提出・AIレビュー完了）を判定する。
 * 存在確認のみのため limit(1) で取得し、全件取得しない。
 * クエリ失敗時は未達成扱いで継続する（ダッシュボード表示をブロックしない）。
 */
export async function fetchGettingStartedProgress(userId: number): Promise<{
  data: GettingStartedProgress;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (submissionError) {
    console.error("はじめかた進捗の提出取得エラー:", submissionError.message);
    return { data: { hasSubmission: false, hasCompletedReview: false }, error: submissionError };
  }

  const hasSubmission = !!submission;

  const { data: review, error: reviewError } = await supabase
    .from("ai_reviews")
    .select("id, submission:submissions!inner(user_id)")
    .eq("submission.user_id", userId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (reviewError) {
    console.error("はじめかた進捗のAIレビュー取得エラー:", reviewError.message);
    return { data: { hasSubmission, hasCompletedReview: false }, error: reviewError };
  }

  return { data: { hasSubmission, hasCompletedReview: !!review }, error: null };
}

/**
 * onboarding_completed_at を現在時刻で記録する（冪等。上書きのみ）。
 * 本人 UPDATE の RLS ポリシーは追加せず、user_id フィルタで担保する service_role 利用
 * （submissions-server.ts と同じパターン）で onboarding_completed_at の1列のみ更新する。
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
