import type { PostgrestError } from "@supabase/supabase-js";
import { USER_STATUS } from "@/app/constants/user";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import {
  buildThemeContentOrder,
  type NavigationContent,
  type NavigationWeek,
} from "@/app/lib/content-navigation";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import type {
  LearningContent,
  LearningContentListItem,
  LearningContentWithBreadcrumb,
  LearningPhase,
  LearningTheme,
  LearningWeek,
  LearningWeekWithBreadcrumb,
  UserRoleType,
  UserStatusType,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/**
 * コンテンツ一覧用のカラム定義（本文・指示・模範解答・ヒント等の重いテキストカラムを除外）
 */
export const LEARNING_CONTENT_LIST_COLUMNS =
  "id, week_id, title, content_type, video_url, pdf_url, is_open_to_trial, is_published, is_deleted, display_order, created_at, updated_at";

/**
 * パンくず・所属判定用の親テーブルカラム定義。
 * DETAIL 定数はこれらを合成して使う（重複インライン展開を避ける）。
 */
export const BREADCRUMB_THEME_COLUMNS = "id, name, is_published, is_deleted";
export const BREADCRUMB_PHASE_COLUMNS = `id, theme_id, name, is_published, is_deleted, theme:learning_themes(${BREADCRUMB_THEME_COLUMNS})`;
export const BREADCRUMB_WEEK_COLUMNS = `id, phase_id, name, is_published, is_deleted, phase:learning_phases(${BREADCRUMB_PHASE_COLUMNS})`;

/**
 * 週詳細用（本体は全カラム、所属フェーズ/テーマはパンくず用）
 */
export const LEARNING_WEEK_DETAIL_COLUMNS = `*, phase:learning_phases(${BREADCRUMB_PHASE_COLUMNS})`;

/**
 * コンテンツ詳細用（本文含む全カラム＋親階層パンくず情報）
 */
export const LEARNING_CONTENT_DETAIL_COLUMNS = `*, week:learning_weeks(${BREADCRUMB_WEEK_COLUMNS})`;

/**
 * admin / maintainer 以外は is_published = true で絞り込む（issue #68 のプレビュー機能）。
 * 各取得関数の `.eq("is_deleted", false)` の後に挟んで使う共通ヘルパー。
 * theme/phase/week は select("*") のため PostgREST の型推論が浅く、
 * `.eq("is_published", true)` のカラム制約をそのまま書ける。
 */
function applyPublishedFilterUnlessManager<
  Q extends { eq(column: "is_published", value: boolean): Q },
>(query: Q, userRole: UserRoleType | null): Q {
  return checkContentPermissions(userRole) ? query : query.eq("is_published", true);
}

/**
 * テーマ一覧を取得。
 * admin / maintainer は未公開テーマもプレビューとして取得できる（issue #68）。
 */
export async function fetchPublishedThemes(userRole: UserRoleType | null = null): Promise<{
  data: LearningTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const query = applyPublishedFilterUnlessManager(
    supabase.from("learning_themes").select("*").eq("is_deleted", false),
    userRole
  );
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

  const query = applyPublishedFilterUnlessManager(
    supabase.from("learning_themes").select("*").eq("id", themeId).eq("is_deleted", false),
    userRole
  );
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

  const query = applyPublishedFilterUnlessManager(
    supabase.from("learning_phases").select("*").eq("theme_id", themeId).eq("is_deleted", false),
    userRole
  );
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

  const query = applyPublishedFilterUnlessManager(
    supabase.from("learning_phases").select("*").eq("id", phaseId).eq("is_deleted", false),
    userRole
  );
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
 * お試しユーザー（status='trial'）に対してコンテンツをロック表示すべきか判定する。
 * コースツリー（フェーズページ）とコンテンツ詳細ページのロック判定で共通して使用する。
 */
export function isContentLockedForUser(
  userStatus: UserStatusType | null,
  isOpenToTrial: boolean
): boolean {
  return userStatus === USER_STATUS.TRIAL && !isOpenToTrial;
}

/**
 * 対象コンテンツが、渡されたクライアント（呼び出し元の認証コンテキスト）から可視かどうかを判定する。
 * 進捗・提出・AIレビューAPIのコンテンツ可視性チェックに使用する（機能設計書 4.1/5.1 参照）。
 *
 * コンテンツ自身だけでなく、所属する週・フェーズ・テーマの全階層について
 * `is_published = true AND is_deleted = false` を明示的に判定する。`learning_contents` の
 * SELECT RLS は admin / maintainer に無条件で許可されるため、コンテンツ行の is_published だけを
 * 見ると、論理削除済みのコンテンツや、未公開の週・フェーズ・テーマ配下にある（誤って公開フラグが
 * 立った）コンテンツへの進捗登録・提出・AIレビューが admin / maintainer に対して通ってしまう。
 * ロールに関わらず、いずれかの階層が公開・未削除でなければ false を返す（issue #68 の既定）。
 */
export async function isContentVisible(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  contentId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("learning_contents")
    .select(
      "id, week:learning_weeks!inner(phase:learning_phases!inner(theme:learning_themes!inner(id)))"
    )
    .eq("id", contentId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("week.is_published", true)
    .eq("week.is_deleted", false)
    .eq("week.phase.is_published", true)
    .eq("week.phase.is_deleted", false)
    .eq("week.phase.theme.is_published", true)
    .eq("week.phase.theme.is_deleted", false)
    .maybeSingle();

  if (error) {
    // fail-closed（不可視として扱う）は維持しつつ、DB障害と「本当に不可視」を
    // ログ上で区別できるようにする
    console.error("コンテンツ可視性チェックエラー:", error.message);
  }

  return !!data;
}

/**
 * コンテンツ自身だけでなく、週・フェーズ・テーマの全階層が公開済み・未削除かどうかを判定する。
 * admin / maintainer のプレビュー画面で「未公開」バッジ表示・完了ボタン / 提出フォームの
 * 表示可否に使う（コンテンツ行自体は公開済みでも、親階層のいずれかが未公開・論理削除済みなら
 * プレビュー扱いとする。issue #68）。
 *
 * `fetchContentById()` の select は親階層（week/phase/theme）に is_deleted のフィルタを
 * 課していない（`.eq("is_deleted", false)` はコンテンツ自身にのみ適用）ため、ここで明示的に
 * 判定する。判定しないと、論理削除済みの親を持つコンテンツで「完了ボタン等は表示されるが
 * `isContentVisible()` は必ず403を返す」というUIとAPIの不整合が起きる。
 */
export function isContentFullyPublished(content: LearningContentWithBreadcrumb): boolean {
  const week = content.week;
  const phase = week?.phase;
  const theme = phase?.theme;

  return (
    content.is_published &&
    week?.is_published === true &&
    week?.is_deleted === false &&
    phase?.is_published === true &&
    phase?.is_deleted === false &&
    theme?.is_published === true &&
    theme?.is_deleted === false
  );
}

/**
 * service_role 経路（受講生向け）の select カラム許可リスト（CLAUDE.md・機能設計書 2.6 の
 * 不変条件）。`id, title, content_type, display_order, is_open_to_trial, week_id` の6列のみで、
 * `is_published` は含めない（このリストを拡張すると service_role が RLS を素通りして
 * 追加カラムを返してしまうため、admin / maintainer 向け経路とは別に維持する）。
 */
const CONTENT_VISIBILITY_SUMMARY_COLUMNS =
  "id, title, content_type, display_order, is_open_to_trial, week_id";

/** PostgREST の1リクエスト既定上限。切り詰めで行が欠けるのを防ぐため range でページングする */
const POSTGREST_MAX_ROWS = 1000;

async function collectPagedRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: PostgrestError | null }>
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
    const { data, error } = await fetchPage(offset, offset + POSTGREST_MAX_ROWS - 1);
    if (error) {
      return { data: null, error };
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_MAX_ROWS) {
      break;
    }
  }
  return { data: rows, error: null };
}

