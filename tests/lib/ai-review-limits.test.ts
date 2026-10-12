import { describe, expect, it } from "vitest";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import {
  computeRemainingReviews,
  evaluateReviewRequest,
  getJstDayWindow,
  type ReviewUsageRow,
  trialLimitMessage,
} from "@/app/lib/ai-review-limits";

// 2026-10-12 14:00 JST. The JST day started at 2026-10-11T15:00:00Z.
const NOW = new Date("2026-10-12T05:00:00Z");
const TODAY = "2026-10-12T01:00:00Z";
const YESTERDAY = "2026-10-11T14:59:59Z";

let nextId = 1;
function row(
  submissionId: number,
  overrides: Partial<ReviewUsageRow & { id: number }> = {}
): ReviewUsageRow & { id: number } {
  return {
    id: nextId++,
    submission_id: submissionId,
    status: "completed",
    created_at: TODAY,
    ...overrides,
  };
}

describe("getJstDayWindow", () => {
  it("returns the JST day start and next JST midnight as UTC ISO strings", () => {
    expect(getJstDayWindow(NOW)).toEqual({
      startIso: "2026-10-11T15:00:00.000Z",
      resetsAt: "2026-10-12T15:00:00.000Z",
    });
  });

  it("uses the JST date, not the UTC date, just after JST midnight", () => {
    // 00:30 JST on 10/13 is still 10/12 in UTC.
    expect(getJstDayWindow(new Date("2026-10-12T15:30:00Z"))).toEqual({
      startIso: "2026-10-12T15:00:00.000Z",
      resetsAt: "2026-10-13T15:00:00.000Z",
    });
  });

  it("keeps the previous JST day one millisecond before JST midnight", () => {
    expect(getJstDayWindow(new Date("2026-10-12T14:59:59.999Z")).startIso).toBe(
      "2026-10-11T15:00:00.000Z"
    );
  });
});

describe("evaluateReviewRequest - active", () => {
  const evaluate = (
    contentReviews: ReturnType<typeof row>[],
    submissionId: number,
    todayTotal = contentReviews.length
  ) =>
    evaluateReviewRequest({
      userStatus: "active",
      submissionId,
      contentReviews,
      todayTotal,
      now: NOW,
    });

  it("allows the 1st review of the day with 1 remaining after it would be used", () => {
    expect(evaluate([], 1, 0)).toEqual({ kind: "allowed", remaining: 2 });
  });

  it("allows the 2nd review of the day on a new submission (limit boundary)", () => {
    expect(evaluate([row(1)], 2)).toEqual({ kind: "allowed", remaining: 1 });
  });

  it("rejects the 3rd review of the day for the same content", () => {
    const decision = evaluate([row(1), row(2)], 3);
    expect(decision).toMatchObject({
      kind: "limited",
      reason: "content_daily",
      remaining: 0,
      resetsAt: "2026-10-12T15:00:00.000Z",
    });
    expect(decision.kind === "limited" && decision.message).toBe(
      `本日のこの課題の AI レビュー回数（${AI_REVIEW_LIMITS.active.perContentPerDay} 回）を使い切りました。明日また提出できます`
    );
  });

  it("does not count reviews created before the JST day boundary", () => {
    const decision = evaluate([row(1, { created_at: YESTERDAY }), row(2)], 3, 1);
    expect(decision).toEqual({ kind: "allowed", remaining: 1 });
  });

  it("counts a review created exactly at JST midnight as today", () => {
    const decision = evaluate(
      [
        row(1, { created_at: "2026-10-11T15:00:00Z" }),
        row(2, { created_at: "2026-10-11T15:00:01Z" }),
      ],
      3
    );
    expect(decision).toMatchObject({ kind: "limited", reason: "content_daily" });
  });

  it("does not use the UTC date as the day boundary", () => {
    // 2026-10-12T00:30Z is 09:30 JST on 10/12, so it is today even though UTC midnight just passed.
    const decision = evaluate(
      [
        row(1, { created_at: "2026-10-11T23:30:00Z" }),
        row(2, { created_at: "2026-10-12T00:30:00Z" }),
      ],
      3
    );
    expect(decision).toMatchObject({ kind: "limited", reason: "content_daily" });
  });

  it("does not count failed reviews", () => {
    const decision = evaluate([row(1, { status: "failed" }), row(2, { status: "failed" })], 3, 0);
    expect(decision).toEqual({ kind: "allowed", remaining: 2 });
  });

  it("allows retrying a submission whose previous review failed", () => {
    expect(evaluate([row(1, { status: "failed" })], 1, 0)).toEqual({
      kind: "allowed",
      remaining: 2,
    });
  });

  it("rejects a second review for the same submission even when daily allowance remains", () => {
    const decision = evaluate([row(1)], 1);
    expect(decision).toMatchObject({
      kind: "limited",
      reason: "submission_reviewed",
      remaining: 1,
    });
  });

  it("rejects re-review of a pending submission", () => {
    expect(evaluate([row(1, { status: "pending" })], 1)).toMatchObject({
      kind: "limited",
      reason: "submission_reviewed",
    });
  });

  it("returns processing for a same-submission request while it is generating", () => {
    const processing = row(1, { status: "processing" });
    expect(evaluate([processing], 1)).toEqual({ kind: "processing", reviewId: processing.id });
  });

  it("treats processing on a different submission as a counted review", () => {
    expect(evaluate([row(1, { status: "processing" })], 2)).toEqual({
      kind: "allowed",
      remaining: 1,
    });
  });

  it("allows the 10th review of the day across contents", () => {
    expect(evaluate([], 1, AI_REVIEW_LIMITS.active.perDay - 1)).toMatchObject({
      kind: "allowed",
    });
  });

  it("rejects the 11th review of the day across contents", () => {
    const decision = evaluate([], 1, AI_REVIEW_LIMITS.active.perDay);
    expect(decision).toMatchObject({ kind: "limited", reason: "user_daily", remaining: 0 });
    expect(decision.kind === "limited" && decision.message).toContain(
      String(AI_REVIEW_LIMITS.active.perDay)
    );
  });

  it("caps remaining by the daily total when it is the tighter limit", () => {
    expect(evaluate([], 1, AI_REVIEW_LIMITS.active.perDay - 1)).toEqual({
      kind: "allowed",
      remaining: 1,
    });
  });
});

