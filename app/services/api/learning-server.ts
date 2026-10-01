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
  BreadcrumbWeek,
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

/** Excludes heavy text columns (body, instructions, model answer, hints). */
export const LEARNING_CONTENT_LIST_COLUMNS =
  "id, week_id, title, content_type, video_url, pdf_url, is_open_to_trial, is_published, is_deleted, display_order, created_at, updated_at";

/** Parent-table columns for breadcrumbs / membership checks; the DETAIL constants compose these. */
export const BREADCRUMB_THEME_COLUMNS = "id, name, is_published, is_deleted";
export const BREADCRUMB_PHASE_COLUMNS = `id, theme_id, name, is_published, is_deleted, theme:learning_themes(${BREADCRUMB_THEME_COLUMNS})`;
export const BREADCRUMB_WEEK_COLUMNS = `id, phase_id, name, is_published, is_deleted, phase:learning_phases(${BREADCRUMB_PHASE_COLUMNS})`;

export const LEARNING_WEEK_DETAIL_COLUMNS = `*, phase:learning_phases(${BREADCRUMB_PHASE_COLUMNS})`;

export const LEARNING_CONTENT_DETAIL_COLUMNS = `*, week:learning_weeks(${BREADCRUMB_WEEK_COLUMNS})`;

/**
 * Unless admin / maintainer, restrict to is_published = true (issue #68 preview). Insert after
 * each fetcher's `.eq("is_deleted", false)`. theme/phase/week use select("*"), so PostgREST type
 * inference is shallow and the column constraint can be written directly.
 */
function applyPublishedFilterUnlessManager<
  Q extends { eq(column: "is_published", value: boolean): Q },
>(query: Q, userRole: UserRoleType | null): Q {
  return checkContentPermissions(userRole) ? query : query.eq("is_published", true);
}

/** admin / maintainer also get unpublished themes as preview (issue #68). */
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

export interface ThemeProgressSummary {
  theme: LearningTheme;
  totalContents: number;
  completedContents: number;
}

/** Theme row from a nested select (phase -> week -> content IDs). */
type ThemeWithNestedContents = LearningTheme & {
  phases: { id: number; weeks: { id: number; contents: { id: number }[] }[] }[];
};

/**
 * Fetches themes -> phases -> weeks -> contents in one nested select and queries the user's
 * completed progress in bulk (avoids N+1 per theme). A failed progress query returns completed
 * count 0 so the theme list still renders.
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

  // Fetch all completed content IDs for the user, without a content_id `.in()` filter: the
  // numerator is settled by per-theme Set matching, and serializing every content ID into the
  // query string would exceed URL length limits as the catalog grows. Page with range so
  // PostgREST's max rows (default 1000) does not drop rows.
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
      // Fall back to completed count 0 so the theme list is still shown.
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

/** admin / maintainer also get unpublished themes as preview (issue #68). */
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

/** admin / maintainer also get unpublished phases as preview (issue #68). */
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

/** admin / maintainer also get unpublished phases as preview (issue #68). */
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
 * Minimal content summary for the locked view (no body columns). Fetched with service_role so
 * titles of trial-locked contents are available. is_published drives the unpublished badge for
 * admin / maintainer preview.
 */
export type ContentVisibilitySummary = Pick<
  LearningContent,
  "id" | "title" | "content_type" | "display_order" | "is_open_to_trial" | "is_published"
> & { week_id: number };

/**
 * Shared lock decision for trial users (status='trial') on the course tree (phase page) and the
 * content detail page.
 */
export function isContentLockedForUser(
  userStatus: UserStatusType | null,
  isOpenToTrial: boolean
): boolean {
  return userStatus === USER_STATUS.TRIAL && !isOpenToTrial;
}

/**
 * Whether the content is visible to the given client (caller's auth context); used by the
 * progress / submission / AI review APIs (specification 4.1/5.1).
 * Checks `is_published = true AND is_deleted = false` for the content AND its week, phase and
 * theme. The learning_contents SELECT RLS allows admin / maintainer unconditionally, so checking
 * only the content row would let them record progress, submit, or request AI review for
 * soft-deleted contents or contents under unpublished parents. Returns false if any level is
 * unpublished or deleted, regardless of role (issue #68 default).
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
    // Stay fail-closed (treat as invisible) but let logs distinguish a DB failure from truly
    // invisible.
    console.error("コンテンツ可視性チェックエラー:", error.message);
  }

  return !!data;
}

/**
 * Whether the content and its week / phase / theme are all published and not deleted. Used in
 * admin / maintainer preview for the "unpublished" badge and for showing the complete button /
 * submission form (a published content under an unpublished or deleted parent counts as preview;
 * issue #68).
 * fetchContentById() does not filter parents' is_deleted (`.eq("is_deleted", false)` applies only
 * to the content), so check here explicitly. Otherwise the UI shows the complete button while
 * isContentVisible() always returns 403.
 */
export function isContentFullyPublished(content: LearningContentWithBreadcrumb): boolean {
  return content.is_published && isWeekHierarchyPublished(content.week);
}

/**
 * Whether week, phase and theme are all published and not deleted. Also false when RLS nulls an
 * embedded parent (unpublished for students).
 * On the content detail page, check this for member / trial users BEFORE the lock decision (issue
 * #242): the locked-view summary comes from the service_role path and only checks the content
 * row's is_published, so checking later would leak titles and breadcrumbs under an unpublished
 * theme.
 */
