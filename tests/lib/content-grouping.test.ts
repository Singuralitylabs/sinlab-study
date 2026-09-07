import { describe, expect, it } from "vitest";
import {
  getSiblingTailId,
  groupContentsByWeek,
  groupPhasesByTheme,
  groupWeeksByPhase,
  InvalidInsertAfterIdError,
  resolveSiblingRenumber,
  resolveSiblingResequence,
  type SiblingOrderRow,
  sortContentsByHierarchy,
  sortPhasesByHierarchy,
  sortWeeksByHierarchy,
} from "@/app/lib/content-grouping";
import type { LearningContentWithWeek, LearningWeekWithPhase } from "@/app/types";

function makeWeek(
  overrides: Partial<LearningWeekWithPhase> & { id: number; phase_id: number }
): LearningWeekWithPhase {
  return {
    id: overrides.id,
    phase_id: overrides.phase_id,
    name: overrides.name ?? `週${overrides.id}`,
    description: null,
    display_order: overrides.display_order ?? 0,
    is_published: true,
    is_deleted: false,
    created_at: null,
    updated_at: null,
    phase: overrides.phase ?? null,
  };
}

function makeContent(
  overrides: Partial<LearningContentWithWeek> & { id: number; week_id: number }
): LearningContentWithWeek {
  return {
    id: overrides.id,
    week_id: overrides.week_id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    content_type: overrides.content_type ?? "text",
    display_order: overrides.display_order ?? 0,
    is_published: true,
    is_open_to_trial: false,
    is_deleted: false,
    video_url: null,
    description: null,
    text_content: null,
    exercise_instructions: null,
    hint: null,
    reference_answer: null,
    allowed_submission_types: "code",
    code_language: "javascript",
    pdf_url: null,
    created_at: null,
    updated_at: null,
    week: overrides.week ?? null,
  };
}

const theme1 = {
  id: 1,
  name: "テーマ1",
  description: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  image_url: null,
  created_at: null,
  updated_at: null,
};
const theme2 = {
  id: 2,
  name: "テーマ2",
  description: null,
  display_order: 2,
  is_published: true,
  is_deleted: false,
  image_url: null,
  created_at: null,
  updated_at: null,
};

const phase1 = {
  id: 1,
  theme_id: 1,
  name: "フェーズ1",
  description: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  created_at: null,
  updated_at: null,
  theme: theme1,
};
const phase2 = {
  id: 2,
  theme_id: 2,
  name: "フェーズ2",
  description: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  created_at: null,
  updated_at: null,
  theme: theme2,
};

const week1 = makeWeek({ id: 1, phase_id: 1, name: "週1", display_order: 2, phase: phase1 });
const week2 = makeWeek({ id: 2, phase_id: 1, name: "週2", display_order: 1, phase: phase1 });
const week3 = makeWeek({ id: 3, phase_id: 2, name: "週3", display_order: 1, phase: phase2 });

// display_order はアプリの型では number（非null）だが、DBのカラム自体はNOT NULL制約が
// ないため実行時には null が来うる。その回帰テスト用に意図的に型を偽装したフィクスチャ。
const themeWithNullOrder = {
  id: 3,
  name: "テーマ(順序未設定)",
  description: null,
  display_order: null as unknown as number,
  is_published: true,
  is_deleted: false,
  image_url: null,
  created_at: null,
  updated_at: null,
};
const phase3 = {
  id: 3,
  theme_id: 3,
  name: "フェーズ3",
  description: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  created_at: null,
  updated_at: null,
  theme: themeWithNullOrder,
};
const week4 = makeWeek({ id: 4, phase_id: 3, name: "週4", display_order: 1, phase: phase3 });

