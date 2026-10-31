import { CONTENT_TYPES } from "@/app/constants/content";
import type { ContentType, ManageContentListItem, ManagePhaseListItem } from "@/app/types";

export function isContentType(value: string | undefined): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

/** Article markdown is text_content for text and an optional slide article. Other types store null. */
export function contentTypeStoresTextContent(contentType: ContentType): boolean {
  return contentType === "text" || contentType === "slide";
}

export interface ThemeFilterOption {
  id: number;
  name: string;
}

export interface PhaseFilterOption {
  id: number;
  name: string;
  themeId: number;
}

export interface ContentFilterOptions {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
}

/**
 * Derives filter options from the contents join; no extra fetch. Run sortContentsByHierarchy first
 * so options come in theme -> phase order. The admin list uses derivePhaseSelectOptions (phase
 * list); this one is kept for tests and callers that build options from a contents join.
 */
export function deriveFilterOptions(contents: ManageContentListItem[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();
  const phases = new Map<number, PhaseFilterOption>();

  for (const content of contents) {
    const phase = content.phase;
    if (!phase) continue;

    const theme = phase.theme;
    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
    if (!phases.has(phase.id)) {
      phases.set(phase.id, { id: phase.id, name: phase.name, themeId: phase.theme_id });
    }
  }

  return { themes: [...themes.values()], phases: [...phases.values()] };
}

/**
 * Derives the cascading theme -> phase options from the phase list; no extra fetch. Run
 * sortPhasesByHierarchy first for hierarchical order. learning_phases.theme_id is NOT NULL, so
 * phases are always included.
 */
export function derivePhaseSelectOptions(phases: ManagePhaseListItem[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();

  for (const phase of phases) {
    const theme = phase.theme;
    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
  }

  return {
    themes: [...themes.values()],
    phases: phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      themeId: phase.theme_id,
    })),
  };
}

export interface ContentFilterParams {
  q?: string;
}

/**
 * Title search only; theme/phase/type filtering moved to fetchAllContents' SQL filters (#196).
 */
export function filterContents(
  contents: ManageContentListItem[],
  params: ContentFilterParams
): ManageContentListItem[] {
  const q = params.q?.trim().toLowerCase();
  if (!q) {
    return contents;
  }

  return contents.filter((content) => content.title.toLowerCase().includes(q));
}