/**
 * 指定した週IDに属する公開コンテンツのサマリー（タイトル・種別・表示順・お試し公開フラグ）を取得する。
 *
 * service_role クライアントを使用する（RLS強化により、お試し非公開コンテンツは通常クライアントの
 * SELECT では取得できないため）。コースツリーのロック表示、およびコンテンツ詳細ページの
 * 存在チェック（404 とロックの区別）に使用する（機能設計書 2.6 参照）。
 * service_role は RLS を素通りするため is_published / is_deleted は必ず絞り込み、
 * 本文カラム（text_content 等）は select しない。カラムは `CONTENT_VISIBILITY_SUMMARY_COLUMNS`
 * の許可リストのみを select し、`is_published` は select せず常に `true` を補う
 * （下の `.eq("is_published", true)` と対になっている。フィルタ条件を変える場合はこの補完も
 * 合わせて見直すこと）。
 *
 * 並びは `display_order` → `id`（`compareGroupLevel` と同じタイブレーク）。
 * PostgREST の1リクエスト上限（既定1000行）を超えても取りこぼさないよう range でページングする。
 * ページングしないと、テーマ全体を `display_order` 昇順で切った結果から現在の週の行が落ち、
 * コンテンツ詳細の `summary` 未検出で404になる。
 */
export async function fetchContentVisibilitySummariesByWeekIds(weekIds: number[]): Promise<{
  data: ContentVisibilitySummary[] | null;
  error: PostgrestError | null;
}> {
  if (weekIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await collectPagedRows(async (from, to) => {
    const result = await supabase
      .from("learning_contents")
      .select(CONTENT_VISIBILITY_SUMMARY_COLUMNS)
      .in("week_id", weekIds)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .order("display_order")
      .order("id")
      .range(from, to);
    return { data: result.data, error: result.error };
  });

  if (error) {
    console.error("コンテンツ可視性サマリー取得エラー:", error.message);
    return { data: null, error };
  }

  const summaries = (data ?? []).map((content) => ({ ...content, is_published: true as const }));
  return { data: summaries, error: null };
}

/**
 * 指定した週IDに属するコンテンツのサマリーを、未公開分も含めて通常クライアントで取得する。
 * admin / maintainer のプレビュー専用の経路（issue #68）。RLS（is_published = true OR
 * ロールが admin/maintainer）により、実際に未公開分まで返るのは admin / maintainer のみ。
 * service_role を使わず RLS 適用下で取得するため、`is_published`（バッジ表示用）も
 * select してよい（`CONTENT_VISIBILITY_SUMMARY_COLUMNS` の許可リストは service_role 経路専用
 * なのでここでは使わない）。is_deleted は必ず絞り込む（admin / maintainer 向け SELECT RLS は
 * is_deleted を見ないため）。
 */
async function fetchContentSummariesByWeekIdsForManager(weekIds: number[]): Promise<{
  data: ContentVisibilitySummary[] | null;
  error: PostgrestError | null;
}> {
  if (weekIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await collectPagedRows(async (from, to) => {
    const result = await supabase
      .from("learning_contents")
      .select("id, title, content_type, display_order, is_open_to_trial, is_published, week_id")
      .in("week_id", weekIds)
      .eq("is_deleted", false)
      .order("display_order")
      .order("id")
      .range(from, to);
    return { data: result.data, error: result.error };
  });

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

const THEME_NAVIGATION_WEEK_COLUMNS =
  "id, phase_id, name, display_order, phase:learning_phases!inner(id, name, display_order, theme_id)";

export interface ThemeNavigationIndex {
  orderedContents: NavigationContent[];
  currentWeekContents: ContentVisibilitySummary[];
}

/**
 * コンテンツ詳細ページの前後ナビ用に、テーマ内通し列と現在の週のサマリーを返す。
 *
 * 内部で2クエリを実行する。
 * 1. 通常クライアント（RLS適用）でテーマ配下の週＋フェーズを取得する。**service_role は使わない。**
 * 2. 既存の `fetchContentSummariesByWeekIds()` を1回呼ぶ（受講生向けは従来どおり
 *    service_role 1回。新しい service_role 呼び出し箇所は増やさない）。
 *
 * 落とし穴:
 * - 週クエリの埋め込みは **`learning_phases!inner` が必須**。`!inner` を外すと埋め込み側の
 *   `is_published` / `is_deleted` フィルタは「phase が null になる」だけでトップレベルの週行が
 *   残り、未公開フェーズ配下の週が受講生のナビに混入する（実質的な公開範囲の拡大）。
 * - コンテンツ取得の `weekIds` には **`currentWeekId` を必ず union** する。週クエリ失敗時や、
 *   現在の週が通し列から外れるエッジ（未公開フェーズ配下など）でも現在の週のサマリーを取り、
 *   404 / ロック判定を現状と一致させる。union を外すとエッジで誤って404になる。
 *
 * 週クエリ失敗時は `console.error` のうえ週リストを空として続行する（ナビが消えるだけで、
 * ページ描画と404/ロック判定は `currentWeekContents` で死守する）。
 * コンテンツクエリ失敗時は `{ data: null, error }` を返す。
 *
 * コンテンツサマリーは `fetchContentSummariesByWeekIds()` 内で range ページングする
 * （`fetchThemeProgressSummaries()` と同じ方針）。ページングせずテーマ全体を
 * `display_order` 昇順のまま切ると、現在の週の行が欠落して `summary` 未検出の404になる。
 * 呼び出し箇所は従来どおり1つで、現行カタログでは1リクエストのまま終わる。
 */
export async function fetchThemeNavigationIndex(
  themeId: number,
  currentWeekId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: ThemeNavigationIndex | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let weekQuery = supabase
    .from("learning_weeks")
    .select(THEME_NAVIGATION_WEEK_COLUMNS)
    .eq("phase.theme_id", themeId)
    .eq("is_deleted", false)
    .eq("phase.is_deleted", false);

  weekQuery = applyPublishedFilterUnlessManager(weekQuery, userRole);
  if (!checkContentPermissions(userRole)) {
    weekQuery = weekQuery.eq("phase.is_published", true);
  }

  const { data: weekRows, error: weeksError } = await weekQuery;

  let weeks: NavigationWeek[] = [];
  if (weeksError) {
    console.error("テーマ内ナビ用週一覧取得エラー:", weeksError.message);
  } else {
    // `!inner` 埋め込みは生成型が配列になることがあるが、many-to-one の実行時値はオブジェクト。
    // どちらでも通し列を組み立てられるよう単一の phase に正規化する。
    weeks = (weekRows ?? []).map((row) => {
      const rawPhase = row.phase;
      const phase = Array.isArray(rawPhase) ? (rawPhase[0] ?? null) : rawPhase;
      return {
        id: row.id,
        name: row.name,
        display_order: row.display_order,
        phase: phase
          ? {
              id: phase.id,
              name: phase.name,
              display_order: phase.display_order,
            }
          : null,
      };
    });
  }

  const weekIds = [...new Set([...weeks.map((week) => week.id), currentWeekId])];
  const { data: contents, error: contentsError } = await fetchContentSummariesByWeekIds(
    weekIds,
    userRole
  );

  if (contentsError) {
    return { data: null, error: contentsError };
  }

  const summaries = contents ?? [];
  return {
    data: {
      orderedContents: buildThemeContentOrder(weeks, summaries),
      currentWeekContents: summaries.filter((content) => content.week_id === currentWeekId),
    },
    error: null,
  };
}

/**
 * フェーズに属する週一覧をコンテンツ付きで取得。
 * admin / maintainer は未公開の週・コンテンツもプレビューとして取得できる（issue #68）。
 * 週・コンテンツの並びは `compareGroupLevel`（display_order 同値は id タイブレーク）で、
 * コンテンツ詳細の前後ナビと同じ規則にする。
 */
export async function fetchWeeksWithContentsByPhaseId(
  phaseId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: (LearningWeek & { contents: ContentVisibilitySummary[] })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const query = applyPublishedFilterUnlessManager(
    supabase.from("learning_weeks").select("*").eq("phase_id", phaseId).eq("is_deleted", false),
    userRole
  );
  const { data: weeks, error } = await query.order("display_order").order("id");

  if (error) {
    console.error("週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  const weekList = [...(weeks ?? [])].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  const weekIds = weekList.map((week) => week.id);
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
  for (const list of contentsByWeekId.values()) {
    list.sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id));
  }

  const data = weekList.map((week) => ({
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
  data: LearningWeekWithBreadcrumb | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const query = applyPublishedFilterUnlessManager(
    supabase
      .from("learning_weeks")
      .select(LEARNING_WEEK_DETAIL_COLUMNS)
      .eq("id", weekId)
      .eq("is_deleted", false),
    userRole
  );
  const { data, error } = await query.single();

  if (error) {
    console.error("週詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningWeekWithBreadcrumb | null, error: null };
}

/**
 * 週に属する公開コンテンツ一覧を取得（本文・指示・ヒント等の重いカラムは除外）
 */
export async function fetchContentsByWeekId(weekId: number): Promise<{
  data: LearningContentListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select(LEARNING_CONTENT_LIST_COLUMNS)
    .eq("week_id", weekId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentListItem[] | null, error: null };
}

/**
 * コンテンツ詳細を取得（週・フェーズ・テーマ情報付き）。
 * admin / maintainer は未公開コンテンツもプレビューとして取得できる（issue #68）。
 */
export async function fetchContentById(
  contentId: number,
  userRole: UserRoleType | null = null
): Promise<{
  data: LearningContentWithBreadcrumb | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const query = applyPublishedFilterUnlessManager(
    supabase
      .from("learning_contents")
      .select(LEARNING_CONTENT_DETAIL_COLUMNS)
      .eq("id", contentId)
      .eq("is_deleted", false),
    userRole
  );
  // 0行（RLSで不可視・未存在・ロック済み並行取得など）は想定内のため maybeSingle。
  // .single() だと PGRST116 がエラーログになり、コンテンツ詳細ページの並列化で誤検知する。
  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("コンテンツ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentWithBreadcrumb | null, error: null };
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
