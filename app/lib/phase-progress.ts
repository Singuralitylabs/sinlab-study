interface ProgressContent {
  id: number;
  is_published: boolean;
}

export interface PhaseProgress {
  completed: number;
  total: number;
}

/**
 * The progress denominator counts only unlocked content whose content/phase/theme are all
 * published. Unpublished content previewed by admin / maintainer and content under unpublished
 * parents can't be completed, so counting them would leave the bar stuck below 100% (#68). The
 * theme and phase pages share this so their numbers can't drift apart.
 */
export function summarizePhaseProgress<T extends ProgressContent>(
  contents: T[],
  options: {
    isLocked: (content: T) => boolean;
    ancestorsPublished: boolean;
    progressMap: Map<number, boolean>;
  }
): PhaseProgress {
  const countable = contents.filter(
    (content) => !options.isLocked(content) && content.is_published && options.ancestorsPublished
  );
  return {
    completed: countable.filter((content) => options.progressMap.get(content.id)).length,
    total: countable.length,
  };
}

/**
 * The phase to expand first on the theme page: the first one with work left. When everything is
 * done (or nothing is countable) fall back to the first phase so the page never renders fully
 * collapsed.
 */
export function pickInitiallyOpenPhaseId(
  phases: { id: number; progress: PhaseProgress }[]
): number | null {
  const next = phases.find(({ progress }) => progress.completed < progress.total);
  return (next ?? phases[0])?.id ?? null;
}
