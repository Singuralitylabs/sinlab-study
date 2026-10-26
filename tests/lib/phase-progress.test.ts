import { describe, expect, it } from "vitest";
import {
  getPhaseProgressStatus,
  isPhaseFullyLockedForUser,
  isThemeCompleted,
  PHASE_PROGRESS_STATUS,
  pickInitiallyOpenPhaseId,
  summarizePhaseProgress,
} from "@/app/lib/phase-progress";

const content = (id: number, is_published = true, locked = false) => ({
  id,
  is_published,
  locked,
});

describe("summarizePhaseProgress", () => {
  const isLocked = (c: { locked: boolean }) => c.locked;

  it("ロック・未公開のコンテンツは分母に含めない", () => {
    const result = summarizePhaseProgress(
      [content(1), content(2, false), content(3, true, true), content(4)],
      {
        isLocked,
        ancestorsPublished: true,
        progressMap: new Map([
          [1, true],
          [3, true],
        ]),
      }
    );
    expect(result).toEqual({ completed: 1, total: 2 });
  });

  it("親が未公開なら分母は 0", () => {
    const result = summarizePhaseProgress([content(1)], {
      isLocked,
      ancestorsPublished: false,
      progressMap: new Map(),
    });
    expect(result).toEqual({ completed: 0, total: 0 });
  });
});

describe("pickInitiallyOpenPhaseId", () => {
  const p = (id: number, completed: number, total: number) => ({
    id,
    progress: { completed, total },
  });

  it("未完了の最初のフェーズを開く", () => {
    expect(pickInitiallyOpenPhaseId([p(1, 3, 3), p(2, 1, 4), p(3, 0, 2)])).toBe(2);
  });

  it("全完了のときは先頭フェーズ", () => {
    expect(pickInitiallyOpenPhaseId([p(1, 3, 3), p(2, 4, 4)])).toBe(1);
  });

  it("フェーズが無ければ null", () => {
    expect(pickInitiallyOpenPhaseId([])).toBeNull();
  });
});

describe("getPhaseProgressStatus", () => {
  it("未着手・進行中・完了を判定する", () => {
    expect(getPhaseProgressStatus({ completed: 0, total: 3 })).toBe(
      PHASE_PROGRESS_STATUS.NOT_STARTED
    );
    expect(getPhaseProgressStatus({ completed: 1, total: 3 })).toBe(
      PHASE_PROGRESS_STATUS.IN_PROGRESS
    );
    expect(getPhaseProgressStatus({ completed: 3, total: 3 })).toBe(
      PHASE_PROGRESS_STATUS.COMPLETED
    );
  });

  it("分母が 0 のフェーズは完了にしない", () => {
    expect(getPhaseProgressStatus({ completed: 0, total: 0 })).toBe(
      PHASE_PROGRESS_STATUS.NOT_STARTED
    );
  });
});

describe("isThemeCompleted", () => {
  const phase = (completed: number, total: number) => ({ progress: { completed, total } });

  it("すべての対象フェーズが完了なら true", () => {
    expect(isThemeCompleted([phase(2, 2), phase(3, 3)])).toBe(true);
  });

  it("未完了のフェーズが1つでもあれば false", () => {
    expect(isThemeCompleted([phase(2, 2), phase(1, 3)])).toBe(false);
  });

  it("分母0のフェーズ（全ロック・空）が残っていれば false", () => {
    expect(isThemeCompleted([phase(2, 2), phase(0, 0)])).toBe(false);
  });

  it("フェーズが0件なら false", () => {
    expect(isThemeCompleted([])).toBe(false);
  });
});

describe("isPhaseFullyLockedForUser（#505）", () => {
  const content = (is_published: boolean, locked: boolean) => ({ is_published, locked });
  const isLocked = (c: { locked: boolean }) => c.locked;

  it("公開済みが1件以上ありすべて鍵なら true", () => {
    expect(
      isPhaseFullyLockedForUser(
        [content(true, true), content(true, true), content(false, false)],
        isLocked
      )
    ).toBe(true);
  });

  it("公開済みに鍵でないものが1件でもあれば false", () => {
    expect(isPhaseFullyLockedForUser([content(true, true), content(true, false)], isLocked)).toBe(
      false
    );
  });

  it("コンテンツ0件・公開済み0件は鍵にしない", () => {
    expect(isPhaseFullyLockedForUser([], isLocked)).toBe(false);
    expect(isPhaseFullyLockedForUser([content(false, true)], isLocked)).toBe(false);
  });

  it("isLocked が常に false（会員など）なら鍵にしない", () => {
    expect(isPhaseFullyLockedForUser([content(true, true)], () => false)).toBe(false);
  });
});
