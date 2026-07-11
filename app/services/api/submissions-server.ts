import type { PostgrestError } from "@supabase/supabase-js";
import type { LearningContent, Submission, SubmissionWithContent, UserType } from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/**
 * ユーザーの提出履歴を取得
 */
export async function fetchSubmissionsByUserId(userId: number): Promise<{
  data: SubmissionWithContent[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*, content:learning_contents(*)")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("提出履歴取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as SubmissionWithContent[], error: null };
}

/**
 * ユーザーの特定コンテンツへの最新提出を1件取得（コンテンツページ表示用）
 * RLS依存を避けるためadminクライアントを使用し、userIdフィルタで安全性を担保
 */
export async function fetchLatestSubmissionByContentId(
  userId: number,
  contentId: number
): Promise<{ data: Submission | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("最新提出取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as Submission | null, error: null };
}

interface RecentSubmission {
  id: number;
  submitted_at: string | null;
  user: Pick<UserType, "display_name"> | null;
  content: Pick<LearningContent, "title"> | null;
}

/**
 * 直近の提出と提出総数を取得（管理ダッシュボード用。コード本文などの重いカラムは取得しない）
 * count: "exact" を併用し、直近N件と総数を1クエリで取得する。
 * Service Roleクライアントを使用（呼び出し元で権限チェック済み前提）
 */
export async function fetchRecentSubmissions(limit: number): Promise<{
  data: RecentSubmission[] | null;
  count: number;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, count, error } = await supabase
    .from("submissions")
    .select("id, submitted_at, user:users(display_name), content:learning_contents(title)", {
      count: "exact",
    })
    .order("submitted_at", { ascending: false })
    .limit(limit)
    .overrideTypes<RecentSubmission[], { merge: false }>();

  if (error) {
    console.error("直近提出取得エラー:", error.message);
    return { data: null, count: 0, error };
  }

  return { data, count: count ?? 0, error: null };
}
