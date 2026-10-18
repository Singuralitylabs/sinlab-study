import { describe, expect, it } from "vitest";
import {
  deriveFilterOptions,
  derivePhaseSelectOptions,
  filterContents,
} from "@/app/lib/content-filtering";
import type { ManageContentListItem, ManagePhaseListItem } from "@/app/types";

function makeContent(
  overrides: Partial<ManageContentListItem> & { id: number; phase_id: number }
): ManageContentListItem {
  return {
    id: overrides.id,
    phase_id: overrides.phase_id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    content_type: overrides.content_type ?? "text",
    display_order: overrides.display_order ?? 0,
    is_published: true,
    is_open_to_trial: false,
    grading_rubric_version: null,
    phase: overrides.phase ?? null,
  };
}

const phase1 = {
  id: 1,
  theme_id: 1,
  name: "フェーズ1",
  display_order: 1,
  theme: { id: 1, name: "テーマ1", display_order: 1 },
};
const phase2 = {
  id: 2,
  theme_id: 1,
  name: "フェーズ2",
  display_order: 2,
  theme: { id: 1, name: "テーマ1", display_order: 1 },
};
const phase3 = {
  id: 3,
  theme_id: 2,
  name: "フェーズ3",
  display_order: 1,
  theme: { id: 2, name: "テーマ2", display_order: 2 },
};

function makePhaseListItem(phase: typeof phase1 | null, id = 0, themeId = 0): ManagePhaseListItem {
  return {
    id: phase?.id ?? id,
    theme_id: phase?.theme_id ?? themeId,
    name: phase?.name ?? `フェーズ${id}`,
    description: null,
    display_order: phase?.display_order ?? 0,
    is_published: true,
    theme: phase?.theme ?? null,
  };
}

describe("deriveFilterOptions", () => {
  it("join結果から重複のないテーマ・フェーズの選択肢を導出する", () => {
    const contents = [
      makeContent({ id: 1, phase_id: 1, phase: phase1 }),
      makeContent({ id: 2, phase_id: 1, phase: phase1 }),
      makeContent({ id: 3, phase_id: 3, phase: phase3 }),
    ];

    const options = deriveFilterOptions(contents);

    expect(options.themes).toEqual([
      { id: 1, name: "テーマ1" },
      { id: 2, name: "テーマ2" },
    ]);
    expect(options.phases).toEqual([
      { id: 1, name: "フェーズ1", themeId: 1 },
      { id: 3, name: "フェーズ3", themeId: 2 },
    ]);
  });

  it("フェーズ未設定（未分類）のコンテンツは選択肢に含めない", () => {
    const contents = [makeContent({ id: 1, phase_id: 99, phase: null })];

    expect(deriveFilterOptions(contents)).toEqual({ themes: [], phases: [] });
  });
});

describe("derivePhaseSelectOptions", () => {
  it("フェーズ一覧から重複のないテーマ・フェーズの選択肢を導出する", () => {
    const options = derivePhaseSelectOptions([
      makePhaseListItem(phase1),
      makePhaseListItem(phase2),
      makePhaseListItem(phase3),
    ]);

    expect(options.themes).toEqual([
      { id: 1, name: "テーマ1" },
      { id: 2, name: "テーマ2" },
    ]);
    expect(options.phases).toEqual([
      { id: 1, name: "フェーズ1", themeId: 1 },
      { id: 2, name: "フェーズ2", themeId: 1 },
      { id: 3, name: "フェーズ3", themeId: 2 },
    ]);
  });

  it("フェーズのテーマ join が欠落していてもフェーズ自体は選択肢に含める（theme_id は NOT NULL のため）", () => {
    const options = derivePhaseSelectOptions([makePhaseListItem(null, 4, 99)]);

    expect(options).toEqual({
      themes: [],
      phases: [{ id: 4, name: "フェーズ4", themeId: 99 }],
    });
  });

  it("空配列を渡すと全て空配列を返す", () => {
    expect(derivePhaseSelectOptions([])).toEqual({ themes: [], phases: [] });
  });
});

describe("filterContents", () => {
  const contentA = makeContent({
    id: 1,
    phase_id: 1,
    title: "GASの基礎",
    content_type: "video",
    phase: phase1,
  });
  const contentB = makeContent({
    id: 2,
    phase_id: 2,
    title: "GASの応用演習",
    content_type: "exercise",
    phase: phase2,
  });
  const contentC = makeContent({
    id: 3,
    phase_id: 3,
    title: "Reactハンズオン",
    content_type: "video",
    phase: phase3,
  });
  const unclassified = makeContent({ id: 4, phase_id: 99, title: "未分類コンテンツ", phase: null });
  const contents = [contentA, contentB, contentC, unclassified];

  it("フィルタ未指定なら全件を返す", () => {
    expect(filterContents(contents, {})).toEqual(contents);
  });

  it("タイトル検索は大文字小文字を区別せず部分一致する", () => {
    const result = filterContents(contents, { q: "gas" });
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it("空白のみの検索語は無視して絞り込まない", () => {
    const result = filterContents(contents, { q: "   " });
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });

  it("条件に合致するコンテンツがなければ空配列を返す", () => {
    const result = filterContents(contents, { q: "存在しないタイトル" });
    expect(result).toEqual([]);
  });
});
