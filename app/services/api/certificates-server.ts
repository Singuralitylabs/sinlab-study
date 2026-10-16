import type { PostgrestError } from "@supabase/supabase-js";
import { CERTIFICATE_NO_MAX_ATTEMPTS } from "@/app/constants/certificate";
import { CERTIFICATE_PASS_SCORE } from "@/app/constants/grading";
import {
  dashboardCertificateCutoff,
  generateCertificateNo,
  isCertificateEligible,
  isCertificateNoCollision,
  isThemeCompleted,
} from "@/app/lib/certificate";
import {
  type CertificateExercise,
  type CertificateExerciseGap,
  certificateExerciseGaps,
  EMPTY_EXERCISE_GAP,
  hasExerciseGap,
  passedContentIdsFromReviews,
  type ThemeCompletionNotice,
} from "@/app/lib/certificate-eligibility";
import { parseDisplayName } from "@/app/lib/display-name";
import { hasGradingRequirements } from "@/app/lib/grading";
import { applyPublishedNestedThemeFilters } from "@/app/lib/published-theme-tree";
import {
  fetchThemeProgressSummaries,
  type ThemeProgressSummary,
} from "@/app/services/api/learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { scheduleCertificateIssuedEmail } from "@/app/services/notifications/user-emails";
import type { Certificate, UserRoleType, UserStatusType } from "@/app/types";

const UNIQUE_VIOLATION = "23505";

/** Theme the content belongs to (content -> week -> phase), read with the user's own session. */
async function fetchThemeIdOfContent(contentId: number): Promise<number | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("learning_contents")
    .select("week:learning_weeks(phase:learning_phases(theme_id))")
    .eq("id", contentId)
    .maybeSingle();

  if (error) {
    console.error("[修了証] コンテンツのテーマ取得エラー:", error.message);
    return null;
  }
  const week = data?.week as unknown as { phase: { theme_id: number } | null } | null;
  return week?.phase?.theme_id ?? null;
}

async function hasCertificate(userId: number, themeId: number): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", themeId)
    .maybeSingle();
  if (error) {
    console.error("[修了証] 発行済みの確認エラー:", error.message);
    return false;
  }
  return data !== null;
}

export type IssuedCertificate = Pick<
  Certificate,
  "id" | "theme_id" | "certificate_no" | "theme_name"
>;

export type IssueResult = {
  issued: readonly IssuedCertificate[];
  /**
   * True when issuance was skipped because display_name fails the same rules as the settings
   * form (blank, too long, or control characters). They fix it on /settings; a certificate
   * already issued keeps the snapshotted recipient_name.
   */
  blockedByMissingName: boolean;
};

// Frozen: one instance is returned to every caller, so a stray push() must not leak across requests.
const NOTHING_ISSUED: IssueResult = Object.freeze({
  issued: Object.freeze([] as IssuedCertificate[]),
  blockedByMissingName: false,
});

/**
 * Inserts one certificate per completed theme summary (service_role; `user_id` fixed to the
 * caller) and schedules the email for each new row. The only service_role use of issuance, shared
 * by the progress trigger and the backfill so the insert / idempotency rules live in one place.
 * UNIQUE (user_id, theme_id) violations (23505) mean already issued and are skipped.
 */
