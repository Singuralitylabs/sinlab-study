import type { PostgrestError } from "@supabase/supabase-js";
import { SUBMISSIONS_PAGE_SIZE } from "@/app/constants/submissions";
import { resolvePageRange } from "@/app/lib/submissions-pagination";
import type {
  AdminSubmissionWithReview,
  AIReviewListItem,
  ReviewJson,
  ScoreKind,
  SubmissionWithContentAndReview,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

const AI_REVIEW_STUDENT_COLUMNS =
  "id, status, overall_score, review_content, reviewed_at, error_message, review_json, score_kind, rubric_version, passed";

/** Token counts are billing data for admin / maintainer only; students never select them. */
const AI_REVIEW_ADMIN_COLUMNS = `${AI_REVIEW_STUDENT_COLUMNS}, prompt_tokens, completion_tokens, thoughts_tokens`;

const AI_REVIEW_LIST_SELECT = `ai_review:ai_reviews(${AI_REVIEW_STUDENT_COLUMNS})`;
const AI_REVIEW_ADMIN_LIST_SELECT = `ai_review:ai_reviews(${AI_REVIEW_ADMIN_COLUMNS})`;

const LIST_CONTENT_SELECT = "id, title";

/** Select only the columns the list needs (content and ai_reviews); no heavy text. */
export async function fetchSubmissionsWithReviewsByUserId(
  userId: number,
  {
    page = 1,
    pageSize = SUBMISSIONS_PAGE_SIZE,
  }: {
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{
  data: SubmissionWithContentAndReview[] | null;
  count: number;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { from, to } = resolvePageRange(page, pageSize);

  const { data, count, error } = await supabase
    .from("submissions")
    .select(`*, content:learning_contents(${LIST_CONTENT_SELECT}), ${AI_REVIEW_LIST_SELECT}`, {
      count: "exact",
    })
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("提出+レビュー取得エラー:", error.message);
    return { data: null, count: 0, error };
  }

  return {
    data: data as SubmissionWithContentAndReview[],
    count: count ?? 0,
    error: null,
  };
}

/**
 * Admin / instructor list (service_role). Fetch only the requested page via range and return the
 * total via count, so heavy rows with code bodies are never loaded in full. content selects only
 * list columns (no text_content etc.).
 */
export async function fetchAllSubmissionsWithReviews({
  page = 1,
  pageSize = SUBMISSIONS_PAGE_SIZE,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<{
  data: AdminSubmissionWithReview[] | null;
  count: number;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { from, to } = resolvePageRange(page, pageSize);

  const { data, count, error } = await supabase
    .from("submissions")
    .select(
      `*, user:users(id, display_name, email), content:learning_contents(${LIST_CONTENT_SELECT}), ${AI_REVIEW_ADMIN_LIST_SELECT}`,
      { count: "exact" }
    )
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
    .overrideTypes<AdminSubmissionWithReview[], { merge: false }>();

  if (error) {
    console.error("提出+レビュー一覧取得エラー:", error.message);
    return { data: null, count: 0, error };
  }

  return { data, count: count ?? 0, error: null };
}

/** Uses the admin client to avoid depending on RLS; safety comes from the userId filter. */
export async function fetchCompletedAIReviewByContentId(
  userId: number,
  contentId: number
): Promise<{ data: AIReviewListItem | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { data: submission, error } = await supabase
    .from("submissions")
    .select(`id, content_id, ai_review:ai_reviews!inner(${AI_REVIEW_STUDENT_COLUMNS})`)
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .eq("ai_review.status", "completed")
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("AIレビュー取得エラー (fetchCompletedAIReviewByContentId):", error.message);
    return { data: null, error };
  }

  if (!submission?.ai_review) {
    return { data: null, error: null };
  }

  // ai_reviews.submission_id is UNIQUE so PostgREST returns a to-one object; generated types also
  // allow to-many, hence the cast via unknown.
  return { data: submission.ai_review as unknown as AIReviewListItem, error: null };
}

/** Uses the admin client to avoid depending on RLS; safety comes from the userId filter. */
export async function fetchCompletedAIReviewContentIds(
  userId: number,
  contentIds: number[]
): Promise<{ data: Set<number>; error: PostgrestError | null }> {
  if (contentIds.length === 0) {
    return { data: new Set(), error: null };
  }

  const supabase = await createAdminSupabaseClient();

  const { data: subs, error } = await supabase
    .from("submissions")
    .select("content_id, ai_review:ai_reviews!inner(status)")
    .eq("user_id", userId)
    .in("content_id", contentIds)
    .eq("ai_review.status", "completed");

  if (error) {
    console.error("AIレビュー取得エラー (fetchCompletedAIReviewContentIds):", error.message);
    return { data: new Set(), error };
  }

  const reviewedContentIds = new Set((subs ?? []).map((s) => s.content_id));

  return { data: reviewedContentIds, error: null };
}

export async function upsertPendingAIReview(submissionId: number): Promise<{ id: number } | null> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("ai_reviews")
    .upsert(
      {
        submission_id: submissionId,
        status: "pending",
        review_content: null,
        overall_score: null,
        error_message: null,
        reviewed_at: null,
        review_json: null,
        rubric_version: null,
        passed: null,
        // Token columns are deliberately absent: a reused failed row keeps the tokens already
        // billed so the completed/failed update adds to them instead of losing earlier attempts.
        //
        // Reused failed rows would otherwise keep their original day and escape the per-day count.
        created_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("AIレビュー作成エラー:", error.message);
    return null;
  }

  return data;
}

export async function updateAIReviewProcessing(reviewId: number): Promise<boolean> {
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("ai_reviews")
    .update({ status: "processing" })
    .eq("id", reviewId);

  if (error) {
    console.error("AIレビュー更新エラー:", error.message);
    return false;
  }

  return true;
}

export interface AIReviewTokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  thoughtsTokens: number | null;
}

function addTokens(previous: number | null, current: number | null): number | null {
  if (previous === null && current === null) {
    return null;
  }
  return (previous ?? 0) + (current ?? 0);
}

/**
 * Token columns are cumulative over every attempt on the same submission (a failed row is reused
 * on retry), because failed attempts are billed too. Read-then-write is best effort: the route's
 * processing check keeps concurrent attempts rare but doesn't make them impossible. When the read
 * fails the columns are left untouched, since writing only this attempt's tokens would overwrite
 * the earlier total with a smaller one.
 */
async function accumulateTokens(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  reviewId: number,
  usage: AIReviewTokenUsage
) {
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("prompt_tokens, completion_tokens, thoughts_tokens")
    .eq("id", reviewId)
    .single();

  if (error) {
    console.error("AIレビュー トークン取得エラー:", error.message, { reviewId, ...usage });
    return null;
  }

  return {
    prompt_tokens: addTokens(data?.prompt_tokens ?? null, usage.promptTokens),
    completion_tokens: addTokens(data?.completion_tokens ?? null, usage.completionTokens),
    thoughts_tokens: addTokens(data?.thoughts_tokens ?? null, usage.thoughtsTokens),
  };
}

export async function updateAIReviewCompleted(
  reviewId: number,
  params: AIReviewTokenUsage & {
    reviewContent: string;
    overallScore: number | null;
    reviewJson: ReviewJson;
    scoreKind: ScoreKind;
    rubricVersion: number | null;
    passed: boolean | null;
    modelUsed: string;
  }
): Promise<boolean> {
  const supabase = await createAdminSupabaseClient();
  const tokens = await accumulateTokens(supabase, reviewId, params);

  const { error } = await supabase
    .from("ai_reviews")
    .update({
      status: "completed",
      review_content: params.reviewContent,
      overall_score: params.overallScore,
      review_json: params.reviewJson,
      score_kind: params.scoreKind,
      rubric_version: params.rubricVersion,
      passed: params.passed,
      model_used: params.modelUsed,
      ...tokens,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) {
    console.error("AIレビュー完了更新エラー:", error.message);
    return false;
  }

  return true;
}

/** `usage` is the tokens consumed before the failure (billed even though it failed). */
export async function updateAIReviewFailed(
  reviewId: number,
  errorMessage: string,
  usage?: AIReviewTokenUsage
): Promise<boolean> {
  const supabase = await createAdminSupabaseClient();
  const tokens = usage ? await accumulateTokens(supabase, reviewId, usage) : null;

  const { error } = await supabase
    .from("ai_reviews")
    .update({
      status: "failed",
      error_message: errorMessage,
      ...tokens,
    })
    .eq("id", reviewId);

  if (error) {
    console.error("AIレビュー失敗更新エラー:", error.message);
    return false;
  }

  return true;
}
