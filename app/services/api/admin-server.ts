import type { PostgrestError } from "@supabase/supabase-js";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { NON_CURRENT_SUBSCRIPTION_STATUSES } from "@/app/services/api/stripe-server";
import type {
  LearningContent,
  LearningContentWithWeek,
  LearningPhase,
  LearningPhaseWithTheme,
  LearningTheme,
  LearningWeek,
  MembershipType,
  UserType,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

// =====================================================
// テーマ管理
// =====================================================

export async function fetchAllThemes(): Promise<{
  data: LearningTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("テーマ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function fetchThemeById(id: number): Promise<{
  data: LearningTheme | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();
  if (error) {
    console.error("テーマ取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function createTheme(theme: {
  name: string;
  description?: string;
  display_order?: number;
  is_published?: boolean;
  image_url?: string | null;
}): Promise<{ data: LearningTheme | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("learning_themes").insert(theme).select().single();

  if (error) {
    console.error("テーマ作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateTheme(
  id: number,
  theme: Partial<LearningTheme>
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("learning_themes").update(theme).eq("id", id);

  if (error) {
    console.error("テーマ更新エラー:", error.message);
    return { error };
  }

  return { error: null };
}

export async function deleteTheme(id: number): Promise<{ error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  // 配下フェーズIDを取得
  const { data: phases, error: phaseFetchError } = await supabase
    .from("learning_phases")
    .select("id")
    .eq("theme_id", id)
    .eq("is_deleted", false);
  if (phaseFetchError) {
    console.error("フェーズ取得エラー:", phaseFetchError.message);
    return { error: phaseFetchError };
  }

  const phaseIds = phases?.map((p) => p.id) ?? [];

  if (phaseIds.length > 0) {
    // 配下週IDを取得
    const { data: weeks, error: weekFetchError } = await supabase
      .from("learning_weeks")
      .select("id")
      .in("phase_id", phaseIds)
      .eq("is_deleted", false);
    if (weekFetchError) {
      console.error("週取得エラー:", weekFetchError.message);
      return { error: weekFetchError };
    }

    const weekIds = weeks?.map((w) => w.id) ?? [];

    if (weekIds.length > 0) {
      // 配下コンテンツを論理削除
      const { error: contentError } = await supabase
        .from("learning_contents")
        .update({ is_deleted: true })
        .in("week_id", weekIds)
        .eq("is_deleted", false);
      if (contentError) {
        console.error("コンテンツ削除エラー:", contentError.message);
        return { error: contentError };
      }
    }

    // 配下週を論理削除
    const { error: weekError } = await supabase
      .from("learning_weeks")
      .update({ is_deleted: true })
      .in("phase_id", phaseIds)
      .eq("is_deleted", false);
    if (weekError) {
      console.error("週削除エラー:", weekError.message);
      return { error: weekError };
    }

    // 配下フェーズを論理削除
    const { error: phaseError } = await supabase
      .from("learning_phases")
      .update({ is_deleted: true })
      .eq("theme_id", id)
      .eq("is_deleted", false);
    if (phaseError) {
      console.error("フェーズ削除エラー:", phaseError.message);
      return { error: phaseError };
    }
  }

  // テーマを論理削除
  const { error } = await supabase
    .from("learning_themes")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("テーマ削除エラー:", error.message);
    return { error };
  }

  return { error: null };
}

// =====================================================
// フェーズ管理
// =====================================================

export async function fetchAllPhases(): Promise<{
  data: LearningPhaseWithTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_phases")
    .select("*, theme:learning_themes(*)")
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("フェーズ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningPhaseWithTheme[], error: null };
}

export async function fetchPhaseById(id: number): Promise<{
  data: LearningPhase | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();
  if (error) {
    console.error("フェーズ取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function createPhase(phase: {
  theme_id: number;
  name: string;
  description?: string;
  display_order?: number;
  is_published?: boolean;
}): Promise<{ data: LearningPhase | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("learning_phases").insert(phase).select().single();

  if (error) {
    console.error("フェーズ作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updatePhase(
  id: number,
  phase: Partial<LearningPhase>
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("learning_phases").update(phase).eq("id", id);

  if (error) {
    console.error("フェーズ更新エラー:", error.message);
    return { error };
  }

  return { error: null };
}

export async function deletePhase(id: number): Promise<{ error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  // 配下週IDを取得
  const { data: weeks, error: weekFetchError } = await supabase
    .from("learning_weeks")
    .select("id")
    .eq("phase_id", id)
    .eq("is_deleted", false);
  if (weekFetchError) {
    console.error("週取得エラー:", weekFetchError.message);
    return { error: weekFetchError };
  }

  const weekIds = weeks?.map((w) => w.id) ?? [];

  if (weekIds.length > 0) {
    // 配下コンテンツを論理削除
    const { error: contentError } = await supabase
      .from("learning_contents")
      .update({ is_deleted: true })
      .in("week_id", weekIds)
      .eq("is_deleted", false);
    if (contentError) {
      console.error("コンテンツ削除エラー:", contentError.message);
      return { error: contentError };
    }

    // 配下週を論理削除
    const { error: weekError } = await supabase
      .from("learning_weeks")
      .update({ is_deleted: true })
      .eq("phase_id", id)
      .eq("is_deleted", false);
    if (weekError) {
      console.error("週削除エラー:", weekError.message);
      return { error: weekError };
    }
  }

  // フェーズを論理削除
  const { error } = await supabase
    .from("learning_phases")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("フェーズ削除エラー:", error.message);
    return { error };
  }

  return { error: null };
}

// =====================================================
// 週管理
// =====================================================

export async function fetchAllWeeks(): Promise<{
  data: (LearningWeek & { phase: LearningPhase | null })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*, phase:learning_phases(*)")
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function fetchWeekById(id: number): Promise<{
  data: LearningWeek | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();
  if (error) {
    console.error("週取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function createWeek(week: {
  phase_id: number;
  name: string;
  description?: string;
  display_order?: number;
  is_published?: boolean;
}): Promise<{ data: LearningWeek | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("learning_weeks").insert(week).select().single();

  if (error) {
    console.error("週作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateWeek(
  id: number,
  week: Partial<LearningWeek>
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("learning_weeks").update(week).eq("id", id);

  if (error) {
    console.error("週更新エラー:", error.message);
    return { error };
  }

  return { error: null };
}

export async function deleteWeek(id: number): Promise<{ error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  // 配下コンテンツを論理削除
  const { error: contentError } = await supabase
    .from("learning_contents")
    .update({ is_deleted: true })
    .eq("week_id", id)
    .eq("is_deleted", false);
  if (contentError) {
    console.error("コンテンツ削除エラー:", contentError.message);
    return { error: contentError };
  }

  // 週を論理削除
  const { error } = await supabase.from("learning_weeks").update({ is_deleted: true }).eq("id", id);
  if (error) {
    console.error("週削除エラー:", error.message);
    return { error };
  }

  return { error: null };
}

// =====================================================
// コンテンツ管理
// =====================================================

export async function fetchAllContents(): Promise<{
  data: LearningContentWithWeek[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*, week:learning_weeks(*, phase:learning_phases(*, theme:learning_themes(*)))")
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  // このキャストは select が theme まで辿れるネスト形状（week.phase.theme）で
  // 返すことに依存する。select を変更する場合は content-grouping.ts の
  // 階層順ソートが参照する week.phase.theme まで含まれることを確認すること
  return { data: data as LearningContentWithWeek[], error: null };
}

export async function fetchContentByIdForAdmin(
  contentId: number
): Promise<{ data: LearningContent | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .eq("id", contentId)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("コンテンツ取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function createContent(content: {
  week_id: number;
  title: string;
  content_type: "video" | "text" | "exercise" | "slide";
  video_url?: string;
  text_content?: string;
  exercise_instructions?: string;
  hint?: string;
  reference_answer?: string;
  allowed_submission_types?: "code" | "url" | "both";
  code_language?: "javascript" | "typescript" | "html" | "css";
  pdf_url?: string;
  display_order?: number;
  is_published?: boolean;
  is_open_to_trial?: boolean;
}): Promise<{ data: LearningContent | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .insert(content)
    .select()
    .single();

  if (error) {
    console.error("コンテンツ作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateContent(
  id: number,
  content: Partial<LearningContent>
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase.from("learning_contents").update(content).eq("id", id);

  if (error) {
    console.error("コンテンツ更新エラー:", error.message);
    return { error };
  }

  return { error: null };
}

/**
 * 複数コンテンツへ同一の更新を一括適用する。`.eq("is_deleted", false)` により
 * 削除済み行への再操作を防ぐ。
 */
export async function bulkUpdateContents(
  ids: number[],
  patch: Partial<LearningContent>
): Promise<{ error: PostgrestError | null; updated: number }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .update(patch)
    .in("id", ids)
    .eq("is_deleted", false)
    .select("id");

  if (error) {
    console.error("コンテンツ一括更新エラー:", error.message);
    return { error, updated: 0 };
  }

  return { error: null, updated: data?.length ?? 0 };
}

export async function deleteContent(id: number): Promise<{ error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("learning_contents")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    console.error("コンテンツ削除エラー:", error.message);
    return { error };
  }

  return { error: null };
}

// =====================================================
// ユーザー管理（承認・却下・ロール変更）
// =====================================================

export async function fetchAllUsers(): Promise<{
  data: UserType[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ユーザー一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as UserType[], error: null };
}

/**
 * 現在契約中とみなせるStripeサブスクリプション行を持つユーザーIDの一覧を取得する
 * （/admin/users でのサブスク会員バッジ表示用）。
 *
 * `stripe_subscriptions` は1ユーザー1行固定で解約後も行が残り続けるため、
 * 契約が記録されていない行（NON_CURRENT_SUBSCRIPTION_STATUSES: 終端状態およびCheckout
 * 手続き中）は「現在は契約していない」として除外する。
 */
export async function fetchUserIdsWithStripeSubscription(): Promise<{
  data: number[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("stripe_subscriptions")
    .select("user_id")
    .not("status", "in", `(${NON_CURRENT_SUBSCRIPTION_STATUSES.join(",")})`);

  if (error) {
    console.error("サブスク契約ユーザー一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return {
    data: data.map((row) => row.user_id),
    error: null,
  };
}

/**
 * ユーザーを承認する。承認と同時に会員種別（コミュニティ会員 / 一般有料会員）を設定する。
 *
 * 承認済み（active）ユーザーの再承認は不可。会員種別も上書きするため、古い画面からの
 * 再承認で設定済みの種別が既定値に書き換わる事故を防ぐ（種別変更は #95 で対応）。
 * 事前SELECTによるチェックでは同時リクエスト間で競合し、SELECT失敗時にフェイルオープン
 * にもなるため、UPDATE自体に条件を折り込み原子的に判定する。
 *
 * @returns updated: 更新が行われたか。false は既に承認済み・存在しない・削除済みのいずれか
 */
export async function approveUser(
  userId: number,
  membershipType: MembershipType
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.ACTIVE,
      membership_type: membershipType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .neq("status", USER_STATUS.ACTIVE)
    .select("id");

  if (error) {
    console.error("ユーザー承認エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

/**
 * ユーザーを却下する。却下ユーザーは会員種別を持たないため NULL に戻す。
 *
 * 対象が admin の場合は却下不可（`change_role` と同様の管理者保護）。事前SELECTでの
 * チェックだと判定と更新の間に競合の余地があり、SELECT失敗時にフェイルオープンにも
 * なるため、UPDATE自体に条件を折り込み原子的に判定する（`approveUser()` と同じ方針）。
 * service_role クライアントはRLSを迂回するため `is_deleted = false` も明示的に必須。
 * 対象が admin・存在しない・削除済みのいずれの場合も updated: false を返す。
 */
export async function rejectUser(
  userId: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.REJECTED,
      membership_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("is_deleted", false)
    .neq("role", USER_ROLE.ADMIN)
    .select("id");

  if (error) {
    console.error("ユーザー却下エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

/**
 * ユーザーのロールを変更する。対象が admin の場合は変更不可（降格・誤操作防止）。
 * 却下と同じ理由でUPDATEに条件を折り込み原子的に判定する（`rejectUser()` 参照）。
 * ロール変更は active ユーザーのみが対象（`docs/specification.md` 2.7）。
 */
export async function changeUserRole(
  userId: number,
  role: "member" | "maintainer" | "admin"
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("is_deleted", false)
    .eq("status", USER_STATUS.ACTIVE)
    .neq("role", USER_ROLE.ADMIN)
    .select("id");

  if (error) {
    console.error("ユーザーロール変更エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

// =====================================================
// 受講生管理
// =====================================================

interface StudentProgress {
  user: Pick<UserType, "id" | "display_name" | "email">;
  totalContents: number;
  completedContents: number;
  lastActivity: string | null;
}

export async function fetchStudentsProgress(): Promise<{
  data: StudentProgress[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  // アクティブなユーザー一覧と公開コンテンツの総数は独立しているため並列で取得する
  const [usersResult, contentsCountResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, email")
      .eq("status", USER_STATUS.ACTIVE)
      .eq("is_deleted", false)
      .order("display_name"),
    supabase
      .from("learning_contents")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("is_deleted", false),
  ]);

  const { data: users, error: usersError } = usersResult;
  const { count: totalContents, error: contentsCountError } = contentsCountResult;

  if (usersError) {
    console.error("ユーザー一覧取得エラー:", usersError.message);
    return { data: null, error: usersError };
  }

  // 総数が取れなくても受講生一覧の表示は維持するため、エラーはログのみ（totalContents は0扱い）
  if (contentsCountError) {
    console.error("公開コンテンツ総数取得エラー:", contentsCountError.message);
  }

  // 完了済み進捗を全ユーザー分まとめて取得し、ユーザー単位に集約する
  // （ユーザーごとの逐次クエリによるN+1を回避）。
  // PostgRESTの1リクエスト最大行数（既定1000行）を超えても取りこぼさないよう range でページングする。
  // サーバー側の max-rows 設定が pageSize より小さい場合でも取りこぼさないよう、
  // offset は実際に返った行数で進め、0件になった時点で終了する。
  // 進捗の取得に失敗した場合はエラーにせず完了数0で返し、受講生一覧の表示を維持する。
  const progressByUser = new Map<number, { completedCount: number; lastActivity: string | null }>();
  if ((users ?? []).length > 0) {
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: progress, error: progressError } = await supabase
        .from("user_progress")
        .select("user_id, completed_at")
        .eq("is_completed", true)
        .order("id")
        .range(offset, offset + pageSize - 1);

      if (progressError) {
        console.error("受講生進捗取得エラー:", progressError.message);
        progressByUser.clear();
        break;
      }

      const rows = progress ?? [];
      for (const row of rows) {
        const entry = progressByUser.get(row.user_id) ?? { completedCount: 0, lastActivity: null };
        entry.completedCount += 1;
        if (row.completed_at && (!entry.lastActivity || row.completed_at > entry.lastActivity)) {
          entry.lastActivity = row.completed_at;
        }
        progressByUser.set(row.user_id, entry);
      }

      offset += rows.length;
      hasMore = rows.length > 0;
    }
  }

  const studentsProgress: StudentProgress[] = (users ?? []).map((user) => {
    const progress = progressByUser.get(user.id);
    return {
      user,
      totalContents: totalContents || 0,
      completedContents: progress?.completedCount ?? 0,
      lastActivity: progress?.lastActivity ?? null,
    };
  });

  return { data: studentsProgress, error: null };
}

// =====================================================
// 管理ダッシュボード
// =====================================================

interface ManageCounts {
  themes: number;
  phases: number;
  weeks: number;
  contents: number;
  students: number;
}

/**
 * 管理ダッシュボードの各件数を取得（head + count のみでレコード本体は取得しない）
 * 一部の件数取得に失敗しても 0 として返し、ダッシュボードの表示を維持する。
 */
export async function fetchManageCounts(): Promise<{
  data: ManageCounts;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const [themes, phases, weeks, contents, students] = await Promise.all([
    supabase
      .from("learning_themes")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),
    supabase
      .from("learning_phases")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),
    supabase
      .from("learning_weeks")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),
    supabase
      .from("learning_contents")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("status", USER_STATUS.ACTIVE)
      .eq("is_deleted", false),
  ]);

  const firstError =
    themes.error ?? phases.error ?? weeks.error ?? contents.error ?? students.error ?? null;
  if (firstError) {
    console.error("管理ダッシュボード件数取得エラー:", firstError.message);
  }

  return {
    data: {
      themes: themes.count ?? 0,
      phases: phases.count ?? 0,
      weeks: weeks.count ?? 0,
      contents: contents.count ?? 0,
      students: students.count ?? 0,
    },
    error: firstError,
  };
}
