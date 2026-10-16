import { CERTIFICATE_PASS_SCORE } from "@/app/constants/grading";

/**
 * Exercise rows that can still block a certificate after every published content is complete.
 * `hasRubric` is a live rubric (non-empty requirements). A deleted rubric is not one.
 */
export type CertificateExercise = {
  id: number;
  allowedSubmissionTypes: string;
  hasRubric: boolean;
};

export type CertificateExerciseGap = {
  unsubmittedExercises: number;
  exercisesNeedingRetry: number;
};

export const EMPTY_EXERCISE_GAP: CertificateExerciseGap = {
  unsubmittedExercises: 0,
  exercisesNeedingRetry: 0,
};

export type CertificateRemainder = CertificateExerciseGap & {
  incompleteContents: number;
};

/** Payload of POST /api/progress and POST /api/ai-review when a theme just became certifiable. */
export type ThemeCompletionNotice = {
  themeId: number;
  themeName: string;
  certificateId: number | null;
  blockedByMissingName: boolean;
  remaining: CertificateRemainder;
};

const RUBRIC_SCORE_KIND = "rubric";

/**
 * Code (and "both") exercises need a rubric pass only while the shared pass threshold is on.
 * URL-only exercises never do: there is no code review to pass. `estimated` / `none` / `legacy`
 * are ignored by the caller, which only puts `score_kind = rubric` and `passed = true` into
 * `passedContentIds` (any one such review is enough; a later lower score does not undo it).
 */
export function exerciseRequiresRubricPass(
  exercise: CertificateExercise,
  passScore: number = CERTIFICATE_PASS_SCORE
): boolean {
  return exercise.allowedSubmissionTypes !== "url" && exercise.hasRubric && passScore > 0;
}

export function certificateExerciseGaps(params: {
  exercises: readonly CertificateExercise[];
  submittedContentIds: ReadonlySet<number>;
  passedContentIds: ReadonlySet<number>;
  passScore?: number;
}): CertificateExerciseGap {
  const passScore = params.passScore ?? CERTIFICATE_PASS_SCORE;
  let unsubmittedExercises = 0;
  let exercisesNeedingRetry = 0;
  for (const exercise of params.exercises) {
    if (!params.submittedContentIds.has(exercise.id)) {
      unsubmittedExercises += 1;
      continue;
    }
    if (
      exerciseRequiresRubricPass(exercise, passScore) &&
      !params.passedContentIds.has(exercise.id)
    ) {
      exercisesNeedingRetry += 1;
    }
  }
  return { unsubmittedExercises, exercisesNeedingRetry };
}

export function hasExerciseGap(gap: CertificateExerciseGap): boolean {
  return gap.unsubmittedExercises > 0 || gap.exercisesNeedingRetry > 0;
}

/** Content ids that have at least one rubric review with passed = true. Other score kinds drop out. */
export function passedContentIdsFromReviews(
  submissions: readonly { id: number; contentId: number }[],
  reviews: readonly { submissionId: number; scoreKind: string; passed: boolean | null }[]
): Set<number> {
  const contentBySubmission = new Map(submissions.map((row) => [row.id, row.contentId]));
  const passed = new Set<number>();
  for (const review of reviews) {
    if (review.scoreKind !== RUBRIC_SCORE_KIND || review.passed !== true) {
      continue;
    }
    const contentId = contentBySubmission.get(review.submissionId);
    if (contentId != null) {
      passed.add(contentId);
    }
  }
  return passed;
}

/** Japanese fragments shared by the dialog and /certificates. Zero counts are omitted. */
export function formatCertificateRemainder(remaining: CertificateRemainder): string {
  const parts: string[] = [];
  if (remaining.incompleteContents > 0) {
    parts.push(`未完了のコンテンツが ${remaining.incompleteContents} 件`);
  }
  if (remaining.unsubmittedExercises > 0) {
    parts.push(`未提出の演習が ${remaining.unsubmittedExercises} 件`);
  }
  if (remaining.exercisesNeedingRetry > 0) {
    parts.push(`再挑戦が必要な演習が ${remaining.exercisesNeedingRetry} 件`);
  }
  return parts.join("、");
}

export type ThemeCompletionCopy = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