export function isWeekHierarchyPublished(week: BreadcrumbWeek | null | undefined): boolean {
  const phase = week?.phase;
  const theme = phase?.theme;

  return (
    week?.is_published === true &&
    week?.is_deleted === false &&
    phase?.is_published === true &&
    phase?.is_deleted === false &&
    theme?.is_published === true &&
    theme?.is_deleted === false
  );
}

/**
 * Column allowlist for the student-facing service_role path (invariant in AGENTS.md /
 * specification 2.6): only `id, title, content_type, display_order, is_open_to_trial, week_id`,
 * without `is_published`. Extending it would expose extra columns because service_role bypasses
 * RLS; keep it separate from the admin / maintainer path.
 */
const CONTENT_VISIBILITY_SUMMARY_COLUMNS =
  "id, title, content_type, display_order, is_open_to_trial, week_id";

/** PostgREST default per-request limit; page with range so truncation does not drop rows. */
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
 * Summaries (title, type, order, trial flag) of published contents for the given week IDs.
 * Uses service_role because RLS hides trial-closed contents from the normal client. Used for the
 * course-tree lock view and the content detail existence check (404 vs locked; specification
 * 2.6). service_role bypasses RLS, so is_published / is_deleted MUST be filtered and body columns
 * (text_content etc.) never selected. Select only CONTENT_VISIBILITY_SUMMARY_COLUMNS and fill
 * `is_published` with a constant `true` (paired with the `.eq("is_published", true)` below;
 * revisit both together).
 * Order is display_order then id (same tie-break as compareGroupLevel). Page with range past
 * PostgREST's 1000-row limit: otherwise cutting the whole theme by display_order can drop the
 * current week's rows and the detail page 404s with `summary` not found.
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
 * Summaries including unpublished ones via the normal client; admin / maintainer preview only
 * (issue #68). RLS (is_published = true OR admin/maintainer role) means only they actually get
 * unpublished rows.
 * No service_role here, so `is_published` (for the badge) may be selected; the service_role
 * allowlist does not apply. is_deleted must still be filtered because the admin / maintainer
 * SELECT RLS ignores it.
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
 * admin / maintainer read via the normal client including unpublished contents; everyone else
 * (member / trial) stays on the service_role path with published only, keeping the AGENTS.md
 * service_role conditions.
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
  /** Published contents of the theme that are not open to trial (and how many are exercises). */
  paidOnlyCount: number;
  paidOnlyExerciseCount: number;
}

/**
 * Returns the theme-wide ordered list and the current week's summaries for prev/next navigation
 * on the content detail page.
 * Two queries:
 * 1. Weeks + phases of the theme via the normal client (RLS). Never service_role.
 * 2. One call to fetchContentSummariesByWeekIds() (students: the existing single service_role
 *   call; do not add new service_role call sites).
 * Pitfalls:
 * - The week query must embed `learning_phases!inner`. Without `!inner`, the embedded
 *   is_published / is_deleted filters only null the phase while the top-level week row stays,
 *   leaking weeks under unpublished phases into student navigation (widens visibility).
 * - Always union `currentWeekId` into the content `weekIds`. If the week query fails or the
 *   current week drops out of the ordered list (e.g. under an unpublished phase), its summary is
 *   still fetched so 404 / lock decisions match current behavior; without the union the edge case
 *   wrongly 404s.
 * On week query failure, console.error and continue with an empty week list (only navigation
 * disappears; rendering and 404/lock decisions rely on currentWeekContents). On content query
 * failure return `{ data: null, error }`.
 * Content summaries are range-paged inside fetchContentSummariesByWeekIds() (like
 * fetchThemeProgressSummaries()); cutting the whole theme by display_order without paging would
 * drop the current week's rows and 404.
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
    // Generated types may make a `!inner` embed an array, but the runtime value for many-to-one
    // is an object; normalize to a single phase so both work.
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
  const orderedContents = buildThemeContentOrder(weeks, summaries);
  // Reuse the summaries already fetched for navigation so the lock screen adds no service_role
  // call; restrict to the ordered list so the current-week union doesn't count foreign weeks.
  const orderedIds = new Set(orderedContents.map((content) => content.id));
  const paidOnly = summaries.filter(
    (content) => orderedIds.has(content.id) && !content.is_open_to_trial
  );
  return {
    data: {
      orderedContents,
      currentWeekContents: summaries.filter((content) => content.week_id === currentWeekId),
      paidOnlyCount: paidOnly.length,
      paidOnlyExerciseCount: paidOnly.filter((content) => content.content_type === "exercise")
        .length,
    },
    error: null,
  };
}

/**
 * Weeks of a phase with contents. admin / maintainer also get unpublished weeks and contents
 * (issue #68). Weeks and contents are ordered by compareGroupLevel (id tie-break on equal
 * display_order), the same rule as prev/next navigation on the detail page.
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

/** admin / maintainer also get unpublished weeks as preview (issue #68). */
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

/** admin / maintainer also get unpublished contents as preview (issue #68). */
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
  // Zero rows is expected (invisible via RLS, missing, concurrent fetch while locked), hence
  // maybeSingle. .single() logs PGRST116 as an error, which would be a false alarm with the
  // parallelized detail page.
  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("コンテンツ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentWithBreadcrumb | null, error: null };
}

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
