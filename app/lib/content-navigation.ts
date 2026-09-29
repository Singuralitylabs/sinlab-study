import { compareGroupLevel } from "@/app/lib/content-grouping";

export type NavigationBoundary = "same-week" | "week" | "phase";

export interface NavigationWeek {
  id: number;
  name: string;
  display_order: number | null;
  phase: {
    id: number;
    name: string;
    display_order: number | null;
  } | null;
}

export interface NavigationContentInput {
  id: number;
  title: string;
  week_id: number;
  display_order: number | null;
}

export interface NavigationContent {
  id: number;
  title: string;
  weekId: number;
  weekName: string;
  phaseId: number;
  phaseName: string;
}

export interface AdjacentContent extends NavigationContent {
  boundary: NavigationBoundary;
}

/**
 * Sort by phase then week via compareGroupLevel() (missing display_order last, id tiebreak). Empty
 * weeks/phases contribute nothing; weeks with a null phase and contents whose week_id isn't in the
 * week list are excluded.
 */
export function buildThemeContentOrder(
  weeks: NavigationWeek[],
  contents: NavigationContentInput[]
): NavigationContent[] {
  const weeksWithPhase = weeks.filter(
    (week): week is NavigationWeek & { phase: NonNullable<NavigationWeek["phase"]> } =>
      week.phase != null
  );

  const sortedWeeks = [...weeksWithPhase].sort((a, b) => {
    const phaseCompare = compareGroupLevel(
      a.phase.display_order,
      b.phase.display_order,
      a.phase.id,
      b.phase.id
    );
    if (phaseCompare !== 0) return phaseCompare;
    return compareGroupLevel(a.display_order, b.display_order, a.id, b.id);
  });

  const weekIds = new Set(sortedWeeks.map((week) => week.id));
  const contentsByWeekId = new Map<number, NavigationContentInput[]>();
  for (const content of contents) {
    if (!weekIds.has(content.week_id)) continue;
    const list = contentsByWeekId.get(content.week_id) ?? [];
    list.push(content);
    contentsByWeekId.set(content.week_id, list);
  }

  return sortedWeeks.flatMap((week) => {
    const weekContents = [...(contentsByWeekId.get(week.id) ?? [])].sort((a, b) =>
      compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
    );
    return weekContents.map((content) => ({
      id: content.id,
      title: content.title,
      weekId: week.id,
      weekName: week.name,
      phaseId: week.phase.id,
      phaseName: week.phase.name,
    }));
  });
}

function resolveBoundary(
  current: NavigationContent,
  adjacent: NavigationContent
): NavigationBoundary {
  if (current.weekId === adjacent.weekId) return "same-week";
  if (current.phaseId === adjacent.phaseId) return "week";
  return "phase";
}

function toAdjacent(
  current: NavigationContent,
  adjacent: NavigationContent | undefined
): AdjacentContent | null {
  if (!adjacent) return null;
  return { ...adjacent, boundary: resolveBoundary(current, adjacent) };
}

/**
 * Boundary kind comes only from comparing phaseId / weekId of the neighbours, never from URL
 * params. Returns { prev: null, next: null } when the current content isn't in the sequence or the
 * sequence is empty.
 */
export function resolveAdjacentContents(
  orderedContents: NavigationContent[],
  currentContentId: number
): { prev: AdjacentContent | null; next: AdjacentContent | null } {
  const index = orderedContents.findIndex((content) => content.id === currentContentId);
  if (index < 0) {
    return { prev: null, next: null };
  }

  const current = orderedContents[index];
  return {
    prev: toAdjacent(current, orderedContents[index - 1]),
    next: toAdjacent(current, orderedContents[index + 1]),
  };
}

/** End-button target: "theme" at the end of the theme sequence, "phase" in the degraded mode. */
export type NavigationEndFallback = "theme" | "phase";

/**
 * Normal case: navigate within the theme sequence (the end goes back to the theme). Degraded case
 * (empty sequence, or the current content isn't in it, e.g. a published week under an unpublished
 * phase): compute from the current week's summary only, and the end goes back to the phase as
 * before.
 */
export function resolveContentNavigation(
  orderedContents: NavigationContent[],
  currentContentId: number,
  weekLocalContents: NavigationContent[]
): {
  prev: AdjacentContent | null;
  next: AdjacentContent | null;
  endFallback: NavigationEndFallback;
} {
  if (orderedContents.some((content) => content.id === currentContentId)) {
    return {
      ...resolveAdjacentContents(orderedContents, currentContentId),
      endFallback: "theme",
    };
  }

  return {
    ...resolveAdjacentContents(weekLocalContents, currentContentId),
    endFallback: "phase",
  };
}
