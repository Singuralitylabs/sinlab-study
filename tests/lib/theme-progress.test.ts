import { describe, expect, it } from "vitest";
import { isThemeCompleted } from "@/app/lib/certificate";
import { isActiveTheme, splitThemesByActivity } from "@/app/lib/theme-progress";

const t = (name: string, completedContents: number, totalContents: number) => ({
  name,
  completedContents,
  totalContents,
});

describe("isActiveTheme", () => {
  it("完了0件は学習中ではなく、1件以上で全て完了までは学習中", () => {
    expect(isActiveTheme(t("a", 0, 5))).toBe(false);
    expect(isActiveTheme(t("a", 1, 5))).toBe(true);
    expect(isActiveTheme(t("a", 4, 5))).toBe(true);
  });

  it("修了（100%）したテーマは学習中ではない。修了の定義は修了証と同じ", () => {
    expect(isActiveTheme(t("a", 5, 5))).toBe(false);
    expect(isThemeCompleted(t("a", 5, 5))).toBe(true);
    expect(isActiveTheme(t("a", 0, 0))).toBe(false);
  });
});

describe("splitThemesByActivity", () => {
  it("学習中 / 修了 / 未着手の3区分に分け、100% は学習中ではなく修了に入れる", () => {
    const result = splitThemesByActivity([
      t("none", 0, 4),
      t("part", 1, 4),
      t("done", 4, 4),
      t("empty", 0, 0),
    ]);

    expect(result.active.map((x) => x.name)).toEqual(["part"]);
    expect(result.completed.map((x) => x.name)).toEqual(["done"]);
    expect(result.notStarted.map((x) => x.name)).toEqual(["none", "empty"]);
  });

  it("学習中は完了率の高い順（同率は入力順）、他の区分は入力順（display_order 順）を保つ", () => {
    const result = splitThemesByActivity([
      t("low", 1, 10),
      t("tieA", 2, 4),
      t("high", 9, 10),
      t("tieB", 1, 2),
      t("doneB", 3, 3),
      t("doneA", 2, 2),
      t("n2", 0, 3),
      t("n1", 0, 2),
    ]);

    expect(result.active.map((x) => x.name)).toEqual(["high", "tieA", "tieB", "low"]);
    expect(result.completed.map((x) => x.name)).toEqual(["doneB", "doneA"]);
    expect(result.notStarted.map((x) => x.name)).toEqual(["n2", "n1"]);
  });

  it("入力を並べ替えず、空の入力は全て空", () => {
    const input = [t("b", 1, 2), t("a", 2, 3)];
    splitThemesByActivity(input);
    expect(input.map((x) => x.name)).toEqual(["b", "a"]);
    expect(splitThemesByActivity([])).toEqual({ active: [], completed: [], notStarted: [] });
  });
});