describe("sortContentsByHierarchy", () => {
  it("テーマ→フェーズ→週→コンテンツの display_order 順に並び替える", () => {
    const contentA = makeContent({ id: 1, week_id: 1, display_order: 1, week: week1 });
    const contentB = makeContent({ id: 2, week_id: 2, display_order: 1, week: week2 });
    const contentC = makeContent({ id: 3, week_id: 3, display_order: 1, week: week3 });

    const sorted = sortContentsByHierarchy([contentA, contentB, contentC]);

    // week2(display_order:1) が week1(display_order:2) より先、
    // かつ theme1 配下(week1, week2) が theme2 配下(week3) より先
    expect(sorted.map((c) => c.id)).toEqual([2, 1, 3]);
  });

  it("同一週内はコンテンツの display_order 順に並ぶ", () => {
    const contentA = makeContent({ id: 1, week_id: 1, display_order: 2, week: week1 });
    const contentB = makeContent({ id: 2, week_id: 1, display_order: 1, week: week1 });

    const sorted = sortContentsByHierarchy([contentA, contentB]);

    expect(sorted.map((c) => c.id)).toEqual([2, 1]);
  });

  it("週未設定のコンテンツは末尾にまとめる", () => {
    const classified = makeContent({ id: 1, week_id: 1, display_order: 1, week: week1 });
    const unclassifiedA = makeContent({ id: 2, week_id: 99, display_order: 2, week: null });
    const unclassifiedB = makeContent({ id: 3, week_id: 99, display_order: 1, week: null });

    const sorted = sortContentsByHierarchy([unclassifiedA, classified, unclassifiedB]);

    expect(sorted.map((c) => c.id)).toEqual([1, 3, 2]);
  });

  it("テーマの display_order が DB 上 NULL でも末尾にまとめる（number - null が0扱いで先頭に来る回帰）", () => {
    const classified = makeContent({ id: 1, week_id: 1, display_order: 1, week: week1 });
    const nullThemeOrder = makeContent({ id: 2, week_id: 4, display_order: 1, week: week4 });

    const sorted = sortContentsByHierarchy([nullThemeOrder, classified]);

    expect(sorted.map((c) => c.id)).toEqual([1, 2]);
  });

  it("階層情報も display_order も両方欠落する場合はNaNにならずidでタイブレークする", () => {
    const contentA = makeContent({
      id: 2,
      week_id: 99,
      week: null,
      display_order: null as unknown as number,
    });
    const contentB = makeContent({
      id: 1,
      week_id: 99,
      week: null,
      display_order: null as unknown as number,
    });

    const sorted = sortContentsByHierarchy([contentA, contentB]);

    expect(sorted.map((c) => c.id)).toEqual([1, 2]);
  });

  it("元の配列を破壊しない", () => {
    const contentA = makeContent({ id: 1, week_id: 1, display_order: 2, week: week1 });
    const contentB = makeContent({ id: 2, week_id: 1, display_order: 1, week: week1 });
    const original = [contentA, contentB];

    sortContentsByHierarchy(original);

    expect(original.map((c) => c.id)).toEqual([1, 2]);
  });

  it("テーマ・フェーズの display_order が同値でも、id タイブレークにより別の親同士のコンテンツが混在しない", () => {
    // 新規作成フォームの display_order 初期値は0のため、テーマ・フェーズ間で同値が揃うのは
    // 珍しくない。このとき週・コンテンツ自身の display_order だけで比較すると、
    // 本来別グループのコンテンツ同士が混在してしまう回帰を防ぐ
    const themeX = { ...theme1, id: 10, display_order: 0 };
    const themeY = { ...theme1, id: 20, display_order: 0 };
    const phaseX = { ...phase1, id: 10, theme_id: 10, display_order: 0, theme: themeX };
    const phaseY = { ...phase1, id: 20, theme_id: 20, display_order: 0, theme: themeY };
    const weekX = makeWeek({ id: 10, phase_id: 10, display_order: 5, phase: phaseX });
    const weekY = makeWeek({ id: 20, phase_id: 20, display_order: 1, phase: phaseY });
    const contentX = makeContent({ id: 10, week_id: 10, display_order: 1, week: weekX });
    const contentY = makeContent({ id: 20, week_id: 20, display_order: 1, week: weekY });

    const sorted = sortContentsByHierarchy([contentY, contentX]);

    // themeX(id10) が themeY(id20) よりidタイブレークで先。週のdisplay_order（weekY:1 < weekX:5）
    // だけで比較すると誤って contentY が先に来てしまう
    expect(sorted.map((c) => c.id)).toEqual([10, 20]);
  });
});