async function insertCertificates(
  userId: number,
  summaries: ThemeProgressSummary[]
): Promise<IssueResult> {
  if (summaries.length === 0) {
    return NOTHING_ISSUED;
  }

  const admin = await createAdminSupabaseClient();
  const { data: user, error: userError } = await admin
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (userError || !user) {
    console.error("[修了証] 受講者名の取得エラー:", userError?.message ?? "user not found");
    return NOTHING_ISSUED;
  }

  // The name is snapshotted and cannot be fixed afterwards. Signup stores Google full_name
  // (VARCHAR(255)) or a blank fallback, which the settings form would reject when it is empty,
  // longer than DISPLAY_NAME_MAX_LENGTH, or contains control characters. Issuance uses the same
  // parse so those strings are not printed.
  const parsedName = parseDisplayName(user.display_name ?? "");
  if (!parsedName.ok) {
    console.warn("[修了証] 受講者名が発行条件を満たさないため発行を見送りました");
    return { issued: [], blockedByMissingName: true };
  }
  const recipientName = parsedName.name;

  const issued: IssuedCertificate[] = [];
  for (const summary of summaries) {
    for (let attempt = 0; attempt < CERTIFICATE_NO_MAX_ATTEMPTS; attempt++) {
      const { data: inserted, error: insertError } = await admin
        .from("certificates")
        .insert({
          user_id: userId,
          theme_id: summary.theme.id,
          certificate_no: generateCertificateNo(new Date()),
          recipient_name: recipientName,
          theme_name: summary.theme.name,
        })
        .select("id, theme_id, certificate_no, theme_name")
        .single();

      if (!insertError) {
        issued.push(inserted);
        scheduleCertificateIssuedEmail({
          userId,
          certificateId: inserted.id,
          themeName: inserted.theme_name,
          certificateNo: inserted.certificate_no,
        });
        break;
      }
      if (insertError.code !== UNIQUE_VIOLATION) {
        console.error("[修了証] 発行エラー:", insertError.message);
        break;
      }
      // Both UNIQUE (user_id, theme_id) and UNIQUE (certificate_no) raise 23505. Only a number
      // collision is worth retrying; a duplicate (user, theme) means it is already issued.
      if (!isCertificateNoCollision(insertError)) {
        break;
      }
      if (attempt === CERTIFICATE_NO_MAX_ATTEMPTS - 1) {
        console.error("[修了証] 証明番号が重複し続けたため発行を見送りました");
      }
    }
  }
  return { issued, blockedByMissingName: false };
}

type PublishedExercise = { id: number; allowedSubmissionTypes: string };

/**
 * Published exercises per theme, using the same nested published-tree filter as
 * fetchThemeProgressSummaries(). Completion still uses that function's counts; this only adds the
 * exercise subset (content_type / allowed_submission_types are on the learner column grant).
 * Null data is an empty catalog. A query error is null so callers fail closed and do not issue.
 */
async function fetchPublishedExercises(): Promise<Map<number, PublishedExercise[]> | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await applyPublishedNestedThemeFilters(
    supabase
      .from("learning_themes")
      .select(
        "id, phases:learning_phases(weeks:learning_weeks(contents:learning_contents(id, content_type, allowed_submission_types)))"
      )
  );
  if (error) {
    console.error("[修了証] 演習一覧の取得エラー:", error.message);
    return null;
  }
  const byTheme = new Map<number, PublishedExercise[]>();
  if (!Array.isArray(data)) {
    return byTheme;
  }
  for (const theme of data) {
    if (!theme || typeof theme !== "object") {
      continue;
    }
    const row = theme as {
      id: number;
      phases:
        | {
            weeks: {
              contents: { id: number; content_type: string; allowed_submission_types: string }[];
            }[];
          }[]
        | null;
    };
    const exercises: PublishedExercise[] = [];
    for (const phase of row.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        for (const content of week.contents ?? []) {
          if (content.content_type !== "exercise") {
            continue;
          }
          exercises.push({
            id: content.id,
            allowedSubmissionTypes: content.allowed_submission_types,
          });
        }
      }
    }
    if (exercises.length > 0) {
      byTheme.set(row.id, exercises);
    }
  }
  return byTheme;
}

/**
 * Learners cannot select grading_rubric. Issuance reads id + grading_rubric with service_role,
 * published and not deleted, and never returns the rubric. Skipped while CERTIFICATE_PASS_SCORE
 * is 0: a submission alone satisfies the rule, so the hidden column stays unread.
 */
async function exercisesWithRubrics(
  published: readonly PublishedExercise[],
  passScore: number
): Promise<CertificateExercise[] | null> {
  const needsRubric =
    passScore > 0 && published.some((exercise) => exercise.allowedSubmissionTypes !== "url");
  if (!needsRubric) {
    return published.map((exercise) => ({ ...exercise, hasRubric: false }));
  }
  const admin = await createAdminSupabaseClient();
  const ids = published
    .filter((exercise) => exercise.allowedSubmissionTypes !== "url")
    .map((exercise) => exercise.id);
  const { data, error } = await admin
    .from("learning_contents")
    .select("id, grading_rubric")
    .in("id", ids)
    .eq("is_published", true)
    .eq("is_deleted", false);
  if (error) {
    console.error("[修了証] 採点基準の取得エラー:", error.message);
    return null;
  }
  const withRubric = new Set(
    (data ?? []).filter((row) => hasGradingRequirements(row.grading_rubric)).map((row) => row.id)
  );
  return published.map((exercise) => ({
    id: exercise.id,
    allowedSubmissionTypes: exercise.allowedSubmissionTypes,
    hasRubric: withRubric.has(exercise.id),
  }));
}