describe("evaluateReviewRequest - trial", () => {
  const evaluate = (contentReviews: ReturnType<typeof row>[], submissionId: number) =>
    evaluateReviewRequest({
      userStatus: "trial",
      submissionId,
      contentReviews,
      todayTotal: 0,
      now: NOW,
    });

  it("allows the first review", () => {
    expect(evaluate([], 1)).toEqual({ kind: "allowed", remaining: 1 });
  });

  it("rejects the second review on a new submission, with a trial message and remaining 0", () => {
    const decision = evaluate([row(1)], 2);
    expect(decision).toMatchObject({
      kind: "limited",
      reason: "trial_lifetime",
      remaining: 0,
      message: trialLimitMessage(),
    });
    expect(trialLimitMessage()).toBe(
      "お試しプランでは AI レビューは 1 課題につき 1 回です。有料会員は 1 日 2 回まで再レビューできます"
    );
  });

  it("rejects even when the existing review is from a previous day", () => {
    expect(evaluate([row(1, { created_at: "2026-09-01T00:00:00Z" })], 2)).toMatchObject({
      kind: "limited",
      reason: "trial_lifetime",
    });
  });

  it("does not count failed reviews", () => {
    expect(evaluate([row(1, { status: "failed" })], 2)).toEqual({ kind: "allowed", remaining: 1 });
  });

  it("returns processing for the same submission", () => {
    const processing = row(1, { status: "processing" });
    expect(evaluate([processing], 1)).toEqual({ kind: "processing", reviewId: processing.id });
  });

  it("ignores the daily total", () => {
    expect(
      evaluateReviewRequest({
        userStatus: "trial",
        submissionId: 1,
        contentReviews: [],
        todayTotal: 999,
        now: NOW,
      })
    ).toEqual({ kind: "allowed", remaining: 1 });
  });
});

describe("computeRemainingReviews", () => {
  const remaining = (
    userStatus: "active" | "trial" | null,
    contentReviews: ReturnType<typeof row>[],
    todayTotal = 0
  ) => computeRemainingReviews({ userStatus, contentReviews, todayTotal, now: NOW });

  it("active: starts at the per-content daily limit and drops per review", () => {
    expect(remaining("active", [])).toBe(2);
    expect(remaining("active", [row(1)])).toBe(1);
    expect(remaining("active", [row(1), row(2)])).toBe(0);
    expect(remaining("active", [row(1), row(2), row(3)])).toBe(0);
  });

  it("active: ignores yesterday's and failed reviews", () => {
    expect(
      remaining("active", [row(1, { created_at: YESTERDAY }), row(2, { status: "failed" })])
    ).toBe(2);
  });

  it("active: the daily total can make it lower than the per-content remaining", () => {
    expect(remaining("active", [], AI_REVIEW_LIMITS.active.perDay - 1)).toBe(1);
    expect(remaining("active", [], AI_REVIEW_LIMITS.active.perDay)).toBe(0);
  });

  it("trial: 1 before any review, 0 after", () => {
    expect(remaining("trial", [])).toBe(1);
    expect(remaining("trial", [row(1, { created_at: "2026-01-01T00:00:00Z" })])).toBe(0);
    expect(remaining("trial", [row(1, { status: "failed" })])).toBe(1);
  });

  it("other statuses get 0", () => {
    expect(remaining(null, [])).toBe(0);
  });
});