describe("sortWeeksByHierarchy", () => {
  it("テーマ→フェーズ→週の display_order 順に並び替える", () => {
    // week3(theme2配下) → week2・week1(theme1配下、週のdisplay_orderは2→1の逆順で並べる)
    const sorted = sortWeeksByHierarchy([week3, week1, week2]);

    expect(sorted.map((w) => w.id)).toEqual([2, 1, 3]);
  });

  it("フェーズの display_order が DB 上 NULL でも末尾にまとめる", () => {
    const phaseWithNullOrder = {
      ...phase1,
      id: 4,
      display_order: null as unknown as number,
    };
    const weekWithNullPhaseOrder = makeWeek({
      id: 5,
      phase_id: 4,
      name: "週5",
      display_order: 1,
      phase: phaseWithNullOrder,
    });

    const sorted = sortWeeksByHierarchy([weekWithNullPhaseOrder, week1]);

    expect(sorted.map((w) => w.id)).toEqual([1, 5]);
  });

  it("階層情報がすべて欠落する場合はNaNにならずidでタイブレークする", () => {
    const weekA = makeWeek({ id: 2, phase_id: 99, display_order: null as unknown as number });
    const weekB = makeWeek({ id: 1, phase_id: 99, display_order: null as unknown as number });

    const sorted = sortWeeksByHierarchy([weekA, weekB]);

    expect(sorted.map((w) => w.id)).toEqual([1, 2]);
  });

  it("元の配列を破壊しない", () => {
    const original = [week1, week2];

    sortWeeksByHierarchy(original);

    expect(original.map((w) => w.id)).toEqual([1, 2]);
  });

  it("テーマ・フェーズの display_order が同値でも、id タイブレークにより別の親同士の週が混在しない", () => {
    const themeX = { ...theme1, id: 10, display_order: 0 };
    const themeY = { ...theme1, id: 20, display_order: 0 };
    const phaseX = { ...phase1, id: 10, theme_id: 10, display_order: 0, theme: themeX };
    const phaseY = { ...phase1, id: 20, theme_id: 20, display_order: 0, theme: themeY };
    const weekX = makeWeek({ id: 10, phase_id: 10, display_order: 5, phase: phaseX });
    const weekY = makeWeek({ id: 20, phase_id: 20, display_order: 1, phase: phaseY });

    const sorted = sortWeeksByHierarchy([weekY, weekX]);

    // themeX(id10) が themeY(id20) よりidタイブレークで先。週自身のdisplay_order
    // （weekY:1 < weekX:5）だけで比較すると誤って weekY が先に来てしまう
    expect(sorted.map((w) => w.id)).toEqual([10, 20]);
  });
});

describe("groupContentsByWeek", () => {
  it("週単位でグルーピングし、テーマ›フェーズ›週のラベルを付与する", () => {
    const contentA = makeContent({ id: 1, week_id: 2, display_order: 1, week: week2 });
    const contentB = makeContent({ id: 2, week_id: 2, display_order: 2, week: week2 });
    const contentC = makeContent({ id: 3, week_id: 1, display_order: 1, week: week1 });

    const groups = groupContentsByWeek([contentA, contentB, contentC]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "2",
      label: "テーマ1 › フェーズ1 › 週2",
    });
    expect(groups[0].contents.map((c) => c.id)).toEqual([1, 2]);
    expect(groups[1]).toMatchObject({
      key: "1",
      label: "テーマ1 › フェーズ1 › 週1",
    });
  });

  it("週未設定のコンテンツは「未分類」グループにまとめる", () => {
    const classified = makeContent({ id: 1, week_id: 1, display_order: 1, week: week1 });
    const unclassifiedA = makeContent({ id: 2, week_id: 99, display_order: 1, week: null });
    const unclassifiedB = makeContent({ id: 3, week_id: 99, display_order: 2, week: null });

    const groups = groupContentsByWeek([classified, unclassifiedA, unclassifiedB]);

    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({ key: "unclassified", label: "未分類" });
    expect(groups[1].contents.map((c) => c.id)).toEqual([2, 3]);
  });

  it("sortContentsByHierarchy と組み合わせると「未分類」グループが末尾になる", () => {
    const unclassified = makeContent({ id: 1, week_id: 99, display_order: 1, week: null });
    const classified = makeContent({ id: 2, week_id: 1, display_order: 1, week: week1 });

    const groups = groupContentsByWeek(sortContentsByHierarchy([unclassified, classified]));

    expect(groups.map((g) => g.key)).toEqual(["1", "unclassified"]);
  });
});