async function loadSubmissionEvidence(
  userId: number,
  exercises: readonly CertificateExercise[],
  passScore: number
): Promise<{ submittedContentIds: Set<number>; passedContentIds: Set<number> } | null> {
  if (exercises.length === 0) {
    return { submittedContentIds: new Set(), passedContentIds: new Set() };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, content_id")
    .eq("user_id", userId)
    .in(
      "content_id",
      exercises.map((exercise) => exercise.id)
    );
  if (error) {
    console.error("[修了証] 提出の取得エラー:", error.message);
    return null;
  }
  const rows = data ?? [];
  const submittedContentIds = new Set(rows.map((row) => row.content_id));
  const needsPass = exercises.some(
    (exercise) => exercise.allowedSubmissionTypes !== "url" && exercise.hasRubric && passScore > 0
  );
  if (!needsPass || rows.length === 0) {
    return { submittedContentIds, passedContentIds: new Set() };
  }
  const { data: reviews, error: reviewError } = await supabase
    .from("ai_reviews")
    .select("submission_id, score_kind, passed")
    .in(
      "submission_id",
      rows.map((row) => row.id)
    )
    .eq("status", "completed");
  if (reviewError) {
    console.error("[修了証] AIレビューの取得エラー:", reviewError.message);
    return null;
  }
  return {
    submittedContentIds,
    passedContentIds: passedContentIdsFromReviews(
      rows.map((row) => ({ id: row.id, contentId: row.content_id })),
      (reviews ?? []).map((row) => ({
        submissionId: row.submission_id,
        scoreKind: row.score_kind,
        passed: row.passed,
      }))
    ),
  };
}

/**
 * Exercise gaps for every published theme. Null when the check itself failed (callers must not
 * issue). Themes with no exercises are absent. passScore defaults to CERTIFICATE_PASS_SCORE so
 * the threshold stays in grading.ts.
 */
export async function fetchThemeExerciseGaps(
  userId: number,
  passScore: number = CERTIFICATE_PASS_SCORE
): Promise<Map<number, CertificateExerciseGap> | null> {
  try {
    const byTheme = await fetchPublishedExercises();
    if (!byTheme) {
      return null;
    }
    const published = [...byTheme.values()].flat();
    const exercises = await exercisesWithRubrics(published, passScore);
    if (!exercises) {
      return null;
    }
    const evidence = await loadSubmissionEvidence(userId, exercises, passScore);
    if (!evidence) {
      return null;
    }
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const gaps = new Map<number, CertificateExerciseGap>();
    for (const [themeId, themeExercises] of byTheme) {
      const rows = themeExercises.flatMap((exercise) => {
        const row = byId.get(exercise.id);
        return row ? [row] : [];
      });
      gaps.set(
        themeId,
        certificateExerciseGaps({
          exercises: rows,
          submittedContentIds: evidence.submittedContentIds,
          passedContentIds: evidence.passedContentIds,
          passScore,
        })
      );
    }
    return gaps;
  } catch (error) {
    console.error("[修了証] 演習条件の取得エラー:", error);
    return null;
  }
}

type CertificateEvaluation =
  | { status: "not-ready" }
  | {
      status: "evaluated";
      themeId: number;
      themeName: string;
      issued: IssuedCertificate | null;
      blockedByMissingName: boolean;
      remaining: ThemeCompletionNotice["remaining"];
    };

function toNotice(
  evaluation: Extract<CertificateEvaluation, { status: "evaluated" }>
): ThemeCompletionNotice {
  return {
    themeId: evaluation.themeId,
    themeName: evaluation.themeName,
    certificateId: evaluation.issued?.id ?? null,
    blockedByMissingName: evaluation.blockedByMissingName,
    remaining: evaluation.remaining,
  };
}

/**
 * Shared issuance decision for one theme. Already-issued, ineligible, incomplete, and unreadable
 * checks return not-ready (no INSERT). A finished theme with exercise gaps is evaluated but not
 * inserted. Never throws; UNIQUE violations stay inside insertCertificates.
 */
async function evaluateThemeForCertificate(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  themeId: number;
  passScore?: number;
}): Promise<CertificateEvaluation> {
  const passScore = params.passScore ?? CERTIFICATE_PASS_SCORE;
  if (!isCertificateEligible(params.userStatus, params.userRole)) {
    return { status: "not-ready" };
  }
  // A read error falls through (UNIQUE still keeps the INSERT idempotent).
  if (await hasCertificate(params.userId, params.themeId)) {
    return { status: "not-ready" };
  }
  const { data: summaries, error } = await fetchThemeProgressSummaries(params.userId);
  if (error || !summaries) {
    return { status: "not-ready" };
  }
  const summary = summaries.find((item) => item.theme.id === params.themeId);
  if (!summary || !isThemeCompleted(summary)) {
    return { status: "not-ready" };
  }
  const gaps = await fetchThemeExerciseGaps(params.userId, passScore);
  if (!gaps) {
    return { status: "not-ready" };
  }
  const exerciseGap = gaps.get(params.themeId) ?? EMPTY_EXERCISE_GAP;
  const remaining = {
    incompleteContents: Math.max(0, summary.totalContents - summary.completedContents),
    unsubmittedExercises: exerciseGap.unsubmittedExercises,
    exercisesNeedingRetry: exerciseGap.exercisesNeedingRetry,
  };
  if (hasExerciseGap(exerciseGap)) {
    return {
      status: "evaluated",
      themeId: summary.theme.id,
      themeName: summary.theme.name,
      issued: null,
      blockedByMissingName: false,
      remaining,
    };
  }
  const { issued, blockedByMissingName } = await insertCertificates(params.userId, [summary]);
  return {
    status: "evaluated",
    themeId: summary.theme.id,
    themeName: summary.theme.name,
    issued: issued[0] ?? null,
    blockedByMissingName,
    remaining,
  };
}

