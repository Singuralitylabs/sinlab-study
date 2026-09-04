import { describe, expect, it } from "vitest";
import {
  groupContentsByWeek,
  sortContentsByHierarchy,
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
