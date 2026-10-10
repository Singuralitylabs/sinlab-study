import type { PostgrestError } from "@supabase/supabase-js";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { WEEKLY_FUNNEL_WEEKS } from "@/app/constants/analytics";
import { SLIDES_BUCKET } from "@/app/constants/storage";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import {
  getSiblingTailId,
  resolveSiblingRenumber,
  resolveSiblingResequence,
  type SiblingOrderRow,
} from "@/app/lib/content-grouping";
import { isQuizQuestionType, type QuizQuestionData } from "@/app/lib/quiz";
import { toSlideObjectKey } from "@/app/lib/slide-object-key";
import { WEEKLY_FUNNEL_FETCH_ERROR, type WeeklyFunnelRow } from "@/app/lib/weekly-funnel";
import {
  fetchStripeSubscriptionByUserId,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type {
  ContentSiblingCandidateRow,
  ContentType,
  LearningContent,
  LearningPhase,
  LearningTheme,
  LearningWeek,
  ManageContentListItem,
  ManagePhaseListItem,
  ManageThemeListItem,
  ManageUserListItem,
  ManageWeekListItem,
  MembershipType,
  UserType,
} from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

type SiblingTable = "learning_themes" | "learning_phases" | "learning_weeks" | "learning_contents";
type SiblingParentFilter = { column: "theme_id" | "phase_id" | "week_id"; value: number } | null;

type AdminSupabaseClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

const SLIDE_CLEANUP_CHUNK_SIZE = 100;

/**
 * Deletes orphaned PDFs from the `slides` bucket (issue #145).
 * learning_contents rows stay soft-deleted and only Storage objects are removed: hard-deleting
 * rows would cascade-delete user_progress / submissions / ai_reviews history.
 * Object keys (`<folder>/slide-NN.pdf`) are independent of content ID and several contents may
 * share one pdf_url, so always confirm no live reference (`is_deleted = false`) remains before
 * deleting.
 * A Storage failure does not fail the whole DB operation; it is reported via `storageRemoved`
 * (same precedent as thumbnail DELETE).
 * At most 2 round trips per SLIDE_CLEANUP_CHUNK_SIZE chunk (bulk-fetch live references, then
 * bulk-delete unreferenced keys; issue #246). Chunking keeps the PostgREST `in.(...)` query
 * string short for themes with many slides and localizes failures. A chunk whose reference lookup
 * fails is not deleted (to avoid removing a referenced key) and makes the overall result false;
 * other chunks continue.
 */
async function removeUnreferencedSlideObjects(
  supabase: AdminSupabaseClient,
  pdfUrls: (string | null | undefined)[]
): Promise<boolean> {
  const keys = [
    ...new Set(
      pdfUrls.map((url) => toSlideObjectKey(url)).filter((key): key is string => key !== null)
    ),
  ];
  let storageRemoved = true;
  for (let i = 0; i < keys.length; i += SLIDE_CLEANUP_CHUNK_SIZE) {
    const removed = await removeUnreferencedSlideObjectChunk(
      supabase,
      keys.slice(i, i + SLIDE_CLEANUP_CHUNK_SIZE)
    );
    storageRemoved &&= removed;
  }
  return storageRemoved;
}

/** One chunk of the orphan cleanup (`keys` are normalized and de-duplicated). */
async function removeUnreferencedSlideObjectChunk(
  supabase: AdminSupabaseClient,
  keys: string[]
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("learning_contents")
      .select("pdf_url")
      .in("pdf_url", keys)
      .eq("is_deleted", false);
    if (error) {
      console.error("スライド参照確認エラー:", error.message);
      return false;
    }
    // Keep keys still referenced by other live contents.
    const referencedKeys = new Set(
      ((data ?? []) as { pdf_url: string | null }[]).map((row) => row.pdf_url)
    );
    const unreferencedKeys = keys.filter((key) => !referencedKeys.has(key));
    if (unreferencedKeys.length === 0) {
      return true;
    }
    const { error: removeError } = await supabase.storage
      .from(SLIDES_BUCKET)
      .remove(unreferencedKeys);
    if (removeError) {
      console.error("スライド削除エラー:", removeError.message);
      return false;
    }
    return true;
  } catch (cleanupError) {
    console.error("スライド削除エラー:", cleanupError);
    return false;
  }
}

/** Includes soft-deleted rows. Returns null on fetch failure. */
async function fetchPdfUrlsByContentIds(
  supabase: AdminSupabaseClient,
  ids: number[]
): Promise<string[] | null> {
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase.from("learning_contents").select("pdf_url").in("id", ids);
  if (error) {
    console.error("スライド参照取得エラー:", error.message);
    return null;
  }
  const rows = (data ?? []) as { pdf_url: string | null }[];
  return rows.map((row) => row.pdf_url).filter((url): url is string => url !== null);
}

