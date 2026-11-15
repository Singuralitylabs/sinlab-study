import { comparePhaseLevel } from "@/app/lib/content-grouping";

export interface NavigablePhase {
  id: number;
  name: string;
  display_order: number | null;
  is_appendix?: boolean | null;
}

/**
 * Adjacent phases for phase-page prev/next. Order matches comparePhaseLevel (same as the theme
 * page: main phases, then appendices). Current id missing from the list yields null neighbours
 * (no fabricated links).
 */
export function resolveAdjacentPhases(
  phases: NavigablePhase[],
  currentPhaseId: number
): { prev: NavigablePhase | null; next: NavigablePhase | null } {
  const ordered = [...phases].sort(comparePhaseLevel);
  const index = ordered.findIndex((phase) => phase.id === currentPhaseId);
  if (index < 0) {
    return { prev: null, next: null };
  }
  return {
    prev: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}
