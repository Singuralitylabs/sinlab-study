import {
  AI_CHAT_LIMIT_BOUNDS,
  AI_CHAT_LIMITS,
  AI_CHAT_STALE_AFTER_MS,
  type AIChatLimits,
} from "@/app/constants/ai-chat";
import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";
import { getJstDayWindow } from "./ai-review-limits";

export interface ChatUsageRow {
  status: string;
  created_at: string;
  counts_toward_limit?: boolean;
}

export type ChatLimitReason = "user_daily" | "trial_lifetime";

/** What the panel shows: how many questions are left and whether they come back at midnight. */
export interface ChatUsageSummary {
  remaining: number;
  limit: number;
  /** "daily" resets at JST midnight (active); "lifetime" never resets (trial). */
  period: "daily" | "lifetime";
  /** null for "lifetime". */
  resetsAt: string | null;
}

/** Oldest created_at at which a pending row still counts as in flight. */
export function staleChatCutoff(now: Date): Date {
  return new Date(now.getTime() - AI_CHAT_STALE_AFTER_MS);
}

/**
 * Rows that use up the allowance. `failed` (Gemini never answered) and dead pending rows don't, so
 * a failure or a killed function never costs the learner a question. Same rule as claim_ai_chat().
 */
export function countableChatRows<T extends ChatUsageRow>(rows: readonly T[], now: Date): T[] {
  const cutoffMs = staleChatCutoff(now).getTime();
  return rows.filter((row) => {
    if (row.status === "failed" || row.counts_toward_limit === false) {
      return false;
    }
    return !(row.status === "pending" && Date.parse(row.created_at) < cutoffMs);
  });
}

/**
 * `rows` must be the user's own usage rows: for active users at least everything created since the
 * JST day start, for trial users all of them. Other statuses get nothing.
 */
export function computeChatUsage({
  userStatus,
  rows,
  now,
  limits,
}: {
  userStatus: UserStatusType | null;
  rows: readonly ChatUsageRow[];
  now: Date;
  limits: AIChatLimits;
}): ChatUsageSummary {
  const countable = countableChatRows(rows, now);
  if (userStatus === USER_STATUS.ACTIVE) {
    const { startIso, resetsAt } = getJstDayWindow(now);
    const startMs = Date.parse(startIso);
    const today = countable.filter((row) => Date.parse(row.created_at) >= startMs).length;
    return {
      remaining: Math.max(0, limits.activePerDay - today),
      limit: limits.activePerDay,
      period: "daily",
      resetsAt,
    };
  }
  if (userStatus === USER_STATUS.TRIAL) {
    return {
      remaining: Math.max(0, limits.trialLifetime - countable.length),
      limit: limits.trialLifetime,
      period: "lifetime",
      resetsAt: null,
    };
  }
  return { remaining: 0, limit: 0, period: "lifetime", resetsAt: null };
}

/** The 429 body for a refusal reason returned by claim_ai_chat(). */
export function chatLimitedResponse(
  reason: ChatLimitReason,
  now: Date,
  limits: AIChatLimits
): { reason: ChatLimitReason; message: string; remaining: 0; resetsAt: string | null } {
  if (reason === "trial_lifetime") {
    return {
      reason,
      message: `お試しプランでシンラビに相談できる回数（${limits.trialLifetime} 回）を使い切りました`,
      remaining: 0,
      resetsAt: null,
    };
  }
  return {
    reason,
    message: `今日シンラビに相談できる回数（${limits.activePerDay} 回）を使い切りました。明日また使えます`,
    remaining: 0,
    resetsAt: getJstDayWindow(now).resetsAt,
  };
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function areAIChatLimitsValid(limits: AIChatLimits): boolean {
  const { activePerDay, trialLifetime } = AI_CHAT_LIMIT_BOUNDS;
  return (
    isIntInRange(limits.activePerDay, activePerDay.min, activePerDay.max) &&
    isIntInRange(limits.trialLifetime, trialLifetime.min, trialLifetime.max)
  );
}

export interface AIChatSettingsRow {
  active_per_day: unknown;
  trial_lifetime: unknown;
}

/**
 * Settings row to limits. Missing or out-of-range values fall back to the code defaults, which are
 * also the migration's initial values, so a settings outage behaves like an untouched setting.
 */
export function parseAIChatLimits(row: AIChatSettingsRow | null): AIChatLimits {
  if (!row) {
    return AI_CHAT_LIMITS;
  }
  const limits = {
    activePerDay: row.active_per_day as number,
    trialLifetime: row.trial_lifetime as number,
  };
  return areAIChatLimitsValid(limits) ? limits : AI_CHAT_LIMITS;
}
