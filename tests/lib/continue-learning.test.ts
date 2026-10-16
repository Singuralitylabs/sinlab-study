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
    expect(next?.lastViewedAt).toBeNull();
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
  });

  it("実時刻があるテーマを、completed_at 欠落のテーマより優先する", () => {
    const next = resolveContinueLearning(ordered, new Set([1, 4]), new Map([[4, 2000]]));
    expect(next?.id).toBe(5);
    expect(next?.themeName).toBe("Web");
  });

  it("どちらも completed_at 欠落なら表示順の先頭テーマにフォールバックする", () => {
    const next = resolveContinueLearning(ordered, new Set([1, 4]), new Map());
    expect(next?.id).toBe(2);
    expect(next?.themeName).toBe("GAS");
  });

  it("欠落時刻を epoch 0 扱いして古い実時刻に勝たせない", () => {
    const next = resolveContinueLearning(ordered, new Set([1, 4]), new Map([[1, 100]]));
    expect(next?.id).toBe(2);
    expect(next?.themeName).toBe("GAS");
  });

  describe("last_viewed_at（#396）", () => {
    it("最後に開いた未完了コンテンツを返す", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([1]),
        new Map([[1, 1000]]),
        new Map([
          [1, 100],
          [5, 5000],
        ])
      );
      expect(next?.id).toBe(5);
      expect(next?.lastViewedAt).toBe(new Date(5000).toISOString());
    });

    it("最後に開いたコンテンツが完了済みなら同テーマの次の未完了へ進む", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([1, 2]),
        new Map([
          [1, 100],
          [2, 200],
        ]),
        new Map([[2, 9000]])
      );
      expect(next?.id).toBe(3);
      expect(next?.themeName).toBe("GAS");
      expect(next?.lastViewedAt).toBe(new Date(9000).toISOString());
    });

    it("最後に開いたテーマが修了済みなら次テーマの先頭未完了へ進む", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([1, 2, 3]),
        new Map([
          [1, 100],
          [2, 200],
          [3, 300],
        ]),
        new Map([[3, 8000]])
      );
      expect(next?.id).toBe(4);
      expect(next?.themeName).toBe("Web");
    });

    it("閲覧記録が無いときは #370 の完了基準に戻る", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([1, 4]),
        new Map([
          [1, 1000],
          [4, 2000],
        ]),
        new Map()
      );
      expect(next?.id).toBe(5);
      expect(next?.lastViewedAt).toBeNull();
    });

    it("閲覧済みがすべて完了で次が無いときは null", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([1, 2, 3, 4, 5, 6]),
        new Map(),
        new Map([[6, 10000]])
      );
      expect(next).toBeNull();
    });

    it("後続テーマを終えたあと前テーマに未完了が残るときは先頭未完了へ戻す", () => {
      const next = resolveContinueLearning(
        ordered,
        new Set([4, 5, 6]),
        new Map(),
        new Map([[6, 10000]])
      );
      expect(next?.id).toBe(1);
      expect(next?.themeName).toBe("GAS");
    });
  });
});
