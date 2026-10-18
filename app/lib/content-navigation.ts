import { compareGroupLevel } from "@/app/lib/content-grouping";

export type NavigationBoundary = "same-phase" | "phase";

export interface NavigationPhase {
  id: number;
  name: string;
  display_order: number | null;
}

export interface NavigationContentInput {
  id: number;
  title: string;
  phase_id: number;
  display_order: number | null;
}

export interface NavigationContent {
  id: number;
  title: string;
  phaseId: number;
  phaseName: string;
}

export interface AdjacentContent extends NavigationContent {
  boundary: NavigationBoundary;
}

/**
 * Sort by phase then content via compareGroupLevel() (missing display_order last, id tiebreak).
 * Empty phases contribute nothing; contents whose phase_id isn't in the phase list are excluded.
 */
export function buildThemeContentOrder(
  phases: NavigationPhase[],
  contents: NavigationContentInput[]
): NavigationContent[] {
  const sortedPhases = [...phases].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );

  const phaseIds = new Set(sortedPhases.map((phase) => phase.id));
  const contentsByPhaseId = new Map<number, NavigationContentInput[]>();
  for (const content of contents) {
    if (!phaseIds.has(content.phase_id)) continue;
    const list = contentsByPhaseId.get(content.phase_id) ?? [];
    list.push(content);
    contentsByPhaseId.set(content.phase_id, list);
  }

  return sortedPhases.flatMap((phase) => {
    const phaseContents = [...(contentsByPhaseId.get(phase.id) ?? [])].sort((a, b) =>
      compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
    );
    return phaseContents.map((content) => ({
      id: content.id,
      title: content.title,
      phaseId: phase.id,
      phaseName: phase.name,
    }));
  });
}

function resolveBoundary(
  current: NavigationContent,
  adjacent: NavigationContent
): NavigationBoundary {
  if (current.phaseId === adjacent.phaseId) return "same-phase";
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
 * Boundary kind comes only from comparing phaseId of the neighbours, never from URL params.
 * Returns { prev: null, next: null } when the current content isn't in the sequence or the
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
 * (empty sequence, or the current content isn't in it, e.g. a published content under an
 * unpublished phase): compute from the current phase's summary only, and the end goes back to the
 * phase as before.
 */
export function resolveContentNavigation(
  orderedContents: NavigationContent[],
  currentContentId: number,
  phaseLocalContents: NavigationContent[]
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
    ...resolveAdjacentContents(phaseLocalContents, currentContentId),
    endFallback: "phase",
  };
}
