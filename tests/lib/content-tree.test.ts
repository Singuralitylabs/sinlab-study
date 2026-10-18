import { describe, expect, it } from "vitest";
import { buildContentTree, contentTreeNodeKey, expandKeysForTarget } from "@/app/lib/content-tree";
import type { ManageContentListItem, ManagePhaseListItem, ManageThemeListItem } from "@/app/types";

function makeTheme(overrides: Partial<ManageThemeListItem> & { id: number }): ManageThemeListItem {
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

function makeContent(
  overrides: Partial<ManageContentListItem> & { id: number; phase_id: number }
): ManageContentListItem {
  return {
    id: overrides.id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    content_type: overrides.content_type ?? "text",
    display_order: overrides.display_order ?? 0,
    is_published: overrides.is_published ?? true,
    is_open_to_trial: overrides.is_open_to_trial ?? false,
    phase_id: overrides.phase_id,
    grading_rubric_version: overrides.grading_rubric_version ?? null,
    phase: overrides.phase ?? null,
  };
}

const theme1 = makeTheme({ id: 1, name: "テーマ1", display_order: 1 });
const theme2 = makeTheme({ id: 2, name: "テーマ2", display_order: 2 });

const phase1 = makePhase({
  id: 1,
  theme_id: 1,
  name: "フェーズ1",
  display_order: 2,
  theme: { id: 1, name: "テーマ1", display_order: 1 },
});
const phase2 = makePhase({
  id: 2,
  theme_id: 1,
  name: "フェーズ2",
  display_order: 1,
  theme: { id: 1, name: "テーマ1", display_order: 1 },
});
const phase3 = makePhase({
  id: 3,
  theme_id: 2,
  name: "フェーズ3",
  display_order: 1,
  theme: { id: 2, name: "テーマ2", display_order: 2 },
});

function phaseJoin(phase: ManagePhaseListItem): NonNullable<ManageContentListItem["phase"]> {
  return {
    id: phase.id,
    name: phase.name,
    display_order: phase.display_order,
    theme_id: phase.theme_id,
    theme: phase.theme,
  };
}

describe("buildContentTree", () => {
  it("テーマ→フェーズ→コンテンツの入れ子を display_order 順で組み立てる", () => {
    const contentA = makeContent({
      id: 1,
      phase_id: 1,
      display_order: 2,
      phase: phaseJoin(phase1),
    });
    const contentB = makeContent({
      id: 2,
      phase_id: 1,
      display_order: 1,
      phase: phaseJoin(phase1),
    });
    const contentC = makeContent({
      id: 3,
      phase_id: 2,
      display_order: 1,
      phase: phaseJoin(phase2),
    });
    const contentD = makeContent({
      id: 4,
      phase_id: 3,
      display_order: 1,
      phase: phaseJoin(phase3),
    });

    const tree = buildContentTree(
      [theme2, theme1],
      [phase1, phase3, phase2],
      [contentA, contentD, contentC, contentB]
    );

    expect(tree.map((t) => t.id)).toEqual([1, 2]);
    expect(tree[0].phases.map((p) => p.id)).toEqual([2, 1]);
    expect(tree[0].phases[0].contents.map((c) => c.id)).toEqual([3]);
    expect(tree[0].phases[1].contents.map((c) => c.id)).toEqual([2, 1]);
    expect(tree[1].phases.map((p) => p.id)).toEqual([3]);
    expect(tree[1].phases[0].contents.map((c) => c.id)).toEqual([4]);
  });

  it("親が欠落したフェーズ・コンテンツは入れ子から省略する", () => {
    const orphanPhase = makePhase({ id: 99, theme_id: 99, name: "孤児フェーズ" });
    const orphanContent = makeContent({ id: 99, phase_id: 99, phase: null });
    const content = makeContent({ id: 1, phase_id: 1, phase: phaseJoin(phase1) });

    const tree = buildContentTree([theme1], [phase1, orphanPhase], [content, orphanContent]);

    expect(tree).toHaveLength(1);
    expect(tree[0].phases.map((p) => p.id)).toEqual([1]);
    expect(tree[0].phases[0].contents.map((c) => c.id)).toEqual([1]);
  });

  it("配下がないテーマ・フェーズは空配列のまま残す", () => {
    const emptyTheme = makeTheme({ id: 3, name: "空テーマ", display_order: 3 });
    const emptyPhase = makePhase({
      id: 3,
      theme_id: 1,
      name: "空フェーズ",
      display_order: 2,
      theme: { id: 1, name: "テーマ1", display_order: 1 },
    });

    const tree = buildContentTree([theme1, emptyTheme], [phase1, emptyPhase], []);

    expect(tree.map((t) => t.id)).toEqual([1, 3]);
    expect(tree[0].phases.map((p) => p.id)).toEqual([1, 3]);
    expect(tree[0].phases[0].contents).toEqual([]);
    expect(tree[0].phases[1].contents).toEqual([]);
    expect(tree[1].phases).toEqual([]);
  });

  it("入力配列を破壊しない", () => {
    const themes = [theme2, theme1];
    const phases = [phase1];
    const contents = [makeContent({ id: 1, phase_id: 1, display_order: 1 })];
    const themeIds = themes.map((t) => t.id);
    const contentIds = contents.map((c) => c.id);

    buildContentTree(themes, phases, contents);

    expect(themes.map((t) => t.id)).toEqual(themeIds);
    expect(contents.map((c) => c.id)).toEqual(contentIds);
  });

  it("コンテンツノードに一覧表示用のフィールドを載せる", () => {
    const content = makeContent({
      id: 1,
      phase_id: 1,
      title: "演習A",
      content_type: "exercise",
      is_published: false,
      is_open_to_trial: true,
      grading_rubric_version: 3,
      display_order: 1,
    });

    const tree = buildContentTree([theme1], [phase1], [content]);
    const node = tree[0].phases[0].contents[0];

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
  it("テーマ・フェーズの祖先キーを返す", () => {
    expect(expandKeysForTarget({ themeId: 1, phaseId: 2, contentId: 4 })).toEqual([
      contentTreeNodeKey("theme", 1),
      contentTreeNodeKey("phase", 2),
    ]);
  });

  it("指定された階層だけキーにする（contentId は展開キーに含めない）", () => {
    expect(expandKeysForTarget({ themeId: 1 })).toEqual(["theme:1"]);
    expect(expandKeysForTarget({ phaseId: 2 })).toEqual(["phase:2"]);
    expect(expandKeysForTarget({ contentId: 4 })).toEqual([]);
  });

  it("空のターゲットは空配列を返す", () => {
    expect(expandKeysForTarget({})).toEqual([]);
  });
});
