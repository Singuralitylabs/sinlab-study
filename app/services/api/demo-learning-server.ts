import type { PostgrestError } from "@supabase/supabase-js";
import type {
  LearningContent,
  LearningContentListItem,
  LearningContentWithBreadcrumb,
  LearningPhase,
  LearningTheme,
  LearningWeek,
} from "@/app/types";
import { LEARNING_CONTENT_DETAIL_COLUMNS, LEARNING_CONTENT_LIST_COLUMNS } from "./learning-server";
import { createSlideSignedUrlWithClient } from "./slides-server";
import { createAdminSupabaseClient } from "./supabase-server";

export interface DemoContext {
  theme: LearningTheme;
  phase: LearningPhase;
  week: LearningWeek;
}

export async function fetchDemoPublishedThemes(): Promise<{
  data: LearningTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");
  if (error) {
    console.error("デモテーマ一覧取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as LearningTheme[], error: null };
}

export async function fetchDemoThemeById(themeId: number): Promise<{
  data: LearningTheme | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("id", themeId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();
  if (error) {
    console.error("デモテーマ取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as LearningTheme, error: null };
}

export async function fetchDemoPhasesByThemeId(themeId: number): Promise<{
  data: LearningPhase[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("theme_id", themeId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");
  if (error) {
    console.error("デモフェーズ一覧取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as LearningPhase[], error: null };
}

export async function fetchDemoPhaseById(phaseId: number): Promise<{
  data: LearningPhase | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();
  if (error) {
    console.error("デモフェーズ取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as LearningPhase, error: null };
}

/**
 * Demo context: first published theme -> first published phase -> first published week, queried
 * in order. It is the lock baseline for every demo page.
 */
export async function fetchDemoContext(): Promise<{
  data: DemoContext | null;
  error: string | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data: theme, error: themeError } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order")
    .limit(1)
    .single();

  if (themeError || !theme) {
    return { data: null, error: "デモ用テーマが見つかりません" };
  }

  const { data: phase, error: phaseError } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("theme_id", theme.id)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order")
    .limit(1)
    .single();

  if (phaseError || !phase) {
    return { data: null, error: "デモ用フェーズが見つかりません" };
  }

  const { data: week, error: weekError } = await supabase
    .from("learning_weeks")
    .select("*")
    .eq("phase_id", phase.id)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order")
    .limit(1)
    .single();

  if (weekError || !week) {
    return { data: null, error: "デモ用週が見つかりません" };
  }

  return {
    data: {
      theme: theme as LearningTheme,
      phase: phase as LearningPhase,
      week: week as LearningWeek,
    },
    error: null,
  };
}

export async function fetchDemoContentsByWeekId(weekId: number): Promise<{
  data: LearningContentListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select(LEARNING_CONTENT_LIST_COLUMNS)
    .eq("week_id", weekId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("デモコンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentListItem[], error: null };
}

export async function fetchDemoWeeksWithContentsByPhaseId(phaseId: number): Promise<{
  data: (LearningWeek & { contents: LearningContentListItem[] })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select(`*, contents:learning_contents(${LEARNING_CONTENT_LIST_COLUMNS})`)
    .eq("phase_id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("contents.is_published", true)
    .eq("contents.is_deleted", false)
    .order("display_order")
    .order("display_order", { referencedTable: "learning_contents" });

  if (error) {
    console.error("デモ週一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as (LearningWeek & { contents: LearningContentListItem[] })[], error: null };
}

export async function fetchDemoContentById(contentId: number): Promise<{
  data: LearningContentWithBreadcrumb | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select(LEARNING_CONTENT_DETAIL_COLUMNS)
    .eq("id", contentId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("デモコンテンツ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentWithBreadcrumb, error: null };
}

/**
 * Issues a signed URL for a trial-open slide. The demo is unauthenticated (no user-scoped
 * client), so it signs with service_role like the other demo fetchers. service_role bypasses RLS,
 * so this function itself enforces "published, not deleted, is_open_to_trial = true" (same scope
 * as trial users; AGENTS.md invariant, issue #89) and returns null without touching Storage
 * otherwise, independent of caller branching.
 */
export async function createDemoSlideSignedUrl(
  content: Pick<
    LearningContent,
    "content_type" | "pdf_url" | "is_published" | "is_deleted" | "is_open_to_trial"
  >
): Promise<string | null> {
  if (
    content.content_type !== "slide" ||
    !content.pdf_url ||
    !content.is_published ||
    content.is_deleted ||
    !content.is_open_to_trial
  ) {
    return null;
  }

  const supabase = await createAdminSupabaseClient();
  return createSlideSignedUrlWithClient(supabase, content.pdf_url);
}
