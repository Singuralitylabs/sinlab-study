import { describe, expect, it } from "vitest";
import { isExerciseRetryInProgress } from "@/app/lib/exercise-retry";

describe("isExerciseRetryInProgress", () => {
  it("retry_started_at が無いときは再挑戦中ではない", () => {
    expect(
      isExerciseRetryInProgress({
        latestSubmittedAt: "2026-10-01T12:00:00.000Z",
        retryStartedAt: null,
      })
    ).toBe(false);
  });

  it("最新提出が再挑戦開始以前なら再挑戦中", () => {
    expect(
      isExerciseRetryInProgress({
        latestSubmittedAt: "2026-10-01T11:00:00.000Z",
        retryStartedAt: "2026-10-01T12:00:00.000Z",
      })
    ).toBe(true);
  });

  it("最新提出が再挑戦開始と同時刻なら再挑戦中（開始前の提出を隠す）", () => {
    expect(
      isExerciseRetryInProgress({
        latestSubmittedAt: "2026-10-01T12:00:00.000Z",
        retryStartedAt: "2026-10-01T12:00:00.000Z",
      })
    ).toBe(true);
  });

  it("最新提出が再挑戦開始より後なら再挑戦中ではない", () => {
    expect(
      isExerciseRetryInProgress({
        latestSubmittedAt: "2026-10-01T13:00:00.000Z",
        retryStartedAt: "2026-10-01T12:00:00.000Z",
      })
    ).toBe(false);
  });

  it("提出が取れないが再挑戦開始があるときは再挑戦中として扱う", () => {
    expect(
      isExerciseRetryInProgress({
        latestSubmittedAt: null,
        retryStartedAt: "2026-10-01T12:00:00.000Z",
      })
    ).toBe(true);
  });
});