describe("sortPhasesByHierarchy", () => {
  it("テーマ→フェーズの display_order 順に並び替える", () => {
    const phaseA = { ...phase1, id: 11, display_order: 2 };
    const phaseB = { ...phase1, id: 12, display_order: 1 };
    const phaseC = { ...phase2, id: 13, display_order: 1 };

    const sorted = sortPhasesByHierarchy([phaseC, phaseA, phaseB]);

    // phaseB(theme1, display_order:1) が phaseA(theme1, display_order:2) より先、
    // かつ theme1 配下(phaseA, phaseB) が theme2 配下(phaseC) より先
    expect(sorted.map((p) => p.id)).toEqual([12, 11, 13]);
  });

  it("テーマの display_order が DB 上 NULL でも末尾にまとめる", () => {
    const sorted = sortPhasesByHierarchy([phase3, phase1]);

    expect(sorted.map((p) => p.id)).toEqual([1, 3]);
  });

  it("階層情報も display_order も両方欠落する場合はNaNにならずidでタイブレークする", () => {
    const phaseA = {
      ...phase1,
      id: 2,
      theme_id: 99,
      display_order: null as unknown as number,
      theme: null,
    };
    const phaseB = {
      ...phase1,
      id: 1,
      theme_id: 99,
      display_order: null as unknown as number,
      theme: null,
    };

    const sorted = sortPhasesByHierarchy([phaseA, phaseB]);

    expect(sorted.map((p) => p.id)).toEqual([1, 2]);
  });

  it("元の配列を破壊しない", () => {
    const phaseA = { ...phase1, id: 11, display_order: 2 };
    const phaseB = { ...phase1, id: 12, display_order: 1 };
    const original = [phaseA, phaseB];

    sortPhasesByHierarchy(original);

    expect(original.map((p) => p.id)).toEqual([11, 12]);
  });

  it("テーマの display_order が同値でも、id タイブレークにより別の親同士のフェーズが混在しない", () => {
    const themeX = { ...theme1, id: 10, display_order: 0 };
    const themeY = { ...theme1, id: 20, display_order: 0 };
    const phaseX = { ...phase1, id: 100, theme_id: 10, display_order: 5, theme: themeX };
    const phaseY = { ...phase1, id: 200, theme_id: 20, display_order: 1, theme: themeY };

    const sorted = sortPhasesByHierarchy([phaseY, phaseX]);

    // themeX(id10) が themeY(id20) よりidタイブレークで先。フェーズ自身のdisplay_order
    // （phaseY:1 < phaseX:5）だけで比較すると誤って phaseY が先に来てしまう
    expect(sorted.map((p) => p.id)).toEqual([100, 200]);
  });
});

describe("groupWeeksByPhase", () => {
  it("フェーズ単位でグルーピングし、テーマ›フェーズのラベルを付与する", () => {
    const groups = groupWeeksByPhase(sortWeeksByHierarchy([week3, week1, week2]));

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: "1", label: "テーマ1 › フェーズ1" });
    expect(groups[0].weeks.map((w) => w.id)).toEqual([2, 1]);
    expect(groups[1]).toMatchObject({ key: "2", label: "テーマ2 › フェーズ2" });
    expect(groups[1].weeks.map((w) => w.id)).toEqual([3]);
  });

  it("フェーズ未設定の週は「未分類」グループにまとめる", () => {
    const unclassifiedA = makeWeek({ id: 6, phase_id: 99, display_order: 1, phase: null });
    const unclassifiedB = makeWeek({ id: 7, phase_id: 99, display_order: 2, phase: null });

    const groups = groupWeeksByPhase([week1, unclassifiedA, unclassifiedB]);

    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({ key: "unclassified", label: "未分類" });
    expect(groups[1].weeks.map((w) => w.id)).toEqual([6, 7]);
  });

  it("sortWeeksByHierarchy と組み合わせると「未分類」グループが末尾になる", () => {
    const unclassified = makeWeek({ id: 8, phase_id: 99, display_order: 1, phase: null });

    const groups = groupWeeksByPhase(sortWeeksByHierarchy([unclassified, week1]));

    expect(groups.map((g) => g.key)).toEqual(["1", "unclassified"]);
  });
});

