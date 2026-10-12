import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";
import { addDays, jstStartOfDayIso, toJstDateString } from "./email-digest";

export interface ReviewUsageRow {
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
      resetsAt: string;
      message: string;
    };

export function getJstDayWindow(now: Date): { startIso: string; resetsAt: string } {
  const today = toJstDateString(now);
  return {
    startIso: jstStartOfDayIso(today),
    resetsAt: jstStartOfDayIso(addDays(today, 1)),
  };
}

/** Rows must already be limited to the user's own submissions for the content. */
function countableRows<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.status !== "failed");
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
  const countable = countableRows(contentReviews);

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
 * Decides one review request. `contentReviews` are the user's own reviews for the content (all
 * statuses; `failed` is ignored here so a Gemini failure never uses up the allowance).
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
  contentReviews: readonly (ReviewUsageRow & { id?: number })[];
  todayTotal: number;
  now: Date;
}): ReviewLimitDecision {
  const countable = countableRows(contentReviews);
  const { startIso, resetsAt } = getJstDayWindow(now);

  const sameSubmission = countable.find((row) => row.submission_id === submissionId);
  if (sameSubmission?.status === "processing") {
    return { kind: "processing", reviewId: sameSubmission.id ?? 0 };
  }

  const remaining = computeRemainingReviews({ userStatus, contentReviews, todayTotal, now });

  if (userStatus === USER_STATUS.TRIAL) {
    if (countable.length >= AI_REVIEW_LIMITS.trial.perContentLifetime) {
      return {
        kind: "limited",
        reason: "trial_lifetime",
        remaining: 0,
        resetsAt,
        message: trialLimitMessage(),
      };
    }
    return { kind: "allowed", remaining };
  }

  const contentToday = countCreatedSince(countable, startIso);
  if (contentToday >= AI_REVIEW_LIMITS.active.perContentPerDay) {
    return {
      kind: "limited",
      reason: "content_daily",
      remaining: 0,
      resetsAt,
      message: contentDailyMessage(),
    };
  }
  if (todayTotal >= AI_REVIEW_LIMITS.active.perDay) {
    return {
      kind: "limited",
      reason: "user_daily",
      remaining: 0,
      resetsAt,
      message: userDailyMessage(),
    };
  }
  if (sameSubmission) {
    return {
      kind: "limited",
      reason: "submission_reviewed",
      remaining,
      resetsAt,
      message: submissionReviewedMessage(),
    };
  }

  return { kind: "allowed", remaining };
}
