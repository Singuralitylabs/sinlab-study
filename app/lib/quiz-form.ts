/**
 * Identifies the question set a learner is answering: ids plus each question's revision (hash of
 * type, text and choices). Explanation / answer-only edits keep it, so shown results stay valid.
 */
export function quizQuestionVersion(questions: { id: number; revision: string }[]): string {
  return questions.map((q) => `${q.id}:${q.revision}`).join(",");
}

/**
 * Message shown after the question set changed under the form. None when it became empty: the
 * form then shows only "no questions", and a stale notice would linger behind it.
 */
export function quizQuestionsUpdatedNotice(questionCount: number): string | null {
  return questionCount > 0 ? "設問が更新されたため、回答をやり直してください" : null;
}

/** A grade response for a set the form no longer shows must not be displayed or recorded. */
export function isStaleQuizGrade(sentVersion: string, currentVersion: string): boolean {
  return sentVersion !== currentVersion;
}
