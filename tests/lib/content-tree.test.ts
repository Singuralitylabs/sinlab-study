import { describe, expect, it } from "vitest";
import {
  buildContentTree,
  contentTreeNodeKey,
  expandKeysForTarget,
} from "@/app/lib/content-tree";
import type {
  ManageContentListItem,
  ManagePhaseListItem,
  ManageThemeListItem,
  ManageWeekListItem,
} from "@/app/types";

function makeTheme(
  overrides: Partial<ManageThemeListItem> & { id: number }
): ManageThemeListItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `テーマ${overrides.id}`,
    description: overrides.description ?? null,
    image_url: overrides.image_url ?? null,
    display_order: overrides.display_order ?? 0,
    is_published: overrides.is_published ?? true,
  };
}

function makePhase(
  overrides: Partial<ManagePhaseListItem> & { id: number; theme_id: number }
): ManagePhaseListItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `フェーズ${overrides.id}`,
    description: overrides.description ?? null,
    display_order: overrides.display_order ?? 0,
    is_published: overrides.is_published ?? true,
    theme_id: overrides.theme_id,
    theme: overrides.theme ?? null,
  };
}

function makeWeek(
  overrides: Partial<ManageWeekListItem> & { id: number; phase_id: number }
): ManageWeekListItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `週${overrides.id}`,
    display_order: overrides.display_order ?? 0,
    is_published: overrides.is_published ?? true,
    phase_id: overrides.phase_id,
    phase: overrides.phase ?? null,
  };
}

function makeContent(
  overrides: Partial<ManageContentListItem> & { id: number; week_id: number }
): ManageContentListItem {
  return {
    id: overrides.id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    content_type: overrides.content_type ?? "text",
    display_order: overrides.display_order ?? 0,
    is_published: overrides.is_published ?? true,
    is_open_to_trial: overrides.is_open_to_trial ?? false,
    week_id: overrides.week_id,
    grading_rubric_version: overrides.grading_rubric_version ?? null,
    week: overrides.week ?? null,
  };
}

const theme1 = makeTheme({ id: 1, name: "テーマ1", display_order: 1 });
const theme2 = makeTheme({ id: 2, name: "テーマ2", display_order: 2 });

const phase1 = makePhase({
  id: 1,
  theme_id: 1,
  name: "フェーズ1",
  display_order: 1,
  theme: { id: 1, name: "テーマ1", display_order: 1 },
});
const phase2 = makePhase({
  id: 2,
  theme_id: 2,
  name: "フェーズ2",
  display_order: 1,
  theme: { id: 2, name: "テーマ2", display_order: 2 },
});

const week1 = makeWeek({
  id: 1,
  phase_id: 1,
  name: "週1",
  display_order: 2,
  phase: {
    id: 1,
    name: "フェーズ1",
    display_order: 1,
    theme_id: 1,
    theme: { id: 1, name: "テーマ1", display_order: 1 },
  },
});
const week2 = makeWeek({
  id: 2,
  phase_id: 1,
  name: "週2",
  display_order: 1,
  phase: {
    id: 1,
    name: "フェーズ1",
    display_order: 1,
    theme_id: 1,
    theme: { id: 1, name: "テーマ1", display_order: 1 },
  },
});
const week3 = makeWeek({
  id: 3,
  phase_id: 2,
  name: "週3",
  display_order: 1,
  phase: {
    id: 2,
    name: "フェーズ2",
    display_order: 1,
    theme_id: 2,
    theme: { id: 2, name: "テーマ2", display_order: 2 },
  },
});

