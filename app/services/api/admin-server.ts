import type { PostgrestError } from "@supabase/supabase-js";
import type {
  LearningContent,
  LearningPhase,
  LearningPhaseWithTheme,
  LearningTheme,
  LearningWeek,
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

export async function createTheme(theme: {
  name: string;
  description?: string;
  display_order?: number;
  is_published?: boolean;
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
  const supabase = await createServerSupabaseClient();

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
  const supabase = await createServerSupabaseClient();

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
  const supabase = await createServerSupabaseClient();

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
  data:
    | (LearningContent & { week: (LearningWeek & { phase: LearningPhase | null }) | null })[]
    | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*, week:learning_weeks(*, phase:learning_phases(*))")
    .eq("is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("コンテンツ一覧取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function fetchContentByIdForAdmin(
  contentId: number,
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
  pdf_url?: string;
  display_order?: number;
  is_published?: boolean;
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

  // アクティブなユーザー一覧を取得
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, email")
    .eq("status", "active")
    .eq("is_deleted", false)
    .order("display_name");

  if (usersError) {
    console.error("ユーザー一覧取得エラー:", usersError.message);
    return { data: null, error: usersError };
  }

  // 公開コンテンツの総数を取得
  const { count: totalContents } = await supabase
    .from("learning_contents")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("is_deleted", false);

  // 各ユーザーの進捗を取得
  const studentsProgress: StudentProgress[] = await Promise.all(
    (users || []).map(async (user) => {
      const { data: progress } = await supabase
        .from("user_progress")
        .select("completed_at")
        .eq("user_id", user.id)
        .eq("is_completed", true)
        .order("completed_at", { ascending: false });

      return {
        user,
        totalContents: totalContents || 0,
        completedContents: progress?.length || 0,
        lastActivity: progress?.[0]?.completed_at || null,
      };
    })
  );

  return { data: studentsProgress, error: null };
}
