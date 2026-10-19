import { compareGroupLevel } from "@/app/lib/content-grouping";

export interface NavigablePhase {
  id: number;
  name: string;
  display_order: number | null;
}

/**
 * Adjacent phases for phase-page prev/next. Order matches compareGroupLevel (same as the theme
 * accordion). Current id missing from the list yields null neighbours (no fabricated links).
 */
export function resolveAdjacentPhases(
  phases: NavigablePhase[],
  currentPhaseId: number
): { prev: NavigablePhase | null; next: NavigablePhase | null } {
  const ordered = [...phases].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  const index = ordered.findIndex((phase) => phase.id === currentPhaseId);
  if (index < 0) {
    return { prev: null, next: null };
  }
  return {
    prev: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}