/**
 * Issues one theme when every published content is done and the exercise rules pass. user_id on
 * the INSERT is the authenticated user. UNIQUE (user_id, theme_id) is already issued.
 * passScore defaults to CERTIFICATE_PASS_SCORE (0 disables the rubric-pass rule).
 */
export async function maybeIssueCertificate(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  themeId: number;
  passScore?: number;
}): Promise<IssuedCertificate | null> {
  try {
    const evaluation = await evaluateThemeForCertificate(params);
    return evaluation.status === "evaluated" ? evaluation.issued : null;
  } catch (error) {
    console.error("[修了証] 予期しないエラー:", error);
    return null;
  }
}

/**
 * Issues the certificate of the theme `contentId` belongs to, when the user just finished every
 * published content of it. Called after POST /api/progress marks a content complete.
 *
 * - Eligibility: active member only (trial users and admin / maintainer never receive one).
 * - Completion reuses fetchThemeProgressSummaries() so the denominator (published contents under
 *   published parents) is the one the dashboard shows. It runs with the user's own session (RLS).
 * - Never throws and never returns an error to the caller: a failure here must not change the
 *   progress response (the user's completion is already saved).
 *
 * @returns the newly issued certificate, or null (not eligible / not complete / already issued /
 *   failed).
 */
export async function issueCertificateIfEligible(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  contentId: number;
}): Promise<IssuedCertificate | null> {
  try {
    if (!isCertificateEligible(params.userStatus, params.userRole)) {
      return null;
    }

    const themeId = await fetchThemeIdOfContent(params.contentId);
    if (themeId === null) {
      return null;
    }

    return await maybeIssueCertificate({
      userId: params.userId,
      userStatus: params.userStatus,
      userRole: params.userRole,
      themeId,
    });
  } catch (error) {
    console.error("[修了証] 予期しないエラー:", error);
    return null;
  }
}

/**
 * Dialog payload when this completion is what brought the theme to 100%. Already-complete
 * re-saves and ineligible users get null (no dialog). Issuance runs here, synchronously, so the
 * response can tell "issued" from "exercise conditions remain". Null on failure.
 */
export async function resolveProgressThemeNotice(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  contentId: number;
  contentWasAlreadyCompleted: boolean;
}): Promise<ThemeCompletionNotice | null> {
  try {
    if (!isCertificateEligible(params.userStatus, params.userRole)) {
      return null;
    }
    if (params.contentWasAlreadyCompleted) {
      return null;
    }
    const themeId = await fetchThemeIdOfContent(params.contentId);
    if (themeId === null) {
      return null;
    }
    const evaluation = await evaluateThemeForCertificate({
      userId: params.userId,
      userStatus: params.userStatus,
      userRole: params.userRole,
      themeId,
    });
    return evaluation.status === "evaluated" ? toNotice(evaluation) : null;
  } catch (error) {
    console.error("[修了証] 画面通知の判定エラー:", error);
    return null;
  }
}

