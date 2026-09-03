import type { PostgrestError } from "@supabase/supabase-js";
import { USER_STATUS } from "@/app/constants/user";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import type {
  LearningContent,
  LearningContentWithWeek,
  LearningPhase,
  LearningTheme,
  LearningWeek,
  UserRoleType,
  UserStatusType,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/**
 * テーマ一覧を取得。
 * admin / maintainer は未公開テーマもプレビューとして取得できる（issue #68）。
 */
export async function fetchPublishedThemes(userRole: UserRoleType | null = null): Promise<{
  data: LearningTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from("learning_themes").select("*").eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.order("display_order");

  if (error) {
    console.error("テーマ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * ダッシュボード用のテーマ別進捗サマリー
 */
export interface ThemeProgressSummary {
  theme: LearningTheme;
  totalContents: number;
  completedContents: number;
}

/** ネストselectで取得するテーマ行（フェーズ→週→コンテンツIDの埋め込み付き） */
type ThemeWithNestedContents = LearningTheme & {
  phases: { id: number; weeks: { id: number; contents: { id: number }[] }[] }[];
};

/**
 * 全公開テーマの進捗サマリーを取得（ダッシュボード用）
 *
 * テーマ→フェーズ→週→コンテンツをネストselect 1本で取得し、
 * 完了進捗をユーザー単位でまとめて照会する（テーマごとの逐次クエリによるN+1を回避）。
 * 完了進捗の取得に失敗した場合はエラーにせず完了数0で返し、テーマ一覧の表示を維持する。
 */
export async function fetchThemeProgressSummaries(userId: number): Promise<{
  data: ThemeProgressSummary[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: themes, error: themesError } = await supabase
    .from("learning_themes")
    .select(
      "*, phases:learning_phases(id, weeks:learning_weeks(id, contents:learning_contents(id)))"
    )
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("phases.is_published", true)
    .eq("phases.is_deleted", false)
    .eq("phases.weeks.is_published", true)
    .eq("phases.weeks.is_deleted", false)
    .eq("phases.weeks.contents.is_published", true)
    .eq("phases.weeks.contents.is_deleted", false)
    .order("display_order");

  if (themesError) {
    console.error("テーマ進捗サマリー取得エラー:", themesError.message);
    return { data: null, error: themesError };
  }

  const themeContents = (themes as ThemeWithNestedContents[]).map(({ phases, ...theme }) => ({
    theme,
    contentIds: phases.flatMap((phase) =>
      phase.weeks.flatMap((week) => week.contents.map((content) => content.id))
    ),
  }));

  const hasContents = themeContents.some((t) => t.contentIds.length > 0);

  // 完了済みコンテンツIDをユーザー単位で全件取得する。
  // content_id での .in() 絞り込みは行わない（分子はテーマごとの Set 突合で確定するため不要で、
  // 全コンテンツIDをクエリ文字列に直列化するとカタログ増加時にURL長上限を超えるため）。
  // PostgRESTの1リクエスト最大行数（既定1000行）を超えても取りこぼさないよう range でページングする。
  const completedIds = new Set<number>();
  const pageSize = 1000;
  for (let offset = 0; hasContents; offset += pageSize) {
    const { data: progress, error: progressError } = await supabase
      .from("user_progress")
      .select("content_id")
      .eq("user_id", userId)
      .eq("is_completed", true)
      .order("content_id")
      .range(offset, offset + pageSize - 1);

    if (progressError) {
      // 進捗が取れなくてもテーマ一覧自体は表示できるよう、完了数0にフォールバックして継続する
      console.error("テーマ進捗サマリーの進捗取得エラー:", progressError.message);
      completedIds.clear();
      break;
    }

    for (const p of progress || []) {
      completedIds.add(p.content_id);
    }
    if (!progress || progress.length < pageSize) {
      break;
    }
  }

  const data = themeContents.map(({ theme, contentIds }) => ({
    theme,
    totalContents: contentIds.length,
    completedContents: contentIds.filter((id) => completedIds.has(id)).length,
  }));

  return { data, error: null };
}

/**
 * テーマ詳細を取得。
 * admin / maintainer は未公開テーマもプレビューとして取得できる（issue #68）。
 */
export async function fetchThemeById(
  themeId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: LearningTheme | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_themes")
    .select("*")
    .eq("id", themeId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.single();

  if (error) {
    console.error("テーマ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * テーマに属するフェーズ一覧を取得。
 * admin / maintainer は未公開フェーズもプレビューとして取得できる（issue #68）。
 */
export async function fetchPhasesByThemeId(
  themeId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: LearningPhase[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_phases")
    .select("*")
    .eq("theme_id", themeId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.order("display_order");

  if (error) {
    console.error("テーマ別フェーズ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * 公開フェーズ一覧を取得
 */
export async function fetchPublishedPhases(): Promise<{
  data: LearningPhase[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("フェーズ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * フェーズ詳細を取得。
 * admin / maintainer は未公開フェーズもプレビューとして取得できる（issue #68）。
 */
export async function fetchPhaseById(
  phaseId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: LearningPhase | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_phases")
    .select("*")
    .eq("id", phaseId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.single();

  if (error) {
    console.error("フェーズ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * ロック表示に必要な最小限のコンテンツサマリー（本文カラムは含めない）。
 * お試し非公開コンテンツもタイトルを含めて取得できるよう service_role で取得する。
 * is_published は未公開バッジ表示（admin / maintainer のプレビュー時）に使用する。
 */
export type ContentVisibilitySummary = Pick<
  LearningContent,
  "id" | "title" | "content_type" | "display_order" | "is_open_to_trial" | "is_published"
> & { week_id: number };

/**
 * お試しユーザー（status='pending'）に対してコンテンツをロック表示すべきか判定する。
 * コースツリー（フェーズページ）とコンテンツ詳細ページのロック判定で共通して使用する。
 */
export function isContentLockedForUser(
  userStatus: UserStatusType | null,
  isOpenToTrial: boolean
): boolean {
  return userStatus === USER_STATUS.PENDING && !isOpenToTrial;
}

/**
 * 対象コンテンツが、渡されたクライアント（呼び出し元の認証コンテキスト）から可視かどうかを判定する。
 * RLSにより、お試し非公開・未公開・存在しないコンテンツIDのいずれも0行となり false を返す。
 * 進捗・提出・AIレビューAPIのコンテンツ可視性チェックに使用する（機能設計書 4.1/5.1 参照）。
 * is_published を明示的に絞り込むことで、admin / maintainer のプレビュー中であっても
 * 未公開コンテンツへの進捗登録・提出・AIレビューは常に不可とする（issue #68 の既定）。
 */
export async function isContentVisible(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  contentId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("learning_contents")
    .select("id")
    .eq("id", contentId)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    // fail-closed（不可視として扱う）は維持しつつ、DB障害と「本当に不可視」を
    // ログ上で区別できるようにする
    console.error("コンテンツ可視性チェックエラー:", error.message);
  }

  return !!data;
}

/**
 * 指定した週IDに属する公開コンテンツのサマリー（タイトル・種別・表示順・お試し公開フラグ）を取得する。
 *
 * service_role クライアントを使用する（RLS強化により、お試し非公開コンテンツは通常クライアントの
 * SELECT では取得できないため）。コースツリーのロック表示、およびコンテンツ詳細ページの
 * 存在チェック（404 とロックの区別）に使用する（機能設計書 2.6 参照）。
 * service_role は RLS を素通りするため is_published / is_deleted は必ず絞り込み、
 * 本文カラム（text_content 等）は select しない。
 */
export async function fetchContentVisibilitySummariesByWeekIds(weekIds: number[]): Promise<{
  data: ContentVisibilitySummary[] | null;
  error: PostgrestError | null;
}> {
  if (weekIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("id, title, content_type, display_order, is_open_to_trial, week_id")
    .in("week_id", weekIds)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツ可視性サマリー取得エラー:", error.message);
    return { data: null, error };
  }

  // service_role 経路は is_published = true のみを扱うため、常に true を補う
  const summaries = (data ?? []).map((content) => ({ ...content, is_published: true }));
  return { data: summaries as ContentVisibilitySummary[], error: null };
}

/**
 * 指定した週IDに属するコンテンツのサマリーを、未公開分も含めて通常クライアントで取得する。
 * admin / maintainer のプレビュー専用の経路（issue #68）。RLS（is_published = true OR
 * ロールが admin/maintainer）により、実際に未公開分まで返るのは admin / maintainer のみ。
 */
async function fetchContentSummariesByWeekIdsForManager(weekIds: number[]): Promise<{
  data: ContentVisibilitySummary[] | null;
  error: PostgrestError | null;
}> {
  if (weekIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("id, title, content_type, display_order, is_open_to_trial, is_published, week_id")
    .in("week_id", weekIds)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツサマリー取得エラー（管理者向け）:", error.message);
    return { data: null, error };
  }

  return { data: data as ContentVisibilitySummary[], error: null };
}

/**
 * 指定した週IDに属するコンテンツのサマリーをロールに応じて取得する。
 * admin / maintainer は未公開コンテンツも含めて取得する（通常クライアント経由）。
 * それ以外（member / お試しユーザー）は従来どおり service_role 経由で公開分のみ取得する
 * （CLAUDE.md の service_role 利用条件を維持するため）。
 */
export async function fetchContentSummariesByWeekIds(
  weekIds: number[],
  userRole: UserRoleType | null = null
): Promise<{
  data: ContentVisibilitySummary[] | null;
  error: PostgrestError | null;
}> {
  if (checkContentPermissions(userRole)) {
    return fetchContentSummariesByWeekIdsForManager(weekIds);
  }
  return fetchContentVisibilitySummariesByWeekIds(weekIds);
}

/**
 * フェーズに属する週一覧をコンテンツ付きで取得。
 * admin / maintainer は未公開の週・コンテンツもプレビューとして取得できる（issue #68）。
 */
export async function fetchWeeksWithContentsByPhaseId(
  phaseId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: (LearningWeek & { contents: ContentVisibilitySummary[] })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_weeks")
    .select("*")
    .eq("phase_id", phaseId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data: weeks, error } = await query.order("display_order");

  if (error) {
    console.error("週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  const weekIds = (weeks ?? []).map((week) => week.id);
  const { data: contents, error: contentsError } = await fetchContentSummariesByWeekIds(
    weekIds,
    userRole
  );

  if (contentsError) {
    return { data: null, error: contentsError };
  }

  const contentsByWeekId = new Map<number, ContentVisibilitySummary[]>();
  for (const content of contents ?? []) {
    const list = contentsByWeekId.get(content.week_id) ?? [];
    list.push(content);
    contentsByWeekId.set(content.week_id, list);
  }

  const data = (weeks ?? []).map((week) => ({
    ...week,
    contents: contentsByWeekId.get(week.id) ?? [],
  }));

  return { data, error: null };
}

/**
 * フェーズに属する公開週一覧を取得
 */
export async function fetchWeeksByPhaseId(phaseId: number): Promise<{
  data: LearningWeek[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*")
    .eq("phase_id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * 週詳細を取得（フェーズ・テーマ情報付き）。
 * admin / maintainer は未公開週もプレビューとして取得できる（issue #68）。
 */
export async function fetchWeekById(
  weekId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data:
    | (LearningWeek & {
        phase: (LearningPhase & { theme: LearningTheme | null }) | null;
      })
    | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_weeks")
    .select("*, phase:learning_phases(*, theme:learning_themes(*))")
    .eq("id", weekId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.single();

  if (error) {
    console.error("週詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * 週に属する公開コンテンツ一覧を取得
 */
export async function fetchContentsByWeekId(weekId: number): Promise<{
  data: LearningContent[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .eq("week_id", weekId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * コンテンツ詳細を取得（週・フェーズ・テーマ情報付き）。
 * admin / maintainer は未公開コンテンツもプレビューとして取得できる（issue #68）。
 */
export async function fetchContentById(
  contentId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: LearningContentWithWeek | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_contents")
    .select("*, week:learning_weeks(*, phase:learning_phases(*, theme:learning_themes(*)))")
    .eq("id", contentId)
    .eq("is_deleted", false);
  if (!checkContentPermissions(userRole)) {
    query = query.eq("is_published", true);
  }
  const { data, error } = await query.single();

  if (error) {
    console.error("コンテンツ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentWithWeek, error: null };
}

/**
 * ユーザーの進捗を取得
 */
export async function fetchUserProgressByContentIds(
  userId: number,
  contentIds: number[]
): Promise<{
  data: Map<number, boolean>;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  if (contentIds.length === 0) {
    return { data: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from("user_progress")
    .select("content_id, is_completed")
    .eq("user_id", userId)
    .in("content_id", contentIds);

  if (error) {
    console.error("進捗取得エラー:", error.message);
    return { data: new Map(), error };
  }

  const progressMap = new Map<number, boolean>();
  for (const item of data || []) {
    progressMap.set(item.content_id, item.is_completed);
  }

  return { data: progressMap, error: null };
}

/**
 * 特定コンテンツの進捗を取得
 */
export async function fetchUserProgressByContentId(
  userId: number,
  contentId: number
): Promise<{
  isCompleted: boolean;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("user_progress")
    .select("is_completed")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .maybeSingle();

  if (error) {
    console.error("進捗取得エラー:", error.message);
    return { isCompleted: false, error };
  }

  return { isCompleted: data?.is_completed ?? false, error: null };
}