describe("groupPhasesByTheme", () => {
  it("テーマ単位でグルーピングし、テーマ名のラベルを付与する", () => {
    const phase1b = { ...phase1, id: 5, display_order: 2 };

    const groups = groupPhasesByTheme(sortPhasesByHierarchy([phase2, phase1b, phase1]));

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: "1", label: "テーマ1" });
    expect(groups[0].phases.map((p) => p.id)).toEqual([1, 5]);
    expect(groups[1]).toMatchObject({ key: "2", label: "テーマ2" });
    expect(groups[1].phases.map((p) => p.id)).toEqual([2]);
  });

  it("テーマ未設定のフェーズは「未分類」グループにまとめる", () => {
    const unclassifiedA = { ...phase1, id: 6, theme_id: 99, display_order: 1, theme: null };
    const unclassifiedB = { ...phase1, id: 7, theme_id: 99, display_order: 2, theme: null };

    const groups = groupPhasesByTheme([phase1, unclassifiedA, unclassifiedB]);

    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({ key: "unclassified", label: "未分類" });
    expect(groups[1].phases.map((p) => p.id)).toEqual([6, 7]);
  });

  it("テーマ名が空白のみの場合もラベルは「未分類」になる（joinHierarchyLabelでトリムして欠落扱い）", () => {
    const themeBlankName = { ...theme1, id: 30, name: "   " };
    const phaseWithBlankThemeName = {
      ...phase1,
      id: 30,
      theme_id: 30,
      theme: themeBlankName,
    };

    const groups = groupPhasesByTheme([phaseWithBlankThemeName]);

    // テーマ自体は設定されているためグルーピングキーはテーマidのまま（「未分類」グループには
    // 統合されない）が、ラベルは名前が空白のみのため「未分類」表示になる
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "30", label: "未分類" });
  });

  it("sortPhasesByHierarchy と組み合わせると「未分類」グループが末尾になる", () => {
    const unclassified = { ...phase1, id: 8, theme_id: 99, display_order: 1, theme: null };

    const groups = groupPhasesByTheme(sortPhasesByHierarchy([unclassified, phase1]));

    expect(groups.map((g) => g.key)).toEqual(["1", "unclassified"]);
  });
});

describe("resolveSiblingResequence", () => {
  function row(id: number, display_order: number | null): SiblingOrderRow {
    return { id, display_order };
  }

  it("兄弟が存在しない場合、insertAfterIdはnullのみ許可され、displayOrderは1・updatesは空になる", () => {
    const result = resolveSiblingResequence([], null);

    expect(result).toEqual({ displayOrder: 1, updates: [] });
  });

  it("兄弟が存在しないのにinsertAfterIdが数値の場合はInvalidInsertAfterIdErrorを投げる", () => {
    expect(() => resolveSiblingResequence([], 99)).toThrow(InvalidInsertAfterIdError);
  });

  it("InvalidInsertAfterIdErrorのmessageは利用者向け文言で、insertAfterIdはプロパティにのみ保持する（サーバーログ用）", () => {
    try {
      resolveSiblingResequence([], 99);
      throw new Error("unreachable");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInsertAfterIdError);
      const invalidInsertAfterIdError = error as InvalidInsertAfterIdError;
      expect(invalidInsertAfterIdError.insertAfterId).toBe(99);
      expect(invalidInsertAfterIdError.message).not.toContain("99");
      expect(invalidInsertAfterIdError.message).not.toContain("insert_after_id");
    }
  });

  it("先頭に挿入する場合、全既存兄弟のdisplay_orderが1つずつ後ろにずれる", () => {
    const siblings = [row(10, 1), row(20, 2), row(30, 3)];

    const result = resolveSiblingResequence(siblings, null);

    expect(result.displayOrder).toBe(1);
    expect(result.updates).toEqual(
      expect.arrayContaining([
        { id: 10, display_order: 2 },
        { id: 20, display_order: 3 },
        { id: 30, display_order: 4 },
      ])
    );
    expect(result.updates).toHaveLength(3);
  });

  it("末尾（最後の兄弟の直後）に挿入する場合、既存兄弟のdisplay_orderは変わらずupdatesは空になる", () => {
    const siblings = [row(10, 1), row(20, 2), row(30, 3)];

    const result = resolveSiblingResequence(siblings, 30);

    expect(result.displayOrder).toBe(4);
    expect(result.updates).toEqual([]);
  });

  it("中間に挿入する場合、挿入位置より後ろの兄弟だけdisplay_orderが変わる", () => {
    const siblings = [row(10, 1), row(20, 2), row(30, 3)];

    const result = resolveSiblingResequence(siblings, 10);

    expect(result.displayOrder).toBe(2);
    expect(result.updates).toEqual([
      { id: 20, display_order: 3 },
      { id: 30, display_order: 4 },
    ]);
  });

  it("display_orderが重複・欠落した既存兄弟も1からの連番に再採番される（idタイブレークで確定順序）", () => {
    // 新規作成フォームの display_order 初期値0の連発や、DB上NULLの回帰と同じ状況を再現
    const siblings = [row(30, 0), row(10, 0), row(20, null)];

    const result = resolveSiblingResequence(siblings, null);

    // compareGroupLevelの並び: display_order昇順（0, 0, null=Infinity）→ 同値はidタイブレーク
    // なので並び順は id10(0) → id30(0) → id20(null)。先頭挿入のため全兄弟が1つずつ後ろにずれる
    expect(result.updates).toEqual(
      expect.arrayContaining([
        { id: 10, display_order: 2 },
        { id: 30, display_order: 3 },
        { id: 20, display_order: 4 },
      ])
    );
    expect(result.displayOrder).toBe(1);
  });

  it("insertAfterIdが兄弟一覧に存在しない場合はInvalidInsertAfterIdErrorを投げる（別の親配下・削除済み・存在しないIDの共通経路）", () => {
    const siblings = [row(10, 1), row(20, 2)];

    expect(() => resolveSiblingResequence(siblings, 999)).toThrow(InvalidInsertAfterIdError);
  });

  it("兄弟一覧の入力配列を破壊しない", () => {
    const siblings = [row(20, 2), row(10, 1)];
    const original = [...siblings];

    resolveSiblingResequence(siblings, null);

    expect(siblings).toEqual(original);
  });
});

