import { describe, expect, it } from "vitest";
import { AI_CHAT_LIMITS } from "@/app/constants/ai-chat";
import {
  areAIChatLimitsValid,
  type ChatUsageRow,
  chatLimitedResponse,
  computeChatUsage,
  parseAIChatLimits,
} from "@/app/lib/ai-chat-limits";

// 2026-11-17 14:00 JST. The JST day started at 2026-11-16T15:00:00Z.
const NOW = new Date("2026-11-17T05:00:00Z");
const TODAY = "2026-11-17T01:00:00Z";
const JUST_AFTER_MIDNIGHT = "2026-11-16T15:00:00Z";
const YESTERDAY_LATE = "2026-11-16T14:59:59Z";
const RUNNING = "2026-11-17T04:59:30Z";
const DEAD = "2026-11-17T04:00:00Z";

const limits = { activePerDay: 3, trialLifetime: 2 };

function row(overrides: Partial<ChatUsageRow> = {}): ChatUsageRow {
  return { status: "completed", created_at: TODAY, ...overrides };
}

describe("computeChatUsage - 有料会員（1日・JST）", () => {
  it("JST の 0 時より前の行は数えず、0 時ちょうどの行は数える", () => {
    const usage = computeChatUsage({
      userStatus: "active",
      rows: [row({ created_at: YESTERDAY_LATE }), row({ created_at: JUST_AFTER_MIDNIGHT })],
      now: NOW,
      limits,
    });
    expect(usage).toEqual({
      remaining: 2,
      limit: 3,
      period: "daily",
      resetsAt: "2026-11-17T15:00:00.000Z",
    });
  });

  it("failed と古い pending と管理者のリセット行は数えない。動いている pending は数える", () => {
    const usage = computeChatUsage({
      userStatus: "active",
      rows: [
        row({ status: "failed" }),
        row({ status: "pending", created_at: DEAD }),
        row({ counts_toward_limit: false }),
        row({ status: "pending", created_at: RUNNING }),
      ],
      now: NOW,
      limits,
    });
    expect(usage.remaining).toBe(2);
  });

  it("使い切ったら 0（マイナスにしない）", () => {
    const usage = computeChatUsage({
      userStatus: "active",
      rows: [row(), row(), row(), row()],
      now: NOW,
      limits,
    });
    expect(usage.remaining).toBe(0);
  });
});

describe("computeChatUsage - お試し（通算）", () => {
  it("日付に関係なく通算で数え、リセット時刻は無い", () => {
    const usage = computeChatUsage({
      userStatus: "trial",
      rows: [row({ created_at: "2026-10-01T00:00:00Z" }), row({ status: "failed" })],
      now: NOW,
      limits,
    });
    expect(usage).toEqual({ remaining: 1, limit: 2, period: "lifetime", resetsAt: null });
  });

  it("受講生以外の状態は 0 回", () => {
    expect(computeChatUsage({ userStatus: "rejected", rows: [], now: NOW, limits }).remaining).toBe(
      0
    );
  });
});

describe("chatLimitedResponse", () => {
  it("有料会員は翌日の 0 時（JST）にリセットされると返す", () => {
    const res = chatLimitedResponse("user_daily", NOW, limits);
    expect(res.resetsAt).toBe("2026-11-17T15:00:00.000Z");
    expect(res.message).toContain("明日");
    expect(res.message).toContain("3 回");
  });

  it("お試しはリセットが無い", () => {
    const res = chatLimitedResponse("trial_lifetime", NOW, limits);
    expect(res.resetsAt).toBeNull();
    expect(res.message).toContain("2 回");
  });
});

describe("parseAIChatLimits / areAIChatLimitsValid", () => {
  it("範囲内の行はそのまま使う", () => {
    expect(parseAIChatLimits({ active_per_day: 30, trial_lifetime: 10 })).toEqual({
      activePerDay: 30,
      trialLifetime: 10,
    });
  });

  it.each([
    [null],
    [{ active_per_day: 0, trial_lifetime: 5 }],
    [{ active_per_day: 101, trial_lifetime: 5 }],
    [{ active_per_day: 20, trial_lifetime: 31 }],
    [{ active_per_day: 2.5, trial_lifetime: 5 }],
    [{ active_per_day: "20", trial_lifetime: 5 }],
  ])("読めない・範囲外は既定値に戻す: %j", (input) => {
    expect(parseAIChatLimits(input)).toBe(AI_CHAT_LIMITS);
  });

  it("既定値自体が範囲内", () => {
    expect(areAIChatLimitsValid(AI_CHAT_LIMITS)).toBe(true);
  });
});