/** Live contents only. Returns null on fetch failure. */
async function fetchPdfUrlsByWeekIds(
  supabase: AdminSupabaseClient,
  weekIds: number[]
): Promise<string[] | null> {
  if (weekIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("learning_contents")
    .select("pdf_url")
    .in("week_id", weekIds)
    .eq("is_deleted", false);
  if (error) {
    console.error("スライド参照取得エラー:", error.message);
    return null;
  }
  const rows = (data ?? []) as { pdf_url: string | null }[];
  return rows.map((row) => row.pdf_url).filter((url): url is string => url !== null);
}

/**
 * Nested select is the minimum needed for the list and hierarchy sort. With a theme/phase filter
 * the nesting must be `!inner`: PostgREST embedded filters only drop parent rows with an inner
 * join, which excludes unclassified contents (no week).
 */
function manageContentListSelect(innerJoin: boolean): string {
  const weekRel = innerJoin ? "week:learning_weeks!inner" : "week:learning_weeks";
  const phaseRel = innerJoin ? "phase:learning_phases!inner" : "phase:learning_phases";
  const themeRel = innerJoin ? "theme:learning_themes!inner" : "theme:learning_themes";
  return `
    id, title, content_type, display_order, is_published, is_open_to_trial, week_id,
    ${weekRel}(
      id, name, display_order, phase_id,
      ${phaseRel}(
        id, name, display_order, theme_id,
        ${themeRel}(id, name, display_order)
      )
    )
  `
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a URL query ID strictly as an integer. Avoids conversions like Number("01") -> 1 or
 * Number("2.0") -> 2 that disagree with the old JS string comparison; invalid values yield
 * undefined.
 */
export function parseStrictFilterId(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value) {
    return undefined;
  }
  return parsed;
}

const MANAGE_THEME_LIST_SELECT = "id, name, description, image_url, display_order, is_published";

const MANAGE_PHASE_LIST_SELECT = `
  id, name, description, display_order, is_published, theme_id,
  theme:learning_themes(id, name, display_order)
`
  .replace(/\s+/g, " ")
  .trim();

const MANAGE_WEEK_LIST_SELECT = `
  id, name, display_order, is_published, phase_id,
  phase:learning_phases(
    id, name, display_order, theme_id,
    theme:learning_themes(id, name, display_order)
  )
`
  .replace(/\s+/g, " ")
  .trim();

const CONTENT_SIBLING_CANDIDATE_SELECT = "id, title, display_order, is_published, week_id";

const MANAGE_USER_LIST_SELECT =
  "id, display_name, email, role, status, membership_type, created_at, email_opt_out_at";

/** Structural filters for /manage/contents. The title search `q` is not included (done in JS). */
export interface FetchContentsFilters {
  themeId?: string;
  phaseId?: string;
  weekId?: string;
  contentType?: ContentType;
}

/**
 * Siblings under the same parent, not deleted (excluding `excludeId` when given). Common starting
 * point for the createXxx / updateXxx resequencing.
 */
async function fetchSiblings(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: SiblingTable,
  parentFilter: SiblingParentFilter,
  excludeId?: number
): Promise<{ data: SiblingOrderRow[] | null; error: PostgrestError | null }> {
  let query = supabase.from(table).select("id, display_order").eq("is_deleted", false);
  if (parentFilter) {
    query = query.eq(parentFilter.column, parentFilter.value);
  }
  if (excludeId !== undefined) {
    query = query.neq("id", excludeId);
  }
  return query;
}

/**
 * Bulk-UPDATEs only rows whose display_order changed through an RPC (no-op when empty): one RPC
 * regardless of sibling count instead of N round trips (#196). It is an UPDATE-only RPC rather
 * than upsert, so it is not treated as an INSERT and the `updated_at` trigger fires normally.
 */
async function applySiblingUpdates(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: SiblingTable,
  updates: SiblingOrderRow[]
): Promise<PostgrestError | null> {
  if (updates.length === 0) {
    return null;
  }
  const { error } = await supabase.rpc("bulk_update_sibling_display_order", {
    p_table: table,
    p_updates: updates,
  });
  return error;
}

/**
 * Shared insert-position resequencing for createTheme / createPhase / createWeek / createContent
 * (SELECT siblings, resolveSiblingResequence, UPDATE changed rows). `parentFilter` is null only
 * for themes (no parent).
 * Callers must check the returned `error` is null before using `displayOrder` in the INSERT.
 * InvalidInsertAfterIdError from resolveSiblingResequence propagates when `insertAfterId` is not
 * a live sibling under the same parent.
 */
async function resequenceSiblingsForInsert(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: SiblingTable,
  parentFilter: SiblingParentFilter,
  insertAfterId: number | null
): Promise<{ displayOrder: number; error: null } | { displayOrder: null; error: PostgrestError }> {
  const { data: siblings, error: siblingsError } = await fetchSiblings(
    supabase,
    table,
    parentFilter
  );
  if (siblingsError) {
    return { displayOrder: null, error: siblingsError };
  }

  const { displayOrder, updates } = resolveSiblingResequence(siblings ?? [], insertAfterId);

  const updateError = await applySiblingUpdates(supabase, table, updates);
  if (updateError) {
    return { displayOrder: null, error: updateError };
  }

  return { displayOrder, error: null };
}

/**
 * Shared resequencing for updateTheme / updatePhase / updateWeek / updateContent (issue #189);
 * covers only the destination parent.
 * The caller must call renumberSourceSiblingsAfterMove AFTER the main UPDATE (parent change)
 * succeeds. Compacting the source first would, if the main UPDATE then fails, leave the item
 * itself and the compacted siblings with duplicate display_order and reorder existing siblings.
 * Compacting afterwards leaves only gaps on failure and preserves order.
 * - `insertAfterId` omitted and parent unchanged (`parentChanged: false`): no-op, returns
 *   `displayOrder: undefined` (caller must not update display_order).
 * - Otherwise resequence the destination siblings excluding the item itself (same
 *   resolveSiblingResequence as inserts; passing the item's own ID as `insertAfterId` therefore
 *   raises InvalidInsertAfterIdError). If `insertAfterId` is omitted and the parent changed,
 *   default to the destination tail (getSiblingTailId).
 */
async function resequenceDestinationForUpdate(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: SiblingTable,
  selfId: number,
  destinationParentFilter: SiblingParentFilter,
  parentChanged: boolean,
  insertAfterId: number | null | undefined
): Promise<{ displayOrder: number | undefined; error: PostgrestError | null }> {
  if (insertAfterId === undefined && !parentChanged) {
    return { displayOrder: undefined, error: null };
  }

  const { data: destinationSiblings, error: destinationError } = await fetchSiblings(
    supabase,
    table,
    destinationParentFilter,
    selfId
  );
  if (destinationError) {
    return { displayOrder: undefined, error: destinationError };
  }

  const effectiveInsertAfterId =
    insertAfterId !== undefined ? insertAfterId : getSiblingTailId(destinationSiblings ?? []);

  const { displayOrder, updates } = resolveSiblingResequence(
    destinationSiblings ?? [],
    effectiveInsertAfterId
  );
  const destinationUpdateError = await applySiblingUpdates(supabase, table, updates);
  if (destinationUpdateError) {
    return { displayOrder: undefined, error: destinationUpdateError };
  }

  return { displayOrder, error: null };
}

/**
 * After a parent change, compacts gaps among the siblings left in the source parent into 1..N
 * (the item itself has already left). Call only AFTER the main UPDATE succeeds (see
 * resequenceDestinationForUpdate).
 */
async function renumberSourceSiblingsAfterMove(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: SiblingTable,
  selfId: number,
  sourceParentFilter: SiblingParentFilter
): Promise<PostgrestError | null> {
  const { data: sourceSiblings, error: sourceError } = await fetchSiblings(
    supabase,
    table,
    sourceParentFilter,
    selfId
  );
  if (sourceError) {
    return sourceError;
  }
  return applySiblingUpdates(supabase, table, resolveSiblingRenumber(sourceSiblings ?? []));
}

export async function fetchAllThemes(): Promise<{
  data: ManageThemeListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_themes")
    .select(MANAGE_THEME_LIST_SELECT)
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

/**
 * `insertAfterId` (null = first, number = right after that theme) determines display_order
 * server-side; all themes (no parent) are renumbered from 1 before the INSERT (see
 * resolveSiblingResequence). Throws InvalidInsertAfterIdError if it is not a live theme (the API
 * route must map it to 400).
 */
export async function createTheme(theme: {
  name: string;
  description?: string | null;
  insertAfterId: number | null;
  is_published?: boolean;
  image_url?: string | null;
}): Promise<{ data: LearningTheme | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const resequenced = await resequenceSiblingsForInsert(
    supabase,
    "learning_themes",
    null,
    theme.insertAfterId
  );
  if (resequenced.error) {
    console.error("テーマ作成エラー（再採番）:", resequenced.error.message);
    return { data: null, error: resequenced.error };
  }
  const { displayOrder } = resequenced;

  const { data, error } = await supabase
    .from("learning_themes")
    .insert({
      name: theme.name,
      description: theme.description,
      is_published: theme.is_published,
      image_url: theme.image_url,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("テーマ作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * `insertAfterId` omitted means display order is unchanged. When given, all other themes are
 * renumbered via resequenceDestinationForUpdate (themes have no parent, so no parent-change
 * branch).
 */
export async function updateTheme(
  id: number,
  theme: Partial<LearningTheme> & { insertAfterId?: number | null }
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { insertAfterId, ...patch } = theme;

  const resequenced = await resequenceDestinationForUpdate(
    supabase,
    "learning_themes",
    id,
    null,
    false,
    insertAfterId
  );
  if (resequenced.error) {
    console.error("テーマ更新エラー（再採番）:", resequenced.error.message);
    return { error: resequenced.error };
  }

  const updatePayload =
    resequenced.displayOrder !== undefined
      ? { ...patch, display_order: resequenced.displayOrder }
      : patch;

  const { error } = await supabase.from("learning_themes").update(updatePayload).eq("id", id);

  if (error) {
    console.error("テーマ更新エラー:", error.message);
    return { error };
  }

  return { error: null };
}

export async function deleteTheme(
  id: number
): Promise<{ error: PostgrestError | null; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();
  let storageRemoved = true;
  // pdf_urls of all contents under the theme (Storage cleanup targets). Stays null on fetch
  // failure so the final Storage cleanup is skipped and storageRemoved: false is reported.
  let targetPdfUrls: string[] | null = null;

  const { data: phases, error: phaseFetchError } = await supabase
    .from("learning_phases")
    .select("id")
    .eq("theme_id", id)
    .eq("is_deleted", false);
  if (phaseFetchError) {
    console.error("フェーズ取得エラー:", phaseFetchError.message);
    return { error: phaseFetchError, storageRemoved };
  }

  const phaseIds = phases?.map((p) => p.id) ?? [];

  if (phaseIds.length > 0) {
    const { data: weeks, error: weekFetchError } = await supabase
      .from("learning_weeks")
      .select("id")
      .in("phase_id", phaseIds)
      .eq("is_deleted", false);
    if (weekFetchError) {
      console.error("週取得エラー:", weekFetchError.message);
      return { error: weekFetchError, storageRemoved };
    }

    const weekIds = weeks?.map((w) => w.id) ?? [];

    // Fetch pdf_urls before the soft delete. On failure the targets are unknown, so skip Storage
    // cleanup and report storageRemoved: false (never treat as success).
    targetPdfUrls = await fetchPdfUrlsByWeekIds(supabase, weekIds);
    if (targetPdfUrls === null) {
      storageRemoved = false;
    }

    if (weekIds.length > 0) {
      const { error: contentError } = await supabase
        .from("learning_contents")
        .update({ is_deleted: true })
        .in("week_id", weekIds)
        .eq("is_deleted", false);
      if (contentError) {
        console.error("コンテンツ削除エラー:", contentError.message);
        return { error: contentError, storageRemoved };
      }
    }

    const { error: weekError } = await supabase
      .from("learning_weeks")
      .update({ is_deleted: true })
      .in("phase_id", phaseIds)
      .eq("is_deleted", false);
    if (weekError) {
      console.error("週削除エラー:", weekError.message);
      return { error: weekError, storageRemoved };
    }

    const { error: phaseError } = await supabase
      .from("learning_phases")
      .update({ is_deleted: true })
      .eq("theme_id", id)
      .eq("is_deleted", false);
    if (phaseError) {
      console.error("フェーズ削除エラー:", phaseError.message);
      return { error: phaseError, storageRemoved };
    }
  }

  const { error } = await supabase
    .from("learning_themes")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("テーマ削除エラー:", error.message);
    return { error, storageRemoved };
  }

  // Remove unreferenced Storage objects only after every DB write succeeded, so a later failure
  // cannot leave "DB failed but PDF gone". Rows stay soft-deleted.
  if (targetPdfUrls !== null && targetPdfUrls.length > 0) {
    storageRemoved = await removeUnreferencedSlideObjects(supabase, targetPdfUrls);
  }

  return { error: null, storageRemoved };
}

/**
 * Sorted by the phase's own display_order. Callers needing theme -> phase hierarchy order
 * (/manage/phases) must pass the result through sortPhasesByHierarchy.
 */
export async function fetchAllPhases(): Promise<{
  data: ManagePhaseListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_phases")
    .select(MANAGE_PHASE_LIST_SELECT)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("フェーズ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as unknown as ManagePhaseListItem[], error: null };
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

/**
 * Same approach as createTheme, renumbering siblings under the same theme_id (see
 * resolveSiblingResequence).
 */
export async function createPhase(phase: {
  theme_id: number;
  name: string;
  description?: string | null;
  insertAfterId: number | null;
  is_published?: boolean;
}): Promise<{ data: LearningPhase | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const resequenced = await resequenceSiblingsForInsert(
    supabase,
    "learning_phases",
    { column: "theme_id", value: phase.theme_id },
    phase.insertAfterId
  );
  if (resequenced.error) {
    console.error("フェーズ作成エラー（再採番）:", resequenced.error.message);
    return { data: null, error: resequenced.error };
  }
  const { displayOrder } = resequenced;

  const { data, error } = await supabase
    .from("learning_phases")
    .insert({
      theme_id: phase.theme_id,
      name: phase.name,
      description: phase.description,
      is_published: phase.is_published,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("フェーズ作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * If `insertAfterId` is omitted and theme_id is unchanged, display order is untouched. Otherwise
 * renumber the destination (new theme_id) first, run the main UPDATE, and after it succeeds
 * renumber the source parent if the parent changed (order rationale:
 * resequenceDestinationForUpdate).
 */
export async function updatePhase(
  id: number,
  phase: Partial<LearningPhase> & { insertAfterId?: number | null }
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { insertAfterId, ...patch } = phase;

  let destinationFilter: SiblingParentFilter = null;
  let sourceFilter: SiblingParentFilter = null;
  let parentChanged = false;

  if (insertAfterId !== undefined || patch.theme_id !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from("learning_phases")
      .select("theme_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();
    if (currentError) {
      console.error("フェーズ更新エラー（現在値取得）:", currentError.message);
      return { error: currentError };
    }
    const destinationThemeId = patch.theme_id ?? current.theme_id;
    parentChanged = destinationThemeId !== current.theme_id;
    destinationFilter = { column: "theme_id", value: destinationThemeId };
    sourceFilter = { column: "theme_id", value: current.theme_id };
  }

  const resequenced = await resequenceDestinationForUpdate(
    supabase,
    "learning_phases",
    id,
    destinationFilter,
    parentChanged,
    insertAfterId
  );
  if (resequenced.error) {
    console.error("フェーズ更新エラー（再採番）:", resequenced.error.message);
    return { error: resequenced.error };
  }

  const updatePayload =
    resequenced.displayOrder !== undefined
      ? { ...patch, display_order: resequenced.displayOrder }
      : patch;

  const { error } = await supabase.from("learning_phases").update(updatePayload).eq("id", id);

  if (error) {
    console.error("フェーズ更新エラー:", error.message);
    return { error };
  }

  if (parentChanged) {
    const sourceError = await renumberSourceSiblingsAfterMove(
      supabase,
      "learning_phases",
      id,
      sourceFilter
    );
    if (sourceError) {
      console.error("フェーズ更新エラー（移動元の再採番）:", sourceError.message);
      return { error: sourceError };
    }
  }

  return { error: null };
}

export async function deletePhase(
  id: number
): Promise<{ error: PostgrestError | null; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data: weeks, error: weekFetchError } = await supabase
    .from("learning_weeks")
    .select("id")
    .eq("phase_id", id)
    .eq("is_deleted", false);
  if (weekFetchError) {
    console.error("週取得エラー:", weekFetchError.message);
    return { error: weekFetchError, storageRemoved: true };
  }

  const weekIds = weeks?.map((w) => w.id) ?? [];

  // Fetch pdf_urls before the soft delete; on failure report storageRemoved: false (never treat
  // as success).
  const targetPdfUrls = await fetchPdfUrlsByWeekIds(supabase, weekIds);
  let storageRemoved = targetPdfUrls !== null;

  if (weekIds.length > 0) {
    const { error: contentError } = await supabase
      .from("learning_contents")
      .update({ is_deleted: true })
      .in("week_id", weekIds)
      .eq("is_deleted", false);
    if (contentError) {
      console.error("コンテンツ削除エラー:", contentError.message);
      return { error: contentError, storageRemoved };
    }

    const { error: weekError } = await supabase
      .from("learning_weeks")
      .update({ is_deleted: true })
      .eq("phase_id", id)
      .eq("is_deleted", false);
    if (weekError) {
      console.error("週削除エラー:", weekError.message);
      return { error: weekError, storageRemoved };
    }
  }

  const { error } = await supabase
    .from("learning_phases")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("フェーズ削除エラー:", error.message);
    return { error, storageRemoved };
  }

  // Remove unreferenced Storage objects only after all DB writes succeed.
  if (targetPdfUrls !== null && targetPdfUrls.length > 0) {
    storageRemoved = await removeUnreferencedSlideObjects(supabase, targetPdfUrls);
  }

  return { error: null, storageRemoved };
}

/**
 * Sorted by the week's own display_order. Callers needing theme -> phase -> week hierarchy order
 * (/manage/weeks list, ContentForm options) must pass the result through sortWeeksByHierarchy.
 */
export async function fetchAllWeeks(): Promise<{
  data: ManageWeekListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select(MANAGE_WEEK_LIST_SELECT)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as unknown as ManageWeekListItem[], error: null };
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

/**
 * Same approach as createTheme, renumbering siblings under the same phase_id (see
 * resolveSiblingResequence).
 */
export async function createWeek(week: {
  phase_id: number;
  name: string;
  description?: string | null;
  insertAfterId: number | null;
  is_published?: boolean;
}): Promise<{ data: LearningWeek | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const resequenced = await resequenceSiblingsForInsert(
    supabase,
    "learning_weeks",
    { column: "phase_id", value: week.phase_id },
    week.insertAfterId
  );
  if (resequenced.error) {
    console.error("週作成エラー（再採番）:", resequenced.error.message);
    return { data: null, error: resequenced.error };
  }
  const { displayOrder } = resequenced;

  const { data, error } = await supabase
    .from("learning_weeks")
    .insert({
      phase_id: week.phase_id,
      name: week.name,
      description: week.description,
      is_published: week.is_published,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("週作成エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Same approach as updatePhase: display order is untouched if `insertAfterId` is omitted and
 * phase_id is unchanged; otherwise renumber the destination first and the source only after the
 * main UPDATE succeeds (see resequenceDestinationForUpdate).
 */
export async function updateWeek(
  id: number,
  week: Partial<LearningWeek> & { insertAfterId?: number | null }
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { insertAfterId, ...patch } = week;

  let destinationFilter: SiblingParentFilter = null;
  let sourceFilter: SiblingParentFilter = null;
  let parentChanged = false;

  if (insertAfterId !== undefined || patch.phase_id !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from("learning_weeks")
      .select("phase_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();
    if (currentError) {
      console.error("週更新エラー（現在値取得）:", currentError.message);
      return { error: currentError };
    }
    const destinationPhaseId = patch.phase_id ?? current.phase_id;
    parentChanged = destinationPhaseId !== current.phase_id;
    destinationFilter = { column: "phase_id", value: destinationPhaseId };
    sourceFilter = { column: "phase_id", value: current.phase_id };
  }

  const resequenced = await resequenceDestinationForUpdate(
    supabase,
    "learning_weeks",
    id,
    destinationFilter,
    parentChanged,
    insertAfterId
  );
  if (resequenced.error) {
    console.error("週更新エラー（再採番）:", resequenced.error.message);
    return { error: resequenced.error };
  }

  const updatePayload =
    resequenced.displayOrder !== undefined
      ? { ...patch, display_order: resequenced.displayOrder }
      : patch;

  const { error } = await supabase.from("learning_weeks").update(updatePayload).eq("id", id);

  if (error) {
    console.error("週更新エラー:", error.message);
    return { error };
  }

  if (parentChanged) {
    const sourceError = await renumberSourceSiblingsAfterMove(
      supabase,
      "learning_weeks",
      id,
      sourceFilter
    );
    if (sourceError) {
      console.error("週更新エラー（移動元の再採番）:", sourceError.message);
      return { error: sourceError };
    }
  }

  return { error: null };
}

export async function deleteWeek(
  id: number
): Promise<{ error: PostgrestError | null; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();

  // Fetch pdf_urls before the soft delete; on failure report storageRemoved: false (never treat
  // as success).
  const targetPdfUrls = await fetchPdfUrlsByWeekIds(supabase, [id]);
  let storageRemoved = targetPdfUrls !== null;

  const { error: contentError } = await supabase
    .from("learning_contents")
    .update({ is_deleted: true })
    .eq("week_id", id)
    .eq("is_deleted", false);
  if (contentError) {
    console.error("コンテンツ削除エラー:", contentError.message);
    return { error: contentError, storageRemoved };
  }

  const { error } = await supabase.from("learning_weeks").update({ is_deleted: true }).eq("id", id);
  if (error) {
    console.error("週削除エラー:", error.message);
    return { error, storageRemoved };
  }

  // Remove unreferenced Storage objects only after all DB writes succeed.
  if (targetPdfUrls !== null && targetPdfUrls.length > 0) {
    storageRemoved = await removeUnreferencedSlideObjects(supabase, targetPdfUrls);
  }

  return { error: null, storageRemoved };
}

/**
 * Management list (#196); body columns are excluded. Theme/phase/week/type filters run in SQL;
 * the title search stays in the caller's JS.
 */
export async function fetchAllContents(filters: FetchContentsFilters = {}): Promise<{
  data: ManageContentListItem[] | null;
  error: PostgrestError | null;
}> {
  const themeId = parseStrictFilterId(filters.themeId);
  const phaseId = parseStrictFilterId(filters.phaseId);
  const weekId = parseStrictFilterId(filters.weekId);

  // An integer-invalid query string yields "no match" instead of a PostgREST 400 (same as the old
  // JS string comparison, which never matched such input).
  if (
    (filters.themeId && themeId === undefined) ||
    (filters.phaseId && phaseId === undefined) ||
    (filters.weekId && weekId === undefined)
  ) {
    return { data: [], error: null };
  }

  const supabase = await createServerSupabaseClient();
  const needsInnerJoin = themeId !== undefined || phaseId !== undefined;

  let query = supabase
    .from("learning_contents")
    .select(manageContentListSelect(needsInnerJoin))
    .eq("is_deleted", false);

  if (weekId !== undefined) {
    query = query.eq("week_id", weekId);
  }
  if (filters.contentType) {
    query = query.eq("content_type", filters.contentType);
  }
  if (themeId !== undefined) {
    query = query.eq("week.phase.theme_id", themeId);
  }
  if (phaseId !== undefined) {
    query = query.eq("week.phase_id", phaseId);
  }

  const { data, error } = await query.order("display_order");

  if (error) {
    console.error("コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  // This cast depends on the select returning the nested shape down to the theme
  // (week.phase.theme). If you change the select, keep week.phase.theme, which the hierarchy sort
  // in content-grouping.ts reads.
  return { data: data as unknown as ManageContentListItem[], error: null };
}

/**
 * Whether at least one non-deleted content exists (head count). Filter options come from the week
 * list, so this is only for the empty-state check (#196 review).
 */
export async function hasAnyManageContents(): Promise<{
  data: boolean | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("learning_contents")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false);

  if (error) {
    console.error("コンテンツ件数取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: (count ?? 0) > 0, error: null };
}

/**
 * Sibling candidates for the insert-position picker in the content form (#196). No body or
 * 4-level nesting; filterable by `week_id`. Without `weekId` all weeks are returned and the form
 * filters when the week changes.
 */
export async function fetchContentSiblingCandidates(weekId?: number): Promise<{
  data: ContentSiblingCandidateRow[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("learning_contents")
    .select(CONTENT_SIBLING_CANDIDATE_SELECT)
    .eq("is_deleted", false);

  if (weekId !== undefined) {
    query = query.eq("week_id", weekId);
  }

  const { data, error } = await query.order("display_order");

  if (error) {
    console.error("コンテンツ兄弟候補取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
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

/**
 * Same approach as createTheme, renumbering siblings under the same week_id (see
 * resolveSiblingResequence).
 * Unlike the other three, sibling fetch/renumber uses createAdminSupabaseClient() because
 * createContent already used service_role. The AGENTS.md service_role restriction covers
 * student-facing delivery paths, not this admin-only create path.
 */
export async function createContent(content: {
  week_id: number;
  title: string;
  content_type: ContentType;
  video_url?: string | null;
  text_content?: string | null;
  description?: string | null;
  exercise_instructions?: string | null;
  hint?: string | null;
  reference_answer?: string | null;
  allowed_submission_types?: "code" | "url" | "both";
  code_language?: CodeLanguage;
  pdf_url?: string | null;
  insertAfterId: number | null;
  is_published?: boolean;
  is_open_to_trial?: boolean;
  quizQuestions?: QuizQuestionData[];
}): Promise<{ data: LearningContent | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();

  const resequenced = await resequenceSiblingsForInsert(
    supabase,
    "learning_contents",
    { column: "week_id", value: content.week_id },
    content.insertAfterId
  );
  if (resequenced.error) {
    console.error("コンテンツ作成エラー（再採番）:", resequenced.error.message);
    return { data: null, error: resequenced.error };
  }
  const { displayOrder } = resequenced;

  const { data, error } = await supabase
    .from("learning_contents")
    .insert({
      week_id: content.week_id,
      title: content.title,
      content_type: content.content_type,
      video_url: content.video_url,
      text_content: content.text_content,
      description: content.description,
      exercise_instructions: content.exercise_instructions,
      hint: content.hint,
      reference_answer: content.reference_answer,
      allowed_submission_types: content.allowed_submission_types,
      code_language: content.code_language,
      pdf_url: content.pdf_url,
      is_published: content.is_published,
      is_open_to_trial: content.is_open_to_trial,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("コンテンツ作成エラー:", error.message);
    return { data: null, error };
  }

  if (content.content_type === "quiz" && content.quizQuestions) {
    const quizError = await replaceQuizQuestions(supabase, data.id, content.quizQuestions);
    if (quizError) {
      // Leaving the row would publish a quiz with no questions; soft-delete it like the delete API.
      const { error: rollbackError } = await supabase
        .from("learning_contents")
        .update({ is_deleted: true })
        .eq("id", data.id);
      if (rollbackError) {
        console.error("コンテンツ作成エラー（設問保存失敗後の取り消し）:", rollbackError.message);
      }
      return { data: null, error: quizError };
    }
  }

  return { data, error: null };
}

/**
 * Replaces all questions of a quiz in one transaction (replace_quiz_questions RPC), so a failure
 * never leaves a partial set. Order follows the array.
 */
async function replaceQuizQuestions(
  supabase: AdminSupabaseClient,
  contentId: number,
  questions: QuizQuestionData[]
): Promise<PostgrestError | null> {
  const { error } = await supabase.rpc("replace_quiz_questions", {
    p_content_id: contentId,
    p_questions: questions,
  });
  if (error) {
    console.error("クイズ設問の保存エラー:", error.message);
  }
  return error;
}

/** Questions including answers, for the admin edit form only (service_role). */
export async function fetchQuizQuestionsForAdmin(
  contentId: number
): Promise<{ data: QuizQuestionData[] | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("question_type, question, choices, correct_choices, model_answer, explanation, hint")
    .eq("content_id", contentId)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("クイズ設問の取得エラー:", error.message);
    return { data: null, error };
  }

  return {
    data: data
      .filter((row) => isQuizQuestionType(row.question_type))
      .map((row) => ({
        ...row,
        question_type: row.question_type as QuizQuestionData["question_type"],
      })),
    error: null,
  };
}

/**
 * Same approach as updatePhase: display order is untouched if `insertAfterId` is omitted and
 * week_id is unchanged; otherwise renumber the destination first and the source only after the
 * main UPDATE succeeds (see resequenceDestinationForUpdate). Uses createAdminSupabaseClient() for
 * sibling work for the same reason as createContent.
 */
export async function updateContent(
  id: number,
  content: Partial<LearningContent> & {
    insertAfterId?: number | null;
    quizQuestions?: QuizQuestionData[];
  }
): Promise<{ error: PostgrestError | null; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();
  const { insertAfterId, quizQuestions, ...patch } = content;

  // Questions first: if they fail, the row is not switched to a quiz with stale or no questions.
  if (patch.content_type === "quiz" && quizQuestions) {
    const quizError = await replaceQuizQuestions(supabase, id, quizQuestions);
    if (quizError) {
      return { error: quizError, storageRemoved: true };
    }
  }

  let destinationFilter: SiblingParentFilter = null;
  let sourceFilter: SiblingParentFilter = null;
  let parentChanged = false;

  // The pre-update values needed for the move decision (week_id) and for deleting the old object
  // when pdf_url changes are fetched in one SELECT (issue #246). If it was fetched only for
  // pdf_url, a failure does not abort the update: continue with the old key unknown and report
  // storageRemoved: false (same as deleteContent).
  const needsCurrentWeek = insertAfterId !== undefined || patch.week_id !== undefined;
  const needsCurrentPdf = patch.pdf_url !== undefined;
  let previousPdfUrl: string | null = null;
  let pdfFetchFailed = false;
  if (needsCurrentWeek || needsCurrentPdf) {
    const { data: current, error: currentError } = await supabase
      .from("learning_contents")
      .select("week_id, pdf_url")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();
    if (currentError) {
      console.error("コンテンツ更新エラー（現在値取得）:", currentError.message);
      if (needsCurrentWeek) {
        return { error: currentError, storageRemoved: true };
      }
      pdfFetchFailed = true;
    } else {
      previousPdfUrl = current.pdf_url;
      if (needsCurrentWeek) {
        const destinationWeekId = patch.week_id ?? current.week_id;
        parentChanged = destinationWeekId !== current.week_id;
        destinationFilter = { column: "week_id", value: destinationWeekId };
        sourceFilter = { column: "week_id", value: current.week_id };
      }
    }
  }

  const resequenced = await resequenceDestinationForUpdate(
    supabase,
    "learning_contents",
    id,
    destinationFilter,
    parentChanged,
    insertAfterId
  );
  if (resequenced.error) {
    console.error("コンテンツ更新エラー（再採番）:", resequenced.error.message);
    return { error: resequenced.error, storageRemoved: true };
  }

  const updatePayload =
    resequenced.displayOrder !== undefined
      ? { ...patch, display_order: resequenced.displayOrder }
      : patch;

  const { error } = await supabase.from("learning_contents").update(updatePayload).eq("id", id);

  if (error) {
    console.error("コンテンツ更新エラー:", error.message);
    return { error, storageRemoved: true };
  }

  if (parentChanged) {
    const sourceError = await renumberSourceSiblingsAfterMove(
      supabase,
      "learning_contents",
      id,
      sourceFilter
    );
    if (sourceError) {
      console.error("コンテンツ更新エラー（移動元の再採番）:", sourceError.message);
      return { error: sourceError, storageRemoved: true };
    }
  }

  // Delete the old object (if unreferenced elsewhere) only when the normalized pdf_url key
  // actually changed. PUT always sends pdf_url (null for non-slides), so updates that keep the
  // same key (title edits, overwriting the same folder/number) must not delete anything. If the
  // pre-fetch failed the old key is unknown, so skip deletion and report false.
  let storageRemoved = true;
  if (needsCurrentPdf) {
    if (pdfFetchFailed) {
      storageRemoved = false;
    } else {
      const previousKey = toSlideObjectKey(previousPdfUrl);
      const nextKey = toSlideObjectKey(patch.pdf_url ?? null);
      if (previousKey !== null && previousKey !== nextKey) {
        storageRemoved = await removeUnreferencedSlideObjects(supabase, [previousKey]);
      }
    }
  }

  return { error: null, storageRemoved };
}

/**
 * Applies one update to many contents. `.eq("is_deleted", false)` prevents re-operating on
 * deleted rows.
 * For bulk `is_deleted: true`, unreferenced Storage objects are removed after the rows are
 * soft-deleted (issue #145).
 */
export async function bulkUpdateContents(
  ids: number[],
  patch: Partial<LearningContent>
): Promise<{ error: PostgrestError | null; updated: number; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const isBulkDelete = patch.is_deleted === true;
  // On fetch failure (null) the targets are unknown, so report storageRemoved: false.
  const targetPdfUrls = isBulkDelete ? await fetchPdfUrlsByContentIds(supabase, ids) : [];
  let storageRemoved = targetPdfUrls !== null;

  const { data, error } = await supabase
    .from("learning_contents")
    .update(patch)
    .in("id", ids)
    .eq("is_deleted", false)
    .select("id");

  if (error) {
    console.error("コンテンツ一括更新エラー:", error.message);
    return { error, updated: 0, storageRemoved };
  }

  const updated = data?.length ?? 0;
  if (isBulkDelete && targetPdfUrls !== null && targetPdfUrls.length > 0) {
    storageRemoved = await removeUnreferencedSlideObjects(supabase, targetPdfUrls);
  }

  return { error: null, updated, storageRemoved };
}

export async function deleteContent(
  id: number
): Promise<{ error: PostgrestError | null; storageRemoved: boolean }> {
  const supabase = await createAdminSupabaseClient();

  // On fetch failure (null) the targets are unknown, so report storageRemoved: false.
  const targetPdfUrls = await fetchPdfUrlsByContentIds(supabase, [id]);
  let storageRemoved = targetPdfUrls !== null;

  const { error } = await supabase
    .from("learning_contents")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    console.error("コンテンツ削除エラー:", error.message);
    return { error, storageRemoved };
  }

  if (targetPdfUrls !== null && targetPdfUrls.length > 0) {
    storageRemoved = await removeUnreferencedSlideObjects(supabase, targetPdfUrls);
  }

  return { error: null, storageRemoved };
}

export async function fetchAllUsers(): Promise<{
  data: ManageUserListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select(MANAGE_USER_LIST_SELECT)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ユーザー一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as ManageUserListItem[], error: null };
}

/**
 * User IDs with a current Stripe subscription row (for the badge in /admin/users).
 * stripe_subscriptions has one row per user that survives cancellation, so rows with no recorded
 * subscription (NON_CURRENT_SUBSCRIPTION_STATUSES: terminal states and Checkout in progress) are
 * excluded.
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
 * Single-user version of the subscription check used to lock approval / membership-type changes.
 * Same NON_CURRENT_SUBSCRIPTION_STATUSES rule as fetchUserIdsWithStripeSubscription(), using
 * fetchStripeSubscriptionByUserId() (stripe-server.ts) to query one user. Admin can read other
 * users' rows via RLS (stripe_subscriptions SELECT policy).
 */
export async function isUserCurrentlySubscribed(userId: number): Promise<{
  data: boolean | null;
  error: PostgrestError | null;
}> {
  const { data, error } = await fetchStripeSubscriptionByUserId(userId);

  if (error) {
    return { data: null, error };
  }

  return {
    data: data !== null && !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(data.status),
    error: null,
  };
}

/**
 * Approves the user and sets the membership type (community / general).
 * Re-approving an already active user is rejected: it also overwrites the membership type, so a
 * stale screen would reset a configured type to the default (change it via
 * changeMembershipType()). A pre-SELECT check would race between concurrent requests and fail
 * open on SELECT errors, so the condition is folded into the UPDATE to make it atomic.
 * The service_role client bypasses RLS, so `is_deleted = false` must be explicit.
 * @returns updated: whether a row changed. false means already active, missing, or deleted.
 *   approvedAt: the approval time written to `updated_at`, used as the dedup key of the approval
 *   email.
 */
export async function approveUser(
  userId: number,
  membershipType: MembershipType
): Promise<
  | { error: PostgrestError | null; updated: false; approvedAt: null }
  | { error: null; updated: true; approvedAt: string }
> {
  const supabase = await createAdminSupabaseClient();
  const approvedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.ACTIVE,
      membership_type: membershipType,
      updated_at: approvedAt,
    })
    .eq("id", userId)
    .eq("is_deleted", false)
    .neq("status", USER_STATUS.ACTIVE)
    .select("id");

  if (error) {
    console.error("ユーザー承認エラー:", error.message);
    return { error, updated: false, approvedAt: null };
  }

  if ((data?.length ?? 0) === 0) {
    return { error: null, updated: false, approvedAt: null };
  }
  return { error: null, updated: true, approvedAt };
}

/**
 * Rejects the user; rejected users have no membership type, so it is reset to NULL.
 * Admins cannot be rejected (same admin protection as change_role). A pre-SELECT would race and
 * fail open on SELECT errors, so the condition is folded into the UPDATE (same approach as
 * approveUser()).
 * The service_role client bypasses RLS, so `is_deleted = false` must be explicit. Returns
 * updated: false if the target is an admin, missing, or deleted.
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
 * Changes the role; admins cannot be changed (prevents demotion/mistakes). The condition is
 * folded into the UPDATE for atomicity, for the same reason as rejectUser(). Only active users
 * are eligible (docs/specification.md 2.7).
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

/**
 * Changes the membership type of an active user; `status` is not touched (independent of
 * approveUser(), whose design makes re-approval after rejection re-pick the type). The condition
 * is folded into the UPDATE for atomicity (see changeUserRole()). Only active users are eligible
 * (docs/specification.md 2.7). Whether a Stripe-subscribed user may be changed is decided by the
 * caller (API route).
 */
export async function changeMembershipType(
  userId: number,
  membershipType: MembershipType
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .update({ membership_type: membershipType, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("is_deleted", false)
    .eq("status", USER_STATUS.ACTIVE)
    .select("id");

  if (error) {
    console.error("ユーザー会員種別変更エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

/**
 * Promotional-mail unsubscribe state, set by an admin on the user's behalf (`opt_out_email`, e.g.
 * on the user's request) or reverted (`resume_email`). Guarded in the UPDATE so a stale screen
 * cannot overwrite the original unsubscribe time or resume someone who is not unsubscribed;
 * `updated: false` means the target was already in that state, missing or deleted. Transactional
 * mail never reads this column. Not tied to the user's status, so it works for any user.
 */
export async function setUserEmailOptOut(
  userId: number,
  optOut: boolean
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const query = supabase
    .from("users")
    .update({ email_opt_out_at: optOut ? new Date().toISOString() : null })
    .eq("id", userId)
    .eq("is_deleted", false);
  const { data, error } = await (optOut
    ? query.is("email_opt_out_at", null)
    : query.not("email_opt_out_at", "is", null)
  ).select("id");

  if (error) {
    console.error("メール配信停止状態の更新エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

interface StudentProgress {
  user: Pick<UserType, "id" | "display_name" | "email">;
  totalContents: number;
  completedContents: number;
  lastActivity: string | null;
}

/**
 * Return row type of RPC get_students_progress_summary(). Generated types mark `last_activity`
 * non-null, but completed_at is nullable so it can actually be null (e.g. every row has no
 * completion time); overridden explicitly here.
 */
interface StudentProgressSummaryRow {
  user_id: number;
  completed_count: number;
  last_activity: string | null;
}

export async function fetchStudentsProgress(): Promise<{
  data: StudentProgress[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

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

  // Keep the student list even if the total cannot be fetched: log only (totalContents treated as
  // 0).
  if (contentsCountError) {
    console.error("公開コンテンツ総数取得エラー:", contentsCountError.message);
  }

  // Per-user completion counts and last activity come from RPC get_students_progress_summary
  // (GROUP BY user_id in the DB; see migrations) (#83). On failure return completedCount 0 and
  // keep the student list.
  // RPC results are also subject to PostgREST db-max-rows (default 1000), so page with range like
  // the old user_progress implementation (stable order via the RPC's ORDER BY user_id and
  // .order()).
  const progressByUser = new Map<number, { completedCount: number; lastActivity: string | null }>();
  if ((users ?? []).length > 0) {
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      // completed_at is nullable and max() returns NULL when all are NULL, so last_activity can
      // be null (generated types say non-null). .overrideTypes() breaks postgrest-js type
      // inference when used alongside other .from().select() calls in this function and fails the
      // build, so cast the awaited result directly.
      const { data: progressSummary, error: progressError } = (await supabase
        .rpc("get_students_progress_summary")
        .order("user_id")
        .range(offset, offset + pageSize - 1)) as unknown as {
        data: StudentProgressSummaryRow[] | null;
        error: PostgrestError | null;
      };

      if (progressError) {
        console.error("受講生進捗取得エラー:", progressError.message);
        progressByUser.clear();
        break;
      }

      const rows = progressSummary ?? [];
      for (const row of rows) {
        progressByUser.set(row.user_id, {
          completedCount: row.completed_count,
          lastActivity: row.last_activity,
        });
      }

      // Stop conditions (#196 + review):
      // - empty page: stop (mainly to avoid fetching past the last page)
      // - full pageSize: continue (avoid missing rows beyond 1000)
      // - short page but progressByUser.size < users.length: continue (guards db-max-rows lowered
      //   below pageSize; students with zero progress are absent from the RPC, so only then one
      //   empty page can occur)
      offset += rows.length;
      const activeUserCount = (users ?? []).length;
      hasMore =
        rows.length > 0 && (rows.length >= pageSize || progressByUser.size < activeUserCount);
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

interface ManageCounts {
  themes: number;
  phases: number;
  weeks: number;
  contents: number;
  students: number;
}

/**
 * Counts use head + count only (no record bodies). A failed count is returned as 0 so the
 * dashboard still renders.
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

function toFunnelCount(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// createAdminSupabaseClient is SupabaseClient without the Database generic (schema becomes
// never otherwise). rpc() is then any, and noImplicitAny rejects the map callback.
interface WeeklyFunnelRpcRow {
  week_start: string;
  signups: number | string;
  activated: number | string;
  upgraded: number | string;
  ended: number | string;
  paid_total: number | string;
}

/**
 * Weekly funnel for /manage. The RPC is SECURITY INVOKER, but stripe_subscriptions
 * SELECT is self-or-admin, so a maintainer JWT would undercount upgraded/ended.
 * Check admin/maintainer first, then call with service_role. Do not widen that SELECT
 * policy: maintainers should see aggregates, not every Stripe customer id.
 * A failure returns an empty list so the rest of the dashboard still renders.
 */
export async function fetchWeeklyFunnel(): Promise<{
  data: WeeklyFunnelRow[];
  error: string | null;
}> {
  try {
    const { userRole } = await getServerAuth();
    if (!checkContentPermissions(userRole)) {
      return { data: [], error: null };
    }

    const supabase = await createAdminSupabaseClient();
    const { data, error } = (await supabase.rpc("get_weekly_funnel", {
      weeks: WEEKLY_FUNNEL_WEEKS,
    })) as unknown as {
      data: WeeklyFunnelRpcRow[] | null;
      error: PostgrestError | null;
    };
    if (error) {
      console.error("週次ファネル取得エラー:", error.message);
      return { data: [], error: WEEKLY_FUNNEL_FETCH_ERROR };
    }

    const rows = (data ?? []).map((row) => ({
      weekStart: row.week_start,
      signups: toFunnelCount(row.signups),
      activated: toFunnelCount(row.activated),
      upgraded: toFunnelCount(row.upgraded),
      ended: toFunnelCount(row.ended),
      paidTotal: toFunnelCount(row.paid_total),
    }));
    rows.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return { data: rows, error: null };
  } catch (error) {
    console.error("週次ファネル取得エラー:", error);
    return { data: [], error: WEEKLY_FUNNEL_FETCH_ERROR };
  }
}
