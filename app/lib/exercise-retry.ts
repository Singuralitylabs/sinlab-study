/**
 * Whether the learner is mid-retry for an exercise: they clicked "再度課題に取り組む"
 * and have not submitted again since. A newer submission ends the retry without clearing
 * retry_started_at (comparison alone decides).
 */
export function isExerciseRetryInProgress({
  latestSubmittedAt,
  retryStartedAt,
}: {
  latestSubmittedAt: string | null | undefined;
  retryStartedAt: string | null | undefined;
}): boolean {
  if (!retryStartedAt) {
    return false;
  }
  if (!latestSubmittedAt) {
    // Retry requires a prior submission; treat missing latest as still in progress so the
    // UI does not flash model answers if the submission fetch failed after retry started.
    return true;
  }
  return new Date(latestSubmittedAt).getTime() <= new Date(retryStartedAt).getTime();
}
