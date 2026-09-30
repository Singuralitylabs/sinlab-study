import { CONTENT_TYPES } from "@/app/constants/content";
import type { ContentType, ManageContentListItem, ManageWeekListItem } from "@/app/types";

export function isContentType(value: string | undefined): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
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

export interface WeekFilterOption {
  id: number;
  name: string;
  phaseId: number;
}

export interface ContentFilterOptions {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  weeks: WeekFilterOption[];
}

/**
 * Derives filter options from the contents join; no extra fetch. Run sortContentsByHierarchy first
 * so options come in theme -> phase -> week order. The admin list uses deriveWeekSelectOptions
 * (week list); this one is kept for tests and callers that build options from a contents join.
 */
export function deriveFilterOptions(contents: ManageContentListItem[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();
  const phases = new Map<number, PhaseFilterOption>();
  const weeks = new Map<number, WeekFilterOption>();

  for (const content of contents) {
    const week = content.week;
    if (!week) continue;

    const phase = week.phase;
    const theme = phase?.theme;

    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
    if (phase && !phases.has(phase.id)) {
      phases.set(phase.id, { id: phase.id, name: phase.name, themeId: phase.theme_id });
    }
    if (!weeks.has(week.id)) {
      weeks.set(week.id, { id: week.id, name: week.name, phaseId: week.phase_id });
    }
  }

  return {
    themes: [...themes.values()],
    phases: [...phases.values()],
    weeks: [...weeks.values()],
  };
}

/**
 * Derives the cascading theme -> phase -> week options from the week list; no extra fetch. Run
 * sortWeeksByHierarchy first for hierarchical order. learning_weeks.phase_id is NOT NULL, so weeks
 * are always included (unlike deriveFilterOptions, there is no "no week" exclusion).
 */
export function deriveWeekSelectOptions(weeks: ManageWeekListItem[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();
  const phases = new Map<number, PhaseFilterOption>();

  for (const week of weeks) {
    const phase = week.phase;
    const theme = phase?.theme;

    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
    if (phase && !phases.has(phase.id)) {
      phases.set(phase.id, { id: phase.id, name: phase.name, themeId: phase.theme_id });
    }
  }

  return {
    themes: [...themes.values()],
    phases: [...phases.values()],
    weeks: weeks.map((week) => ({ id: week.id, name: week.name, phaseId: week.phase_id })),
  };
}

export interface ContentFilterParams {
  q?: string;
}

/**
 * Title search only; theme/phase/week/type filtering moved to fetchAllContents' SQL filters (#196).
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
