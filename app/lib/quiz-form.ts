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

/** The part of the quiz form state tied to a question set. */
export type QuizFormVersionedState<A, R> = {
  answers: Record<number, A>;
  gradeResult: VersionedValue<R> | null;
  errorState: VersionedValue<string> | null;
};

/**
 * State after the question set changed from `previousVersion`. Everything tied to the old set is
 * cleared, errors included: revisions are content hashes, so an admin's edit-and-revert brings the
 * old version back and a kept error would reappear under an empty form. The notice counts only
 * what the learner could see (answers, shown results / error, a pending submission), not values
 * already hidden by a version mismatch.
 */
export function resetForNewQuizVersion<A, R>(
  state: QuizFormVersionedState<A, R>,
  previousVersion: string,
  { questionCount, isSubmitting }: { questionCount: number; isSubmitting: boolean }
): QuizFormVersionedState<A, R> & { notice: string | null } {
  const discarded =
    Object.keys(state.answers).length > 0 ||
    valueForVersion(state.gradeResult, previousVersion) !== null ||
    valueForVersion(state.errorState, previousVersion) !== null ||
    isSubmitting;
  return {
    answers: {},
    gradeResult: null,
    errorState: null,
    notice: quizQuestionsUpdatedNotice(questionCount, discarded),
  };
}
