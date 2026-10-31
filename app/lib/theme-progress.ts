/**
 * Single place deciding which themes a learner is "in the middle of". There is no theme
 * enrollment: the split comes from completion counts alone, so the dashboard and the weekly
 * digest agree and a future certificate list can reuse it. Counts already carry the viewer's
 * denominator (trial sees only trial-open contents), so nothing here special-cases status.
 */

import { isThemeCompleted } from "@/app/lib/certificate";

export type ThemeCounts = { totalContents: number; completedContents: number };

/**
 * In progress: at least one completion and not finished. "Finished" is the certificate rule
 * (isThemeCompleted), so the dashboard's "completed" and certificate eligibility cannot drift.
 */
export function isActiveTheme(summary: ThemeCounts): boolean {
  return summary.completedContents >= 1 && !isThemeCompleted(summary);
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
    if (isThemeCompleted(summary)) {
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
