import { describe, expect, it } from "vitest";
import { pickInitiallyOpenPhaseId, summarizePhaseProgress } from "@/app/lib/phase-progress";

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
