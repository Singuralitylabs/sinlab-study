/**
 * Single place deciding which themes a learner is "in the middle of". There is no theme
 * enrollment: the split comes from completion counts alone, so the dashboard and the weekly
 * digest agree and a future certificate list can reuse it. Counts already carry the viewer's
 * denominator (trial sees only trial-open contents), so nothing here special-cases status.
 */

export type ThemeCounts = { totalContents: number; completedContents: number };

/** Started: at least one completion. A fully completed theme is also "active" here; see split. */
export function isActiveTheme(summary: ThemeCounts): boolean {
  return summary.completedContents >= 1;
}

export function isCompletedTheme(summary: ThemeCounts): boolean {
  return summary.totalContents > 0 && summary.completedContents >= summary.totalContents;
}

function completionRate(summary: ThemeCounts): number {
  return summary.totalContents > 0 ? summary.completedContents / summary.totalContents : 0;
}

/**
 * - active: started and not finished, highest completion rate first (ties keep input order)
 * - completed: 100%, input order
 * - notStarted: no completion, input order
 * Input order is the caller's `display_order`, which this function must not reorder.
 */
export function splitThemesByActivity<T extends ThemeCounts>(
  summaries: readonly T[]
): { active: T[]; completed: T[]; notStarted: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  const notStarted: T[] = [];

  for (const summary of summaries) {
    if (isCompletedTheme(summary)) {
      completed.push(summary);
    } else if (isActiveTheme(summary)) {
      active.push(summary);
    } else {
      notStarted.push(summary);
    }
  }

  active.sort((a, b) => completionRate(b) - completionRate(a));
  return { active, completed, notStarted };
}
