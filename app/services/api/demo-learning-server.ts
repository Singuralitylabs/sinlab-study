import type { PostgrestError } from "@supabase/supabase-js";
import type {
  LearningContent,
  LearningContentListItem,
  LearningContentWithBreadcrumb,
  LearningPhase,
  LearningTheme,
} from "@/app/types";
import { LEARNING_CONTENT_DETAIL_COLUMNS, LEARNING_CONTENT_LIST_COLUMNS } from "./learning-server";
import { createSlideSignedUrlWithClient } from "./slides-server";
import { createAdminSupabaseClient } from "./supabase-server";

export interface DemoContext {
  theme: LearningTheme;
  phase: LearningPhase;
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
 * Demo context: first published theme -> first published phase, queried in order. It is the lock baseline for every demo page.
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

  return {
    data: {
      theme: theme as LearningTheme,
      phase: phase as LearningPhase,
    },
    error: null,
  };
}

export async function fetchDemoContentsByPhaseId(phaseId: number): Promise<{
  data: LearningContentListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select(LEARNING_CONTENT_LIST_COLUMNS)
    .eq("phase_id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order")
    .order("id");

  if (error) {
    console.error("デモコンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentListItem[], error: null };
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
