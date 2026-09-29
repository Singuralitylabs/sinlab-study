import type { PostgrestError } from "@supabase/supabase-js";
import type { LearningContent, Submission, SubmissionWithContent, UserType } from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/** Minimal content columns for the history list (no heavy text such as bodies). */
export const SUBMISSION_CONTENT_COLUMNS =
  "id, title, content_type, is_published, is_open_to_trial, week_id";

export async function fetchSubmissionsByUserId(userId: number): Promise<{
  data: SubmissionWithContent[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(`*, content:learning_contents(${SUBMISSION_CONTENT_COLUMNS})`)
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error("提出履歴取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as SubmissionWithContent[], error: null };
}

/** Uses the admin client to avoid depending on RLS; safety comes from the userId filter. */
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
    .order("id", { ascending: false })
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
 * Service role client (caller has already checked permission). count: "exact" fetches the latest
 * N and the total in one query.
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
    .order("id", { ascending: false })
    .limit(limit)
    .overrideTypes<RecentSubmission[], { merge: false }>();

  if (error) {
    console.error("直近提出取得エラー:", error.message);
    return { data: null, count: 0, error };
  }

  return { data, count: count ?? 0, error: null };
}