/**
 * Same notice as the progress dialog, for a review that just reached `completed`. Already-issued
 * themes and themes that are not yet 100% return null so a routine review stays quiet. A throw
 * is swallowed: the review response must not change when issuance or mail fails.
 */
export async function resolveAiReviewThemeNotice(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  contentId: number;
}): Promise<ThemeCompletionNotice | null> {
  try {
    if (!isCertificateEligible(params.userStatus, params.userRole)) {
      return null;
    }
    const themeId = await fetchThemeIdOfContent(params.contentId);
    if (themeId === null) {
      return null;
    }
    const evaluation = await evaluateThemeForCertificate({
      userId: params.userId,
      userStatus: params.userStatus,
      userRole: params.userRole,
      themeId,
    });
    return evaluation.status === "evaluated" ? toNotice(evaluation) : null;
  } catch (error) {
    console.error("[修了証] AIレビュー後の発行エラー:", error);
    return null;
  }
}

/**
 * Issues certificates for themes that are already 100% complete but have none: themes finished
 * before this feature shipped, or finished while trial (open-to-trial contents only) and approved
 * later. The progress trigger never fires for them. Called when the user opens `/certificates`;
 * the insert is idempotent, so repeated visits and races are safe.
 *
 * @param summaries already-fetched fetchThemeProgressSummaries() result (avoids a second query)
 * @param issuedThemeIds themes that already have a certificate (skipped without an INSERT attempt)
 * @returns the newly issued certificates and whether a blank name blocked issuance; never throws
 *   (a failure just leaves them for next time)
 */
export async function issueMissingCertificates(params: {
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  summaries: ThemeProgressSummary[];
  issuedThemeIds: ReadonlySet<number>;
}): Promise<IssueResult> {
  try {
    if (!isCertificateEligible(params.userStatus, params.userRole)) {
      return NOTHING_ISSUED;
    }
    const missing = params.summaries.filter(
      (s) => isThemeCompleted(s) && !params.issuedThemeIds.has(s.theme.id)
    );
    if (missing.length === 0) {
      return NOTHING_ISSUED;
    }
    // Same exercise rules as the progress trigger. A failed read must not issue on progress alone.
    const gaps = await fetchThemeExerciseGaps(params.userId);
    if (!gaps) {
      return NOTHING_ISSUED;
    }
    const ready = missing.filter(
      (summary) => !hasExerciseGap(gaps.get(summary.theme.id) ?? EMPTY_EXERCISE_GAP)
    );
    return await insertCertificates(params.userId, ready);
  } catch (error) {
    console.error("[修了証] 予期しないエラー:", error);
    return NOTHING_ISSUED;
  }
}

/** The user's own certificates, newest first (RLS limits rows to the owner or a manager). */
export async function fetchMyCertificates(userId: number): Promise<{
  data: Certificate[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("user_id", userId)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("修了証一覧取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/**
 * One certificate for its owner. The `user_id` filter is on top of RLS (which also lets
 * admin / maintainer read), because the page is owner-only: anyone else gets null (404).
 */
export async function fetchMyCertificateById(
  userId: number,
  certificateId: number
): Promise<{ data: Certificate | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", certificateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("修了証取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** Latest certificate issued within the dashboard display window, or null. */
export async function fetchRecentCertificate(
  userId: number,
  now: Date = new Date()
): Promise<Certificate | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("user_id", userId)
    .gte("issued_at", dashboardCertificateCutoff(now))
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("直近の修了証取得エラー:", error.message);
    return null;
  }
  return data;
}

/**
 * Certificate counts per user for /manage/students (read with the manager's own session; RLS
 * allows admin / maintainer). A separate query instead of a column on the progress RPC. A failure
 * returns an empty map so the student list still renders.
 */
export async function fetchCertificateCountsByUser(): Promise<Map<number, number>> {
  const supabase = await createServerSupabaseClient();
  const counts = new Map<number, number>();
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("certificates")
      .select("user_id")
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("修了証枚数取得エラー:", error.message);
      return new Map();
    }
    for (const row of data ?? []) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    }
    if (!data || data.length < pageSize) {
      break;
    }
  }
  return counts;
}