describe("buildContentTree", () => {
  it("テーマ→フェーズ→週→コンテンツの入れ子を display_order 順で組み立てる", () => {
    const contentA = makeContent({ id: 1, week_id: 1, display_order: 2, week: week1 });
    const contentB = makeContent({ id: 2, week_id: 1, display_order: 1, week: week1 });
    const contentC = makeContent({ id: 3, week_id: 2, display_order: 1, week: week2 });
    const contentD = makeContent({ id: 4, week_id: 3, display_order: 1, week: week3 });

    const tree = buildContentTree(
      [theme2, theme1],
      [phase2, phase1],
      [week1, week3, week2],
      [contentA, contentD, contentC, contentB]
    );

    expect(tree.map((t) => t.id)).toEqual([1, 2]);
    expect(tree[0].phases.map((p) => p.id)).toEqual([1]);
    expect(tree[0].phases[0].weeks.map((w) => w.id)).toEqual([2, 1]);
    expect(tree[0].phases[0].weeks[0].contents.map((c) => c.id)).toEqual([3]);
    expect(tree[0].phases[0].weeks[1].contents.map((c) => c.id)).toEqual([2, 1]);
    expect(tree[1].phases.map((p) => p.id)).toEqual([2]);
    expect(tree[1].phases[0].weeks.map((w) => w.id)).toEqual([3]);
    expect(tree[1].phases[0].weeks[0].contents.map((c) => c.id)).toEqual([4]);
  });

  it("親が欠落したフェーズ・週・コンテンツは入れ子から省略する", () => {
    const orphanPhase = makePhase({ id: 99, theme_id: 99, name: "孤児フェーズ" });
    const orphanWeek = makeWeek({ id: 99, phase_id: 99, name: "孤児週", phase: null });
    const orphanContent = makeContent({ id: 99, week_id: 99, week: null });
    const content = makeContent({ id: 1, week_id: 1, week: week1 });

    const tree = buildContentTree(
      [theme1],
      [phase1, orphanPhase],
      [week1, orphanWeek],
      [content, orphanContent]
    );

    expect(tree).toHaveLength(1);
    expect(tree[0].phases.map((p) => p.id)).toEqual([1]);
    expect(tree[0].phases[0].weeks.map((w) => w.id)).toEqual([1]);
    expect(tree[0].phases[0].weeks[0].contents.map((c) => c.id)).toEqual([1]);
  });

  it("配下がないテーマ・フェーズ・週は空配列のまま残す", () => {
    const emptyTheme = makeTheme({ id: 3, name: "空テーマ", display_order: 3 });
    const emptyPhase = makePhase({
      id: 3,
      theme_id: 1,
      name: "空フェーズ",
      display_order: 2,
      theme: { id: 1, name: "テーマ1", display_order: 1 },
    });

    const tree = buildContentTree([theme1, emptyTheme], [phase1, emptyPhase], [], []);

    expect(tree.map((t) => t.id)).toEqual([1, 3]);
    expect(tree[0].phases.map((p) => p.id)).toEqual([1, 3]);
    expect(tree[0].phases[0].weeks).toEqual([]);
    expect(tree[0].phases[1].weeks).toEqual([]);
    expect(tree[1].phases).toEqual([]);
  });

  it("入力配列を破壊しない", () => {
    const themes = [theme2, theme1];
    const phases = [phase1];
    const weeks = [week1];
    const contents = [makeContent({ id: 1, week_id: 1, display_order: 1 })];
    const themeIds = themes.map((t) => t.id);
    const contentIds = contents.map((c) => c.id);

    buildContentTree(themes, phases, weeks, contents);

    expect(themes.map((t) => t.id)).toEqual(themeIds);
    expect(contents.map((c) => c.id)).toEqual(contentIds);
  });

  it("コンテンツノードに一覧表示用のフィールドを載せる", () => {
    const content = makeContent({
      id: 1,
      week_id: 1,
      title: "演習A",
      content_type: "exercise",
      is_published: false,
      is_open_to_trial: true,
      grading_rubric_version: 3,
      display_order: 1,
    });

    const tree = buildContentTree([theme1], [phase1], [week1], [content]);
    const node = tree[0].phases[0].weeks[0].contents[0];

    expect(node).toEqual({
      id: 1,
      title: "演習A",
      contentType: "exercise",
      isPublished: false,
      isOpenToTrial: true,
      gradingRubricVersion: 3,
      displayOrder: 1,
    });
  });
});

describe("expandKeysForTarget", () => {
  it("テーマ・フェーズ・週の祖先キーを返す", () => {
    expect(
      expandKeysForTarget({ themeId: 1, phaseId: 2, weekId: 3, contentId: 4 })
    ).toEqual([
      contentTreeNodeKey("theme", 1),
      contentTreeNodeKey("phase", 2),
      contentTreeNodeKey("week", 3),
    ]);
  });

  it("指定された階層だけキーにする（contentId は展開キーに含めない）", () => {
    expect(expandKeysForTarget({ themeId: 1 })).toEqual(["theme:1"]);
    expect(expandKeysForTarget({ phaseId: 2 })).toEqual(["phase:2"]);
    expect(expandKeysForTarget({ weekId: 3 })).toEqual(["week:3"]);
    expect(expandKeysForTarget({ contentId: 4 })).toEqual([]);
  });

  it("空のターゲットは空配列を返す", () => {
    expect(expandKeysForTarget({})).toEqual([]);
  });
});
