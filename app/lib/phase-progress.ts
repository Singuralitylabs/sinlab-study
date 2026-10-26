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
 * Theme-page phase icon: true when every published content in the phase is locked for the
 * viewer (trial + not open to trial). Empty phases and phases with no published content stay
 * unlocked so they keep the not-started book icon (#505). Uses already-fetched summaries —
 * no extra query. Callers pass isContentLockedForUser (false for non-trial), so members /
 * admin / maintainer never see a locked phase.
 */
export function isPhaseFullyLockedForUser<T extends { is_published: boolean }>(
  contents: T[],
  isLocked: (content: T) => boolean
): boolean {
  const published = contents.filter((content) => content.is_published);
  return published.length > 0 && published.every(isLocked);
}

export const PHASE_PROGRESS_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export type PhaseProgressStatus =
  (typeof PHASE_PROGRESS_STATUS)[keyof typeof PHASE_PROGRESS_STATUS];

/**
 * An empty denominator is never "completed": a phase with nothing countable has nothing to finish,
 * and a green check there would tell learners they finished work that doesn't exist.
 */
export function getPhaseProgressStatus({ completed, total }: PhaseProgress): PhaseProgressStatus {
  if (total > 0 && completed >= total) return PHASE_PROGRESS_STATUS.COMPLETED;
  if (completed > 0) return PHASE_PROGRESS_STATUS.IN_PROGRESS;
  return PHASE_PROGRESS_STATUS.NOT_STARTED;
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

/**
 * Every phase must be completed, and a phase with nothing countable is never completed. Skipping
 * those would show "all phases done" to a trial user who finished the only unlocked phase while
 * the remaining phases are fully locked.
 */
export function isThemeCompleted(phases: { progress: PhaseProgress }[]): boolean {
  return (
    phases.length > 0 &&
    phases.every(
      ({ progress }) => getPhaseProgressStatus(progress) === PHASE_PROGRESS_STATUS.COMPLETED
    )
  );
}
