import { describe, expect, it } from "vitest";
import {
  type DryRunSample,
  formatSummary,
  median,
  summarizeByContent,
} from "@/scripts/grading-dry-run-stats";

const sample = (overrides: Partial<DryRunSample> = {}): DryRunSample => ({
  contentId: 1,
  score: 80,
  hasUnmet: false,
  promptTokens: 100,
  completionTokens: 20,
  thoughtsTokens: 300,
  ...overrides,
});

describe("median", () => {
  it("奇数・偶数・空", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("summarizeByContent", () => {
  it("コンテンツごとに平均・中央値・合格率・平均トークンを出す", () => {
    const [summary] = summarizeByContent([
      sample({ score: 100 }),
      sample({ score: 70 }),
      sample({ score: 60, hasUnmet: true }),
      sample({ score: 90, promptTokens: null, thoughtsTokens: null }),
    ]);

    expect(summary.samples).toBe(4);
    expect(summary.mean).toBe(80);
    expect(summary.median).toBe(80);
    // Pass needs no unmet requirement AND score >= threshold.
    expect(summary.passRates[60]).toBe(0.75);
    expect(summary.passRates[70]).toBe(0.75);
    expect(summary.passRates[80]).toBe(0.5);
    expect(summary.passRates[90]).toBe(0.5);
    expect(summary.avgPromptTokens).toBe(100);
    expect(summary.avgThoughtsTokens).toBe(300);
  });

  it("コンテンツ ID の昇順で別々に集計する", () => {
    const result = summarizeByContent([
      sample({ contentId: 2, score: 50 }),
      sample({ contentId: 1, score: 90 }),
    ]);
    expect(result.map((s) => [s.contentId, s.mean])).toEqual([
      [1, 90],
      [2, 50],
    ]);
  });

  it("点数が null のサンプルは点数の統計から除く", () => {
    const [summary] = summarizeByContent([sample({ score: null }), sample({ score: 40 })]);
    expect(summary.mean).toBe(40);
    expect(summary.samples).toBe(2);
  });

  it("失敗サンプルのトークンは平均に残る", () => {
    const [summary] = summarizeByContent([
      sample({ score: null, promptTokens: 50, completionTokens: 10, thoughtsTokens: 20 }),
      sample({ score: 40, promptTokens: 150, completionTokens: 30, thoughtsTokens: 40 }),
    ]);
    expect(summary.mean).toBe(40);
    expect(summary.avgPromptTokens).toBe(100);
    expect(summary.avgCompletionTokens).toBe(20);
    expect(summary.avgThoughtsTokens).toBe(30);
  });

  it("全サンプルが null のとき平均は null、合格率は 0", () => {
    const [summary] = summarizeByContent([sample({ score: null })]);
    expect(summary.mean).toBeNull();
    expect(summary.passRates[70]).toBe(0);
  });
});

describe("formatSummary", () => {
  it("読める形に整形する", () => {
    const text = formatSummary(summarizeByContent([sample({ score: 85 })])[0]);
    expect(text).toContain("content 1 (n=1)");
    expect(text).toContain("平均 85.0 / 中央値 85.0");
    expect(text).toContain("80点以上: 100%");
    expect(text).toContain("入力 100 / 回答 20 / 思考 300");
  });
});
