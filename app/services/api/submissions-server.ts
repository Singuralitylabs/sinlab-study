import type { PostgrestError } from "@supabase/supabase-js";
import type { Submission, SubmissionWithContent, SubmissionWithUser } from "@/app/types";
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

/**
 * 全ユーザーの提出履歴を取得（管理者・講師用）
 * Service Roleクライアントを使用（呼び出し元で権限チェック済み前提）
 */
export async function fetchAllSubmissions(): Promise<{
  data: SubmissionWithUser[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*, user:users(id, display_name, email), content:learning_contents(*)")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("全提出履歴取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as SubmissionWithUser[], error: null };
}
