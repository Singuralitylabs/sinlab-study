import type { PostgrestError } from "@supabase/supabase-js";
import {
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_RATE_LIMIT_WINDOW_MS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/app/constants/feedback";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

export type FeedbackRow = {
  id: number;
  user_id: number;
  category: FeedbackCategory;
  body: string;
  page_url: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  created_at: string;
};

export type ManageFeedbackListItem = FeedbackRow & {
  user: { display_name: string; email: string } | null;
};

export async function countRecentFeedbacksForUser(
  userId: number,
  now = new Date()
): Promise<{ count: number; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();
  const since = new Date(now.getTime() - FEEDBACK_RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("feedbacks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    console.error("フィードバック件数取得エラー:", error.message);
    return { count: 0, error };
  }
  return { count: count ?? 0, error: null };
}

export async function insertFeedback(params: {
  userId: number;
  category: FeedbackCategory;
  body: string;
  pageUrl: string | null;
  userAgent: string | null;
}): Promise<{ data: FeedbackRow | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedbacks")
    .insert({
      user_id: params.userId,
      category: params.category,
      body: params.body.slice(0, FEEDBACK_BODY_MAX_LENGTH),
      page_url: params.pageUrl,
      user_agent: params.userAgent,
      status: "open",
    })
    .select("id, user_id, category, body, page_url, user_agent, status, created_at")
    .single();

  if (error) {
    console.error("フィードバック保存エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as FeedbackRow, error: null };
}

export async function fetchManageFeedbacks(): Promise<{
  data: ManageFeedbackListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedbacks")
    .select(
      "id, user_id, category, body, page_url, user_agent, status, created_at, user:users(display_name, email)"
    )
    .order("created_at", { ascending: false })
    .overrideTypes<ManageFeedbackListItem[], { merge: false }>();

  if (error) {
    console.error("フィードバック一覧取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function fetchManageFeedbackById(id: number): Promise<{
  data: ManageFeedbackListItem | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedbacks")
    .select(
      "id, user_id, category, body, page_url, user_agent, status, created_at, user:users(display_name, email)"
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ManageFeedbackListItem, { merge: false }>();

  if (error) {
    console.error("フィードバック詳細取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function updateFeedbackStatus(
  id: number,
  status: FeedbackStatus
): Promise<{ data: FeedbackRow | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedbacks")
    .update({ status })
    .eq("id", id)
    .select("id, user_id, category, body, page_url, user_agent, status, created_at")
    .maybeSingle();

  if (error) {
    console.error("フィードバック状態更新エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as FeedbackRow | null, error: null };
}
