import type { PostgrestError } from "@supabase/supabase-js";
import { CERTIFICATE_NO_MAX_ATTEMPTS } from "@/app/constants/certificate";
import {
  dashboardCertificateCutoff,
  generateCertificateNo,
  isCertificateEligible,
  isThemeCompleted,
} from "@/app/lib/certificate";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
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

export type IssuedCertificate = Pick<Certificate, "id" | "certificate_no" | "theme_name">;

/**
 * Issues the certificate of the theme `contentId` belongs to, when the user just finished every
 * published content of it. Called after POST /api/progress marks a content complete.
 *
 * - Eligibility: active member only (trial users and admin / maintainer never receive one).
 * - Completion reuses fetchThemeProgressSummaries() so the denominator (published contents under
 *   published parents) is the one the dashboard shows. It runs with the user's own session (RLS).
 * - The INSERT is the only service_role use here; `user_id` is fixed to the caller. UNIQUE
 *   (user_id, theme_id) makes it idempotent: an existing certificate (23505) is not an error.
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

    const { data: summaries, error } = await fetchThemeProgressSummaries(params.userId);
    if (error || !summaries) {
      return null;
    }
    const summary = summaries.find((s) => s.theme.id === themeId);
    if (!summary || !isThemeCompleted(summary)) {
      return null;
    }

    const admin = await createAdminSupabaseClient();

    const { data: user, error: userError } = await admin
      .from("users")
      .select("display_name")
      .eq("id", params.userId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (userError || !user) {
      console.error("[修了証] 受講者名の取得エラー:", userError?.message ?? "user not found");
      return null;
    }

    for (let attempt = 0; attempt < CERTIFICATE_NO_MAX_ATTEMPTS; attempt++) {
      const { data: inserted, error: insertError } = await admin
        .from("certificates")
        .insert({
          user_id: params.userId,
          theme_id: themeId,
          certificate_no: generateCertificateNo(new Date()),
          recipient_name: user.display_name,
          theme_name: summary.theme.name,
        })
        .select("id, certificate_no, theme_name")
        .single();

      if (!insertError) {
        scheduleCertificateIssuedEmail({
          userId: params.userId,
          certificateId: inserted.id,
          themeName: inserted.theme_name,
          certificateNo: inserted.certificate_no,
        });
        return inserted;
      }
      if (insertError.code !== UNIQUE_VIOLATION) {
        console.error("[修了証] 発行エラー:", insertError.message);
        return null;
      }
      // Both UNIQUE (user_id, theme_id) and UNIQUE (certificate_no) raise 23505. Only a number
      // collision is worth retrying; a duplicate (user, theme) means it is already issued.
      if (!insertError.message.includes("certificate_no")) {
        return null;
      }
    }
    console.error("[修了証] 証明番号が重複し続けたため発行を見送りました");
    return null;
  } catch (error) {
    console.error("[修了証] 予期しないエラー:", error);
    return null;
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
