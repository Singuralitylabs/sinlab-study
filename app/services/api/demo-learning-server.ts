import type { PostgrestError } from "@supabase/supabase-js";
import type {
  LearningContent,
  LearningContentWithWeek,
  LearningPhase,
  LearningTheme,
  LearningWeek,
} from "@/app/types";
import { createAdminSupabaseClient } from "./supabase-server";

export interface DemoContext {
  theme: LearningTheme;
  phase: LearningPhase;
  week: LearningWeek;
}

/**
 * デモ用: 公開テーマ一覧を取得
 */
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

/**
 * デモ用: テーマをIDで取得
 */
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

/**
 * デモ用: テーマに属する公開フェーズ一覧を取得
 */
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

/**
 * デモ用: フェーズをIDで取得
 */
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
 * デモ用コンテキストを取得する
 * 最初の公開テーマ → 最初の公開フェーズ → 最初の公開週 を順番にクエリして返す。
 * すべてのデモページのロック基準となる。
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

/**
 * デモ用: 週に属するコンテンツ一覧を取得
 */
export async function fetchDemoContentsByWeekId(weekId: number): Promise<{
  data: LearningContent[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .eq("week_id", weekId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("デモコンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContent[], error: null };
}

/**
 * デモ用: フェーズに属する公開週一覧をコンテンツ付きで取得
 */
export async function fetchDemoWeeksWithContentsByPhaseId(phaseId: number): Promise<{
  data: (LearningWeek & { contents: LearningContent[] })[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_weeks")
    .select("*, contents:learning_contents(*)")
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

  return { data: data as (LearningWeek & { contents: LearningContent[] })[], error: null };
}

/**
 * デモ用: コンテンツ詳細を取得（週・フェーズ・テーマ情報付き）
 */
export async function fetchDemoContentById(contentId: number): Promise<{
  data: LearningContentWithWeek | null;
  error: PostgrestError | null;
}> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*, week:learning_weeks(*, phase:learning_phases(*, theme:learning_themes(*)))")
    .eq("id", contentId)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("デモコンテンツ詳細取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data as LearningContentWithWeek, error: null };
}
