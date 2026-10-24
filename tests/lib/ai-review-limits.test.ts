import { describe, expect, it } from "vitest";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import {
  areAIReviewLimitsValid,
  computeRemainingReviews,
  evaluateReviewRequest,
  getJstDayWindow,
  limitedDecision,
  parseAIReviewLimits,
  type ReviewUsageRow,
  trialLimitMessage,
} from "@/app/lib/ai-review-limits";

// 2026-10-12 14:00 JST. The JST day started at 2026-10-11T15:00:00Z.
const NOW = new Date("2026-10-12T05:00:00Z");
const TODAY = "2026-10-12T01:00:00Z";
const YESTERDAY = "2026-10-11T14:59:59Z";
// Seconds before NOW: an in-flight row this young is still running, an older one is dead.
const RUNNING = "2026-10-12T04:59:30Z";
const DEAD = "2026-10-12T04:00:00Z";

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

describe("limitedDecision", () => {
  it("日次の理由には JST 翌0時の resetsAt を付け、解除されない理由には付けない", () => {
    expect(limitedDecision("content_daily", 0, NOW, AI_REVIEW_LIMITS)).toMatchObject({
      remaining: 0,
      resetsAt: "2026-10-12T15:00:00.000Z",
    });
    expect(limitedDecision("user_daily", 0, NOW, AI_REVIEW_LIMITS).resetsAt).toBe(
      "2026-10-12T15:00:00.000Z"
    );
    expect(limitedDecision("trial_lifetime", 0, NOW, AI_REVIEW_LIMITS)).toMatchObject({
      resetsAt: null,
      message: trialLimitMessage(AI_REVIEW_LIMITS),
    });
    expect(limitedDecision("submission_reviewed", 1, NOW, AI_REVIEW_LIMITS)).toMatchObject({
      remaining: 1,
      resetsAt: null,
    });
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
      limits: AI_REVIEW_LIMITS,
    });

  it("allows the 1st review of the day and counts it toward remaining", () => {
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
      resetsAt: null,
    });
  });

  it("answers submission_reviewed (no resetsAt) before the daily limits for a reviewed submission", () => {
    const decision = evaluate([row(1), row(2)], 1);
    expect(decision).toMatchObject({
      kind: "limited",
      reason: "submission_reviewed",
      remaining: 0,
      resetsAt: null,
    });
  });

  it.each(["pending", "processing"])(
    "returns processing for a same-submission request while it is %s",
    (status) => {
      const inFlight = row(1, { status, created_at: RUNNING });
      expect(evaluate([inFlight], 1)).toEqual({ kind: "processing", reviewId: inFlight.id });
    }
  );

  it("treats a running review on a different submission as a counted review", () => {
    expect(evaluate([row(1, { status: "processing", created_at: RUNNING })], 2)).toEqual({
      kind: "allowed",
      remaining: 1,
    });
  });

  it.each(["pending", "processing"])(
    "ignores a dead %s row (killed run): it neither blocks a retry nor uses up the allowance",
    (status) => {
      expect(evaluate([row(1, { status, created_at: DEAD })], 1, 0)).toEqual({
        kind: "allowed",
        remaining: 2,
      });
    }
  );

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
      limits: AI_REVIEW_LIMITS,
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
      resetsAt: null,
      message: trialLimitMessage(AI_REVIEW_LIMITS),
    });
    expect(trialLimitMessage(AI_REVIEW_LIMITS)).toBe(
      "お試しプランでは AI レビューは 1 課題につき 1 回です。有料会員は 1課題につき1日2回、全課題の合計で1日10回まで再レビューできます"
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
    const processing = row(1, { status: "processing", created_at: RUNNING });
    expect(evaluate([processing], 1)).toEqual({ kind: "processing", reviewId: processing.id });
  });

  it("does not let a dead processing row lock the lifetime review", () => {
    expect(evaluate([row(1, { status: "processing", created_at: DEAD })], 1)).toEqual({
      kind: "allowed",
      remaining: 1,
    });
  });

  it("ignores the daily total", () => {
    expect(
      evaluateReviewRequest({
        userStatus: "trial",
        submissionId: 1,
        contentReviews: [],
        todayTotal: 999,
        now: NOW,
        limits: AI_REVIEW_LIMITS,
      })
    ).toEqual({ kind: "allowed", remaining: 1 });
  });
});

