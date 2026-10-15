import { describe, expect, it } from "vitest";
import { type ContinueLearningContent, resolveContinueLearning } from "@/app/lib/continue-learning";

const content = (
  id: number,
  themeId: number,
  themeName: string,
  opts: Partial<ContinueLearningContent> = {}
): ContinueLearningContent => ({
  id,
  title: `Content ${id}`,
  contentType: "text",
  themeId,
  themeName,
  phaseId: themeId * 10,
  weekId: themeId * 100,
  ...opts,
});

describe("resolveContinueLearning", () => {
  const gas = [
    content(1, 1, "GAS", { title: "GAS-1" }),
    content(2, 1, "GAS", { title: "GAS-2" }),
    content(3, 1, "GAS", { title: "GAS-3" }),
  ];
  const web = [
    content(4, 2, "Web", { title: "Web-1" }),
    content(5, 2, "Web", { title: "Web-2" }),
    content(6, 2, "Web", { title: "Web-3" }),
  ];
  const ordered = [...gas, ...web];

  it("完了が無いときは最初のテーマの先頭コンテンツを返す", () => {
    const next = resolveContinueLearning(ordered, new Set(), new Map());
    expect(next?.id).toBe(1);
    expect(next?.href).toBe("/learn/1/10/100/1");
    expect(next?.completedContents).toBe(0);
    expect(next?.totalContents).toBe(3);
  });

  it("最後に完了したテーマの先頭未完了を返す", () => {
    const next = resolveContinueLearning(
      ordered,
      new Set([1, 4]),
      new Map([
        [1, 1000],
        [4, 2000],
      ])
    );
    expect(next?.id).toBe(5);
    expect(next?.themeName).toBe("Web");
  });

  it("最後に学んだテーマがすべて完了なら、並び順で次の未完了テーマへ進む", () => {
    const next = resolveContinueLearning(
      ordered,
      new Set([1, 2, 3]),
      new Map([
        [1, 100],
        [2, 200],
        [3, 300],
      ])
    );
    expect(next?.id).toBe(4);
    expect(next?.themeName).toBe("Web");
  });

  it("全完了なら null（カードを出さない）", () => {
    expect(resolveContinueLearning(ordered, new Set([1, 2, 3, 4, 5, 6]), new Map())).toBeNull();
  });

  it("コンテンツが空なら null", () => {
    expect(resolveContinueLearning([], new Set(), new Map())).toBeNull();
  });

  it("同じテーマ内では学習順の先頭未完了を選ぶ", () => {
    const next = resolveContinueLearning(ordered, new Set([1]), new Map([[1, 1000]]));
    expect(next?.id).toBe(2);
    expect(next?.completedContents).toBe(1);
    expect(next?.totalContents).toBe(3);
  });

  it("実時刻があるテーマを、completed_at 欠落のテーマより優先する", () => {
    // GAS は完了行があるが時刻なし、Web はあとから完了した実時刻あり → Web を選ぶ
    const next = resolveContinueLearning(
      ordered,
      new Set([1, 4]),
      new Map([
        // 1 intentionally omitted (NULL completed_at)
        [4, 2000],
      ])
    );
    expect(next?.id).toBe(5);
    expect(next?.themeName).toBe("Web");
  });

  it("どちらも completed_at 欠落なら表示順の先頭テーマにフォールバックする", () => {
    const next = resolveContinueLearning(
      ordered,
      new Set([1, 4]),
      new Map() // all completions lack timestamps
    );
    expect(next?.id).toBe(2);
    expect(next?.themeName).toBe("GAS");
  });

  it("欠落時刻を epoch 0 扱いして古い実時刻に勝たせない", () => {
    // Web にだけ欠落完了、GAS に古い実時刻 → GAS（実時刻あり）を最後に学んだテーマとする
    const next = resolveContinueLearning(ordered, new Set([1, 4]), new Map([[1, 100]]));
    expect(next?.id).toBe(2);
    expect(next?.themeName).toBe("GAS");
  });
});
