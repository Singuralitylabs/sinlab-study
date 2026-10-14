import type { PostgrestError } from "@supabase/supabase-js";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { SUBMISSIONS_PAGE_SIZE } from "@/app/constants/submissions";
import {
  getJstDayWindow,
  type ReviewLimitReason,
  staleReviewCutoff,
} from "@/app/lib/ai-review-limits";
import { resolvePageRange } from "@/app/lib/submissions-pagination";
import { addTokenCount, type TokenUsage } from "@/app/lib/token-usage";
import type {
  AdminSubmissionWithReview,
  AIReviewListItem,
  ReviewJson,
  ScoreKind,
  SubmissionWithContentAndReview,
  UserStatusType,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

const AI_REVIEW_STUDENT_COLUMNS =
  "id, status, overall_score, review_content, reviewed_at, error_message, review_json, score_kind, rubric_version, passed";

/** Token counts are billing data for admin / maintainer only; students never select them. */
const AI_REVIEW_ADMIN_COLUMNS = `${AI_REVIEW_STUDENT_COLUMNS}, prompt_tokens, completion_tokens, thoughts_tokens`;

const AI_REVIEW_LIST_SELECT = `ai_review:ai_reviews(${AI_REVIEW_STUDENT_COLUMNS})`;
const AI_REVIEW_ADMIN_LIST_SELECT = `ai_review:ai_reviews(${AI_REVIEW_ADMIN_COLUMNS})`;

// code_language fills in the language of single-file submissions, which store none (history preview).
const LIST_CONTENT_SELECT = "id, title, code_language";

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

/**
 * Uses the admin client to avoid depending on RLS; safety comes from the userId filter.
 * `submissionId` is the submission this completed review belongs to. The inner join keeps the
 * latest submission that has a completed review, which can be older than the latest submission.
 */
export async function fetchCompletedAIReviewByContentId(
  userId: number,
  contentId: number
): Promise<{
  data: AIReviewListItem | null;
  submissionId: number | null;
  error: PostgrestError | null;
}> {
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
    return { data: null, submissionId: null, error };
  }

  if (!submission?.ai_review) {
    return { data: null, submissionId: null, error: null };
  }

  // ai_reviews.submission_id is UNIQUE so PostgREST returns a to-one object; generated types also
  // allow to-many, hence the cast via unknown.
  return {
    data: submission.ai_review as unknown as AIReviewListItem,
    submissionId: submission.id,
    error: null,
  };
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

export type AIReviewClaim =
  | { kind: "claimed"; reviewId: number; remaining: number }
  | { kind: "processing"; reviewId: number }
  | { kind: "limited"; reason: ReviewLimitReason; remaining: number }
  | { kind: "busy" };

const LIMIT_REASONS: readonly ReviewLimitReason[] = [
  "trial_lifetime",
  "submission_reviewed",
  "content_daily",
  "user_daily",
];

/**
 * Checks the count limits and takes the submission's single review slot in one transaction
 * (claim_ai_review(), serialized per user by an advisory lock), so concurrent requests of one user
 * cannot all read the same counts and pass (#343). A new row is inserted, or a reusable one
 * (failed, or pending / processing that died past `staleBefore`) is reset. "busy" means another
 * request holds the row, so two concurrent requests can't both call Gemini on one submission or
 * reset a completed review to pending. null is a DB error (fail closed: no review starts).
 */
export async function claimAIReview({
  userId,
  submissionId,
  contentId,
  userStatus,
  now,
}: {
  userId: number;
  submissionId: number;
  contentId: number;
  userStatus: UserStatusType | null;
  now: Date;
}): Promise<AIReviewClaim | null> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("claim_ai_review", {
    p_user_id: userId,
    p_submission_id: submissionId,
    p_content_id: contentId,
    // null (not a learner) is rejected by the RPC, which fails closed.
    p_user_status: userStatus ?? "",
    p_stale_before: staleReviewCutoff(now).toISOString(),
    p_day_start: getJstDayWindow(now).startIso,
    p_active_per_content_per_day: AI_REVIEW_LIMITS.active.perContentPerDay,
    p_active_per_day: AI_REVIEW_LIMITS.active.perDay,
    p_trial_per_content_lifetime: AI_REVIEW_LIMITS.trial.perContentLifetime,
  });

  if (error) {
    console.error("AIレビュー枠確保エラー:", error.message);
    return null;
  }

  const result = data as {
    outcome?: string;
    review_id?: number;
    reason?: string;
    remaining?: number;
  } | null;
  switch (result?.outcome) {
    case "claimed":
      if (typeof result.review_id === "number") {
        return { kind: "claimed", reviewId: result.review_id, remaining: result.remaining ?? 0 };
      }
      break;
    case "processing":
      if (typeof result.review_id === "number") {
        return { kind: "processing", reviewId: result.review_id };
      }
      break;
    case "limited": {
      const reason = LIMIT_REASONS.find((r) => r === result.reason);
      if (reason) {
        return { kind: "limited", reason, remaining: result.remaining ?? 0 };
      }
      break;
    }
    case "busy":
      return { kind: "busy" };
  }
  console.error("AIレビュー枠確保の応答が不正です:", JSON.stringify(data));
  return null;
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

/**
 * Token columns are cumulative over every attempt on the same submission (a failed row is reused
 * on retry), because failed attempts are billed too. A plain read-then-write is enough because
 * claim_ai_review() lets only one attempt hold a row at a time. When the read fails the
 * columns are left untouched, since writing only this attempt's tokens would overwrite the
 * earlier total with a smaller one.
 */
async function accumulateTokens(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  reviewId: number,
  usage: TokenUsage
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
    prompt_tokens: addTokenCount(data?.prompt_tokens ?? null, usage.promptTokens),
    completion_tokens: addTokenCount(data?.completion_tokens ?? null, usage.completionTokens),
    thoughts_tokens: addTokenCount(data?.thoughts_tokens ?? null, usage.thoughtsTokens),
  };
}

export async function updateAIReviewCompleted(
  reviewId: number,
  params: TokenUsage & {
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
  usage?: TokenUsage
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