describe("computeRemainingReviews", () => {
  const remaining = (
    userStatus: "active" | "trial" | null,
    contentReviews: ReturnType<typeof row>[],
    todayTotal = 0
  ) =>
    computeRemainingReviews({
      userStatus,
      contentReviews,
      todayTotal,
      now: NOW,
      limits: AI_REVIEW_LIMITS,
    });

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

describe("管理者がリセットした行 (counts_toward_limit = false)", () => {
  it("上限に数えないので、残り回数が回復する", () => {
    const reset = [row(1, { counts_toward_limit: false }), row(2, { counts_toward_limit: false })];
    expect(
      computeRemainingReviews({
        userStatus: "active",
        contentReviews: reset,
        todayTotal: 0,
        now: NOW,
        limits: AI_REVIEW_LIMITS,
      })
    ).toBe(AI_REVIEW_LIMITS.active.perContentPerDay);
  });

  it("お試しの生涯上限も回復する", () => {
    expect(
      computeRemainingReviews({
        userStatus: "trial",
        contentReviews: [row(1, { counts_toward_limit: false })],
        todayTotal: 0,
        now: NOW,
        limits: AI_REVIEW_LIMITS,
      })
    ).toBe(AI_REVIEW_LIMITS.trial.perContentLifetime);
  });

  it("別の提出は通るが、レビュー済みの同じ提出は submission_reviewed のまま", () => {
    const contentReviews = [row(1, { counts_toward_limit: false })];
    const base = {
      userStatus: "active" as const,
      contentReviews,
      todayTotal: 0,
      now: NOW,
      limits: AI_REVIEW_LIMITS,
    };

    expect(evaluateReviewRequest({ ...base, submissionId: 2 }).kind).toBe("allowed");
    expect(evaluateReviewRequest({ ...base, submissionId: 1 })).toMatchObject({
      kind: "limited",
      reason: "submission_reviewed",
    });
  });
});

describe("カスタム上限値", () => {
  const custom = {
    active: { perContentPerDay: 5, perDay: 30 },
    trial: { perContentLifetime: 3 },
  };

  it("有料: 設定した回数で残りと拒否が決まる", () => {
    const base = { userStatus: "active" as const, submissionId: 99, todayTotal: 4, now: NOW };
    const reviews = [row(1), row(2), row(3)];

    expect(evaluateReviewRequest({ ...base, contentReviews: reviews, limits: custom })).toEqual({
      kind: "allowed",
      remaining: 2,
    });
    expect(
      evaluateReviewRequest({
        ...base,
        contentReviews: [...reviews, row(4), row(5)],
        limits: custom,
      })
    ).toMatchObject({ kind: "limited", reason: "content_daily" });
    expect(
      evaluateReviewRequest({
        ...base,
        contentReviews: reviews,
        todayTotal: 30,
        limits: custom,
      })
    ).toMatchObject({ kind: "limited", reason: "user_daily" });
  });

  it("お試し: 生涯回数は設定値で、メッセージにも設定値が入る", () => {
    const decision = evaluateReviewRequest({
      userStatus: "trial",
      submissionId: 99,
      contentReviews: [row(1), row(2), row(3)],
      todayTotal: 0,
      now: NOW,
      limits: custom,
    });

    expect(decision).toMatchObject({ kind: "limited", reason: "trial_lifetime" });
    expect(trialLimitMessage(custom)).toContain("1 課題につき 3 回");
    expect(trialLimitMessage(custom)).toContain("1課題につき1日5回、全課題の合計で1日30回");
  });
});

describe("parseAIReviewLimits / areAIReviewLimitsValid", () => {
  const rowOf = (a: unknown, b: unknown, c: unknown) => ({
    active_per_content_per_day: a,
    active_per_day: b,
    trial_per_content_lifetime: c,
  });

  it("正常な行はその値を返す", () => {
    expect(parseAIReviewLimits(rowOf(3, 20, 2))).toEqual({
      active: { perContentPerDay: 3, perDay: 20 },
      trial: { perContentLifetime: 2 },
    });
  });

  it.each([
    ["行なし", null],
    ["範囲外", rowOf(21, 30, 1)],
    ["0回", rowOf(0, 10, 1)],
    ["小数", rowOf(2.5, 10, 1)],
    ["文字列", rowOf("2", 10, 1)],
    ["合計が課題ごとより小さい", rowOf(5, 4, 1)],
  ])("%s は既定値に戻す", (_label, input) => {
    expect(parseAIReviewLimits(input)).toBe(AI_REVIEW_LIMITS);
  });

  it("境界値（最小・最大）は有効", () => {
    expect(
      areAIReviewLimitsValid({
        active: { perContentPerDay: 1, perDay: 1 },
        trial: { perContentLifetime: 1 },
      })
    ).toBe(true);
    expect(
      areAIReviewLimitsValid({
        active: { perContentPerDay: 20, perDay: 100 },
        trial: { perContentLifetime: 10 },
      })
    ).toBe(true);
  });
});
