import { compareGroupLevel } from "@/app/lib/content-grouping";
import type {
  ContentType,
  ManageContentListItem,
  ManagePhaseListItem,
  ManageThemeListItem,
} from "@/app/types";

export type ContentTreeContentNode = {
  id: number;
  title: string;
  contentType: ContentType;
  isPublished: boolean;
  isOpenToTrial: boolean;
  gradingRubricVersion: number | null;
  displayOrder: number | null;
};

export type ContentTreePhaseNode = {
  id: number;
  name: string;
  isPublished: boolean;
  displayOrder: number | null;
  themeId: number | null;
  contents: ContentTreeContentNode[];
};

export type ContentTreeThemeNode = {
  id: number;
  name: string;
  isPublished: boolean;
  displayOrder: number | null;
  phases: ContentTreePhaseNode[];
};

export type ContentTreeExpandTarget = {
  themeId?: number;
  phaseId?: number;
  contentId?: number;
};

/**
 * Build a theme → phase → content tree for the manage contents screen (#335).
 * Orphans (missing parent) are omitted from the nested tree; callers can still list contents via
 * the flat ContentsTable for bulk ops.
 */
export function buildContentTree(
  themes: ManageThemeListItem[],
  phases: ManagePhaseListItem[],
  contents: ManageContentListItem[]
): ContentTreeThemeNode[] {
  const sortedThemes = [...themes].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  const sortedPhases = [...phases].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  const sortedContents = [...contents].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );

  const contentsByPhase = new Map<number, ContentTreeContentNode[]>();
  for (const content of sortedContents) {
    if (content.phase_id == null) continue;
    const list = contentsByPhase.get(content.phase_id) ?? [];
    list.push({
      id: content.id,
      title: content.title,
      contentType: content.content_type,
      isPublished: content.is_published,
      isOpenToTrial: content.is_open_to_trial,
      gradingRubricVersion: content.grading_rubric_version,
      displayOrder: content.display_order,
    });
    contentsByPhase.set(content.phase_id, list);
  }

  const phasesByTheme = new Map<number, ContentTreePhaseNode[]>();
  for (const phase of sortedPhases) {
    if (phase.theme_id == null) continue;
    const list = phasesByTheme.get(phase.theme_id) ?? [];
    list.push({
      id: phase.id,
      name: phase.name,
      isPublished: phase.is_published,
      displayOrder: phase.display_order,
      themeId: phase.theme_id,
      contents: contentsByPhase.get(phase.id) ?? [],
    });
    phasesByTheme.set(phase.theme_id, list);
  }

  return sortedThemes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    isPublished: theme.is_published,
    displayOrder: theme.display_order,
    phases: phasesByTheme.get(theme.id) ?? [],
  }));
}

/** Keys used by the tree UI for expand/collapse state. */
export function contentTreeNodeKey(level: "theme" | "phase", id: number): string {
  return `${level}:${id}`;
}

/**
 * Expand ancestors of a just-created node so it is visible after refresh (#335).
 */
export function expandKeysForTarget(target: ContentTreeExpandTarget): string[] {
  const keys: string[] = [];
  if (target.themeId != null) keys.push(contentTreeNodeKey("theme", target.themeId));
  if (target.phaseId != null) keys.push(contentTreeNodeKey("phase", target.phaseId));
  return keys;
}
