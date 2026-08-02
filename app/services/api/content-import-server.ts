import type { PostgrestError } from "@supabase/supabase-js";
import type { BulkImportRow } from "@/app/lib/bulk-content-import";
import { createAdminSupabaseClient } from "./supabase-server";

export async function importBulkContents(rows: BulkImportRow[]): Promise<{
  success: boolean;
  createdCount: number;
  errors: string[];
}> {
  const supabase = await createAdminSupabaseClient();

  const createdThemeIds: number[] = [];
  const createdPhaseIds: number[] = [];
  const createdWeekIds: number[] = [];
  const createdContentIds: number[] = [];
  const errors: string[] = [];

  const themeCache = new Map<string, number>();
  const phaseCache = new Map<string, number>();
  const weekCache = new Map<string, number>();
  const weekDisplayOrderCounter = new Map<number, number>();

  const rollback = async () => {
    if (createdContentIds.length > 0) {
      await supabase
        .from("learning_contents")
        .update({ is_deleted: true })
        .in("id", createdContentIds);
    }
    if (createdWeekIds.length > 0) {
      await supabase.from("learning_weeks").update({ is_deleted: true }).in("id", createdWeekIds);
    }
    if (createdPhaseIds.length > 0) {
      await supabase.from("learning_phases").update({ is_deleted: true }).in("id", createdPhaseIds);
    }
    if (createdThemeIds.length > 0) {
      await supabase.from("learning_themes").update({ is_deleted: true }).in("id", createdThemeIds);
    }
  };

  const findOrCreateTheme = async (name: string, description?: string) => {
    const normalizedName = name.trim();
    const cached = themeCache.get(normalizedName);
    if (cached) {
      return cached;
    }

    const { data: existingTheme, error: themeError } = await supabase
      .from("learning_themes")
      .select("id")
      .eq("name", normalizedName)
      .eq("is_deleted", false)
      .maybeSingle();

    if (themeError) {
      throw themeError;
    }

    if (existingTheme?.id) {
      themeCache.set(normalizedName, existingTheme.id);
      return existingTheme.id;
    }

    const { data: newTheme, error: createThemeError } = await supabase
      .from("learning_themes")
      .insert({
        name: normalizedName,
        description: description?.trim() || null,
        display_order: 0,
        is_published: false,
      })
      .select("id")
      .single();

    if (createThemeError || !newTheme?.id) {
      throw createThemeError ?? new Error("テーマの作成に失敗しました");
    }

    createdThemeIds.push(newTheme.id);
    themeCache.set(normalizedName, newTheme.id);
    return newTheme.id;
  };

  const findOrCreatePhase = async (themeId: number, name: string, description?: string) => {
    const normalizedName = name.trim();
    const cacheKey = `${themeId}:${normalizedName}`;
    const cached = phaseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { data: existingPhase, error: phaseError } = await supabase
      .from("learning_phases")
      .select("id")
      .eq("theme_id", themeId)
      .eq("name", normalizedName)
      .eq("is_deleted", false)
      .maybeSingle();

    if (phaseError) {
      throw phaseError;
    }

    if (existingPhase?.id) {
      phaseCache.set(cacheKey, existingPhase.id);
      return existingPhase.id;
    }

    const { data: newPhase, error: createPhaseError } = await supabase
      .from("learning_phases")
      .insert({
        theme_id: themeId,
        name: normalizedName,
        description: description?.trim() || null,
        display_order: 0,
        is_published: false,
      })
      .select("id")
      .single();

    if (createPhaseError || !newPhase?.id) {
      throw createPhaseError ?? new Error("フェーズの作成に失敗しました");
    }

    createdPhaseIds.push(newPhase.id);
    phaseCache.set(cacheKey, newPhase.id);
    return newPhase.id;
  };

  const findOrCreateWeek = async (phaseId: number, name: string, description?: string) => {
    const normalizedName = name.trim();
    const cacheKey = `${phaseId}:${normalizedName}`;
    const cached = weekCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { data: existingWeek, error: weekError } = await supabase
      .from("learning_weeks")
      .select("id")
      .eq("phase_id", phaseId)
      .eq("name", normalizedName)
      .eq("is_deleted", false)
      .maybeSingle();

    if (weekError) {
      throw weekError;
    }

    if (existingWeek?.id) {
      weekCache.set(cacheKey, existingWeek.id);
      return existingWeek.id;
    }

    const { data: newWeek, error: createWeekError } = await supabase
      .from("learning_weeks")
      .insert({
        phase_id: phaseId,
        name: normalizedName,
        description: description?.trim() || null,
        display_order: 0,
        is_published: false,
      })
      .select("id")
      .single();

    if (createWeekError || !newWeek?.id) {
      throw createWeekError ?? new Error("週の作成に失敗しました");
    }

    createdWeekIds.push(newWeek.id);
    weekCache.set(cacheKey, newWeek.id);
    return newWeek.id;
  };

  try {
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const normalizedTitle = row.title.trim();

      const themeId = await findOrCreateTheme(row.theme_name, row.theme_description);
      const phaseId = await findOrCreatePhase(themeId, row.phase_name, row.phase_description);
      const weekId = await findOrCreateWeek(phaseId, row.week_name, row.week_description);

      const { data: existingContent, error: existingContentError } = await supabase
        .from("learning_contents")
        .select("id")
        .eq("week_id", weekId)
        .eq("title", normalizedTitle)
        .eq("is_deleted", false)
        .maybeSingle();

      if (existingContentError) {
        throw existingContentError;
      }
      if (existingContent?.id) {
        errors.push(`行 ${rowNumber}: 既に同じタイトルのコンテンツが存在します`);
        await rollback();
        return { success: false, createdCount: 0, errors };
      }

      const baseOrder = row.display_order ?? undefined;
      const currentCounter = (weekDisplayOrderCounter.get(weekId) ?? 0) + 1;
      weekDisplayOrderCounter.set(weekId, currentCounter);
      const displayOrder = baseOrder ?? currentCounter;

      const contentPayload = {
        week_id: weekId,
        title: normalizedTitle,
        content_type: row.content_type.trim().toLowerCase(),
        video_url:
          row.content_type.trim().toLowerCase() === "video" ? row.video_url?.trim() || null : null,
        text_content:
          row.content_type.trim().toLowerCase() === "text"
            ? row.text_content?.trim() || null
            : null,
        exercise_instructions:
          row.content_type.trim().toLowerCase() === "exercise"
            ? row.exercise_instructions?.trim() || null
            : null,
        reference_answer:
          row.content_type.trim().toLowerCase() === "exercise"
            ? row.reference_answer?.trim() || null
            : null,
        hint:
          row.content_type.trim().toLowerCase() === "exercise" ? row.hint?.trim() || null : null,
        allowed_submission_types:
          row.content_type.trim().toLowerCase() === "exercise"
            ? (row.allowed_submission_types?.trim().toLowerCase() as "code" | "url" | "both") ||
              "code"
            : "code",
        code_language:
          row.content_type.trim().toLowerCase() === "exercise"
            ? (row.code_language?.trim().toLowerCase() as
                | "javascript"
                | "typescript"
                | "html"
                | "css") || "javascript"
            : "javascript",
        display_order: displayOrder,
        is_published: row.is_published ?? false,
      };

      const { data: newContent, error: createContentError } = await supabase
        .from("learning_contents")
        .insert(contentPayload)
        .select("id")
        .single();

      if (createContentError || !newContent?.id) {
        errors.push(`行 ${rowNumber}: コンテンツの作成に失敗しました`);
        await rollback();
        return { success: false, createdCount: 0, errors };
      }

      createdContentIds.push(newContent.id);
    }

    return {
      success: true,
      createdCount: createdContentIds.length,
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    errors.push(message);
    await rollback();
    return { success: false, createdCount: 0, errors };
  }
}

export type { PostgrestError };