/** Dialog copy. Issued, exercise gaps, a blocked display name, and an unknown failure stay distinct. */
export function themeCompletionCopy(notice: ThemeCompletionNotice): ThemeCompletionCopy {
  if (notice.certificateId != null) {
    return {
      title: `『${notice.themeName}』を修了しました`,
      description: "修了証を発行しました",
      href: `/certificates/${notice.certificateId}`,
      linkLabel: "修了証を見る",
    };
  }
  const remainder = formatCertificateRemainder(notice.remaining);
  if (remainder) {
    return {
      title: "すべてのコンテンツを完了しました",
      description: `修了証の発行には、あと ${remainder} が必要です`,
      href: "/certificates",
      linkLabel: "修了証のページへ",
    };
  }
  if (notice.blockedByMissingName) {
    return {
      title: "すべてのコンテンツを完了しました",
      description: "この表示名では修了証を発行できません。設定画面で名前を入力してください",
      href: "/settings",
      linkLabel: "設定画面を開く",
    };
  }
  return {
    title: "すべてのコンテンツを完了しました",
    description: "修了証を発行できませんでした。時間をおいて再読み込みしてください。",
    href: "/certificates",
    linkLabel: "修了証のページへ",
  };
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Drops a malformed progress / review payload so the dialog never renders half a notice. */
export function parseThemeCompletionNotice(value: unknown): ThemeCompletionNotice | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const themeId = readCount(row.themeId);
  if (themeId === null || themeId <= 0 || typeof row.themeName !== "string" || !row.themeName) {
    return null;
  }
  const certificateId = row.certificateId === null ? null : readCount(row.certificateId);
  if (certificateId === null && row.certificateId !== null) {
    return null;
  }
  if (certificateId !== null && certificateId <= 0) {
    return null;
  }
  if (!row.remaining || typeof row.remaining !== "object") {
    return null;
  }
  const remaining = row.remaining as Record<string, unknown>;
  const incompleteContents = readCount(remaining.incompleteContents);
  const unsubmittedExercises = readCount(remaining.unsubmittedExercises);
  const exercisesNeedingRetry = readCount(remaining.exercisesNeedingRetry);
  if (
    incompleteContents === null ||
    unsubmittedExercises === null ||
    exercisesNeedingRetry === null
  ) {
    return null;
  }
  return {
    themeId,
    themeName: row.themeName,
    certificateId,
    blockedByMissingName: row.blockedByMissingName === true,
    remaining: { incompleteContents, unsubmittedExercises, exercisesNeedingRetry },
  };
}

/**
 * Notice only for the request that asked to complete. Uncomplete never notifies, even if a stale
 * body still carries themeCompletion.
 */
export function noticeFromProgressBody(
  requestedCompletion: boolean,
  body: unknown
): ThemeCompletionNotice | null {
  if (!requestedCompletion || !body || typeof body !== "object") {
    return null;
  }
  return parseThemeCompletionNotice((body as { themeCompletion?: unknown }).themeCompletion);
}

export type PendingCertificateStatus =
  | { kind: "in-progress"; label: string; remainder: string | null }
  | { kind: "remaining"; message: string }
  | { kind: "name-blocked" }
  | { kind: "issue-failed" };

/**
 * /certificates copy for a theme that has no certificate yet. `exerciseGap === null` means the
 * exercise query failed: do not invent zero unsubmitted exercises. The 100% predicate matches
 * isThemeCompleted (an empty theme is not complete) without importing certificate.ts, which pulls
 * in node:crypto and cannot be bundled into the client dialog.
 */
export function pendingCertificateStatus(params: {
  totalContents: number;
  completedContents: number;
  exerciseGap: CertificateExerciseGap | null;
  blockedByMissingName: boolean;
}): PendingCertificateStatus {
  const themeCompleted =
    params.totalContents > 0 && params.completedContents >= params.totalContents;
  const remainder = formatCertificateRemainder({
    incompleteContents: Math.max(0, params.totalContents - params.completedContents),
    unsubmittedExercises: params.exerciseGap?.unsubmittedExercises ?? 0,
    exercisesNeedingRetry: params.exerciseGap?.exercisesNeedingRetry ?? 0,
  });
  if (!themeCompleted) {
    return {
      kind: "in-progress",
      label: `修了すると発行されます（${params.completedContents} / ${params.totalContents}）`,
      remainder: remainder || null,
    };
  }
  if (params.exerciseGap && hasExerciseGap(params.exerciseGap)) {
    return {
      kind: "remaining",
      message: `修了証の発行には、あと ${formatCertificateRemainder({
        incompleteContents: 0,
        unsubmittedExercises: params.exerciseGap.unsubmittedExercises,
        exercisesNeedingRetry: params.exerciseGap.exercisesNeedingRetry,
      })} が必要です`,
    };
  }
  if (params.blockedByMissingName) {
    return { kind: "name-blocked" };
  }
  return { kind: "issue-failed" };
}
