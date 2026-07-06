import type { PostgrestError } from "@supabase/supabase-js";
import type {
  LearningContent,
  LearningContentWithWeek,
  LearningPhase,
  LearningTheme,
  LearningWeek,
} from "@/app/types";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * 公開テーマ一覧を取得
 */
export async function fetchPublishedThemes(): Promise<{
  data: LearningTheme[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("テーマ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * テーマ詳細を取得
 */
export async function fetchThemeById(themeId: number): Promise<{
  data: LearningTheme | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("id", themeId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("テーマ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * テーマに属する公開フェーズ一覧を取得
 */
export async function fetchPhasesByThemeId(themeId: number): Promise<{
  data: LearningPhase[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("theme_id", themeId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

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
 * フェーズ詳細を取得
 */
export async function fetchPhaseById(phaseId: number): Promise<{
  data: LearningPhase | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_phases")
    .select("*")
    .eq("id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("フェーズ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/** フェーズページの一覧表示に必要なコンテンツの最小カラム（text_content 等の本文は含めない） */
export type PhaseContentSummary = Pick<
  LearningContent,
  "id" | "title" | "content_type" | "display_order"
>;

/**
 * フェーズに属する公開週一覧をコンテンツ付きで取得
 * コンテンツは一覧表示に必要なカラムのみ select する（本文カラムの全取得を避ける）。
 */
export async function fetchWeeksWithContentsByPhaseId(phaseId: number): Promise<{
  data: (LearningWeek & { contents: PhaseContentSummary[] })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*, contents:learning_contents(id, title, content_type, display_order)")
    .eq("phase_id", phaseId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("contents.is_published", true)
    .eq("contents.is_deleted", false)
    .order("display_order")
    .order("display_order", { referencedTable: "learning_contents" });

  if (error) {
    console.error("週・コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as (LearningWeek & { contents: PhaseContentSummary[] })[], error: null };
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
 * 週詳細を取得（フェーズ・テーマ情報付き）
 */
export async function fetchWeekById(weekId: number): Promise<{
  data:
    | (LearningWeek & {
        phase: (LearningPhase & { theme: LearningTheme | null }) | null;
      })
    | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*, phase:learning_phases(*, theme:learning_themes(*))")
    .eq("id", weekId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

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
 * コンテンツ詳細を取得（週・フェーズ・テーマ情報付き）
 */
export async function fetchContentById(contentId: number): Promise<{
  data: LearningContentWithWeek | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*, week:learning_weeks(*, phase:learning_phases(*, theme:learning_themes(*)))")
    .eq("id", contentId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

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
