/**
 * Identifies the question set a learner is answering: ids plus each question's revision (hash of
 * type, text and choices). Explanation / answer-only edits keep it, so shown results stay valid.
 */
export function quizQuestionVersion(questions: { id: number; revision: string }[]): string {
  return questions.map((q) => `${q.id}:${q.revision}`).join(",");
}

/**
 * Message shown after the question set changed under the form. Only when answers or results were
 * actually discarded (a refresh before answering has nothing to redo), and not when the set became
 * empty: the form then shows only "no questions".
 */
export function quizQuestionsUpdatedNotice(
  questionCount: number,
  discardedSomething: boolean
): string | null {
  return questionCount > 0 && discardedSomething
    ? "設問が更新されたため、回答をやり直してください"
    : null;
}

/** A grade result or error tied to the question set it was produced for. */
export type VersionedValue<T> = { version: string; value: T };

/**
 * The value only while its version is the current one. A response that arrives after the set
 * changed is thereby never shown, whatever order the refresh and the response land in.
 */
export function valueForVersion<T>(entry: VersionedValue<T> | null, version: string): T | null {
  return entry && entry.version === version ? entry.value : null;
}

/** The part of the quiz form state tied to a question set (besides the answers themselves). */
export type QuizFormVersionedState<R> = {
  gradeResult: VersionedValue<R> | null;
  errorState: VersionedValue<string> | null;
};

/**
 * State after the question set changed from `previousVersion`. Everything tied to the old set is
 * cleared, errors included: revisions are content hashes, so an admin's edit-and-revert brings the
 * old version back and a kept error would reappear under an empty form. The notice counts only
 * what the learner could see: a real answer (`hasAnswer`, not an emptied entry), shown results or
 * error, a pending submission. Values already hidden by a version mismatch do not count.
 */
export function resetForNewQuizVersion<R>(
  state: QuizFormVersionedState<R>,
  previousVersion: string,
  {
    questionCount,
    hasAnswer,
    isSubmitting,
  }: { questionCount: number; hasAnswer: boolean; isSubmitting: boolean }
): { gradeResult: null; errorState: null; notice: string | null } {
  const discarded =
    hasAnswer ||
    valueForVersion(state.gradeResult, previousVersion) !== null ||
    valueForVersion(state.errorState, previousVersion) !== null ||
    isSubmitting;
  return {
    gradeResult: null,
    errorState: null,
    notice: quizQuestionsUpdatedNotice(questionCount, discarded),
  };
}

/**
 * What to do with a committed grade result for the completion record.
 * - "skip": nothing to handle (no result, a result for an older set, or one already handled)
 * - "mark-handled": current, but must not be recorded (preview, already completed, or a record
 *   already sent whose refresh has not landed yet: re-answering then must not post again and
 *   re-run the certificate / first-completion checks)
 * - "record": post the completion
 */
export function quizCompletionAction({
  resultVersion,
  questionVersion,
  handled,
  completionPending,
  canRecordProgress,
  initialCompleted,
}: {
  resultVersion: string | null;
  questionVersion: string;
  handled: boolean;
  completionPending: boolean;
  canRecordProgress: boolean;
  initialCompleted: boolean;
}): "skip" | "mark-handled" | "record" {
  if (resultVersion === null || resultVersion !== questionVersion || handled) return "skip";
  if (!canRecordProgress || initialCompleted || completionPending) return "mark-handled";
  return "record";
}
