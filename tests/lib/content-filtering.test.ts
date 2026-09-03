import { describe, expect, it } from "vitest";
import { deriveFilterOptions, filterContents } from "@/app/lib/content-filtering";
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

const week1 = makeWeek({ id: 1, phase_id: 1, name: "週1", display_order: 1, phase: phase1 });
const week2 = makeWeek({ id: 2, phase_id: 1, name: "週2", display_order: 2, phase: phase1 });
const week3 = makeWeek({ id: 3, phase_id: 2, name: "週3", display_order: 1, phase: phase2 });

describe("deriveFilterOptions", () => {
  it("join結果から重複のないテーマ・フェーズ・週の選択肢を導出する", () => {
    const contents = [
      makeContent({ id: 1, week_id: 1, week: week1 }),
      makeContent({ id: 2, week_id: 1, week: week1 }),
      makeContent({ id: 3, week_id: 3, week: week3 }),
    ];

    const options = deriveFilterOptions(contents);

    expect(options.themes).toEqual([
      { id: 1, name: "テーマ1" },
      { id: 2, name: "テーマ2" },
    ]);
    expect(options.phases).toEqual([
      { id: 1, name: "フェーズ1", themeId: 1 },
      { id: 2, name: "フェーズ2", themeId: 2 },
    ]);
    expect(options.weeks).toEqual([
      { id: 1, name: "週1", phaseId: 1 },
      { id: 3, name: "週3", phaseId: 2 },
    ]);
  });

  it("週未設定（未分類）のコンテンツは選択肢に含めない", () => {
    const contents = [makeContent({ id: 1, week_id: 99, week: null })];

    const options = deriveFilterOptions(contents);

    expect(options).toEqual({ themes: [], phases: [], weeks: [] });
  });
});

describe("filterContents", () => {
  const contentA = makeContent({
    id: 1,
    week_id: 1,
    title: "GASの基礎",
    content_type: "video",
    week: week1,
  });
  const contentB = makeContent({
    id: 2,
    week_id: 2,
    title: "GASの応用演習",
    content_type: "exercise",
    week: week2,
  });
  const contentC = makeContent({
    id: 3,
    week_id: 3,
    title: "Reactハンズオン",
    content_type: "video",
    week: week3,
  });
  const unclassified = makeContent({ id: 4, week_id: 99, title: "未分類コンテンツ", week: null });
  const contents = [contentA, contentB, contentC, unclassified];

  it("フィルタ未指定なら全件を返す", () => {
    expect(filterContents(contents, {})).toEqual(contents);
  });

  it("テーマIDで絞り込む（未分類は除外される）", () => {
    const result = filterContents(contents, { themeId: "1" });
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it("フェーズIDで絞り込む", () => {
    const result = filterContents(contents, { phaseId: "2" });
    expect(result.map((c) => c.id)).toEqual([3]);
  });

  it("週IDで絞り込む", () => {
    const result = filterContents(contents, { weekId: "2" });
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("種別で絞り込む", () => {
    const result = filterContents(contents, { type: "video" });
    expect(result.map((c) => c.id)).toEqual([1, 3]);
  });

  it("不正な種別は無視して絞り込まない", () => {
    const result = filterContents(contents, { type: "invalid" });
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });

  it("タイトル検索は大文字小文字を区別せず部分一致する", () => {
    const result = filterContents(contents, { q: "gas" });
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it("空白のみの検索語は無視して絞り込まない", () => {
    const result = filterContents(contents, { q: "   " });
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });

  it("複数条件はAND条件で絞り込む", () => {
    const result = filterContents(contents, { themeId: "1", type: "exercise" });
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("条件に合致するコンテンツがなければ空配列を返す", () => {
    const result = filterContents(contents, { themeId: "1", type: "slide" });
    expect(result).toEqual([]);
  });
});
