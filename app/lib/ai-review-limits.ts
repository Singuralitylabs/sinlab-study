import { AI_REVIEW_LIMITS, AI_REVIEW_STALE_AFTER_MS } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";
import { addDays, jstStartOfDayIso, toJstDateString } from "./email-digest";

export interface ReviewUsageRow {
  id: number;
  submission_id: number;
  status: string;
  created_at: string;
}

export type ReviewLimitReason =
  | "trial_lifetime"
  | "submission_reviewed"
  | "content_daily"
  | "user_daily";

export type ReviewLimitDecision =
  | { kind: "processing"; reviewId: number }
  | { kind: "allowed"; remaining: number }
  | {
      kind: "limited";
      reason: ReviewLimitReason;
      remaining: number;
      /** null when the limit doesn't lift on its own (it never resets at midnight). */
      resetsAt: string | null;
      message: string;
    };

export function getJstDayWindow(now: Date): { startIso: string; resetsAt: string } {
  const today = toJstDateString(now);
  return {
    startIso: jstStartOfDayIso(today),
    resetsAt: jstStartOfDayIso(addDays(today, 1)),
  };
}

/** Oldest created_at at which a pending / processing row still counts as in flight. */
export function staleReviewCutoff(now: Date): Date {
  return new Date(now.getTime() - AI_REVIEW_STALE_AFTER_MS);
}

/**
 * Rows must already be limited to the user's own submissions for the content. `failed` rows and
 * dead pending / processing rows (see AI_REVIEW_STALE_AFTER_MS) don't count.
 */
function countableRows<T extends { status: string; created_at: string }>(
  rows: readonly T[],
  now: Date
): T[] {
  const cutoffMs = staleReviewCutoff(now).getTime();
  return rows.filter((row) => {
    if (row.status === "failed") {
      return false;
    }
    const inFlight = row.status === "pending" || row.status === "processing";
    return !(inFlight && Date.parse(row.created_at) < cutoffMs);
  });
}

function countCreatedSince(rows: readonly ReviewUsageRow[], startIso: string): number {
  const startMs = Date.parse(startIso);
  return rows.filter((row) => Date.parse(row.created_at) >= startMs).length;
}

export function computeRemainingReviews({
  userStatus,
  contentReviews,
  todayTotal,
  now,
}: {
  userStatus: UserStatusType | null;
  contentReviews: readonly ReviewUsageRow[];
  todayTotal: number;
  now: Date;
}): number {
  const countable = countableRows(contentReviews, now);

  if (userStatus === USER_STATUS.ACTIVE) {
    const { startIso } = getJstDayWindow(now);
    const contentToday = countCreatedSince(countable, startIso);
    return Math.max(
      0,
      Math.min(
        AI_REVIEW_LIMITS.active.perContentPerDay - contentToday,
        AI_REVIEW_LIMITS.active.perDay - todayTotal
      )
    );
  }

  if (userStatus === USER_STATUS.TRIAL) {
    return Math.max(0, AI_REVIEW_LIMITS.trial.perContentLifetime - countable.length);
  }

  return 0;
}

export function trialLimitMessage(): string {
  return `お試しプランでは AI レビューは 1 課題につき ${AI_REVIEW_LIMITS.trial.perContentLifetime} 回です。有料会員は 1 日 ${AI_REVIEW_LIMITS.active.perContentPerDay} 回まで再レビューできます`;
}

function contentDailyMessage(): string {
  return `本日のこの課題の AI レビュー回数（${AI_REVIEW_LIMITS.active.perContentPerDay} 回）を使い切りました。明日また提出できます`;
}

function userDailyMessage(): string {
  return `本日の AI レビュー回数の上限（${AI_REVIEW_LIMITS.active.perDay} 回）に達しました。明日またご利用ください`;
}

function submissionReviewedMessage(): string {
  return "この提出の AI レビューは実行済みです。コードを直して新しく提出すると再レビューできます";
}

/**
 * Builds the 429 decision for a refusal reason. Shared by evaluateReviewRequest() and by the
 * route, which receives the reason from the claim_ai_review() RPC (#343) so both phrase and
 * time it the same.
 */
export function limitedDecision(
  reason: ReviewLimitReason,
  remaining: number,
  now: Date
): Extract<ReviewLimitDecision, { kind: "limited" }> {
  const { resetsAt } = getJstDayWindow(now);
  switch (reason) {
    case "trial_lifetime":
      return {
        kind: "limited",
        reason,
        remaining: 0,
        resetsAt: null,
        message: trialLimitMessage(),
      };
    case "submission_reviewed":
      return {
        kind: "limited",
        reason,
        remaining,
        resetsAt: null,
        message: submissionReviewedMessage(),
      };
    case "content_daily":
      return { kind: "limited", reason, remaining: 0, resetsAt, message: contentDailyMessage() };
    case "user_daily":
      return { kind: "limited", reason, remaining: 0, resetsAt, message: userDailyMessage() };
  }
}

/**
 * Decides one review request. The route claims through claim_ai_review() instead, which makes the
 * same decision in SQL inside a lock; this stays as the readable definition of the rules, kept in
 * step with it by the tests. `contentReviews` are the user's own reviews for the content (all
 * statuses; `failed` and dead in-flight rows are ignored here so a Gemini failure or a killed run
 * never uses up the allowance).
 * `todayTotal` is the user's non-failed reviews created today (JST) across all contents; it is
 * only consulted for active users.
 */
export function evaluateReviewRequest({
  userStatus,
  submissionId,
  contentReviews,
  todayTotal,
  now,
}: {
  userStatus: UserStatusType | null;
  submissionId: number;
  contentReviews: readonly ReviewUsageRow[];
  todayTotal: number;
  now: Date;
}): ReviewLimitDecision {
  const countable = countableRows(contentReviews, now);
  const { startIso } = getJstDayWindow(now);

  const sameSubmission = countable.find((row) => row.submission_id === submissionId);
  if (sameSubmission?.status === "processing" || sameSubmission?.status === "pending") {
    return { kind: "processing", reviewId: sameSubmission.id };
  }

  const remaining = computeRemainingReviews({ userStatus, contentReviews, todayTotal, now });

  if (userStatus === USER_STATUS.TRIAL) {
    if (countable.length >= AI_REVIEW_LIMITS.trial.perContentLifetime) {
      return limitedDecision("trial_lifetime", 0, now);
    }
    return { kind: "allowed", remaining };
  }

  // Checked before the daily limits: an already-reviewed submission can't be retried tomorrow
  // either, so it must not be told to "come back tomorrow".
  if (sameSubmission) {
    return limitedDecision("submission_reviewed", remaining, now);
  }

  const contentToday = countCreatedSince(countable, startIso);
  if (contentToday >= AI_REVIEW_LIMITS.active.perContentPerDay) {
    return limitedDecision("content_daily", 0, now);
  }
  if (todayTotal >= AI_REVIEW_LIMITS.active.perDay) {
    return limitedDecision("user_daily", 0, now);
  }

  return { kind: "allowed", remaining };
}