describe("resolveSiblingRenumber", () => {
  function row(id: number, display_order: number | null): SiblingOrderRow {
    return { id, display_order };
  }

  it("兄弟が存在しない場合、updatesは空になる", () => {
    expect(resolveSiblingRenumber([])).toEqual([]);
  });

  it("既に1からの連番の場合、updatesは空になる（不要なUPDATEを発生させない）", () => {
    const siblings = [row(10, 1), row(20, 2)];

    expect(resolveSiblingRenumber(siblings)).toEqual([]);
  });

  it("欠番がある場合、並び順を保ったまま1からの連番に詰め直す", () => {
    // 親変更でid=20が抜けた後の残存兄弟（display_orderが1と3で欠番）を想定
    const siblings = [row(10, 1), row(30, 3)];

    expect(resolveSiblingRenumber(siblings)).toEqual([{ id: 30, display_order: 2 }]);
  });

  it("display_orderが同値の場合はidでタイブレークして並び順を決める（resolveSiblingResequenceと同じ規則）", () => {
    const siblings = [row(30, 1), row(10, 1)];

    // id昇順（10, 30）でタイブレークされ、id=10が1のまま・id=30が2にずれる
    expect(resolveSiblingRenumber(siblings)).toEqual([{ id: 30, display_order: 2 }]);
  });

  it("兄弟一覧の入力配列を破壊しない", () => {
    const siblings = [row(30, 3), row(10, 1)];
    const original = [...siblings];

    resolveSiblingRenumber(siblings);

    expect(siblings).toEqual(original);
  });
});

describe("getSiblingTailId", () => {
  function row(id: number, display_order: number | null): SiblingOrderRow {
    return { id, display_order };
  }

  it("兄弟が存在しない場合はnull（先頭扱い）を返す", () => {
    expect(getSiblingTailId([])).toBeNull();
  });

  it("並び順で最後の兄弟のIDを返す（入力配列の順序に依存しない）", () => {
    const siblings = [row(30, 3), row(10, 1), row(20, 2)];

    expect(getSiblingTailId(siblings)).toBe(30);
  });

  it("display_orderが同値の場合はidでタイブレークする（resolveSiblingResequenceと同じ規則）", () => {
    const siblings = [row(10, 1), row(30, 1)];

    expect(getSiblingTailId(siblings)).toBe(30);
  });
});
