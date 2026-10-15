import { type NextRequest, NextResponse } from "next/server";
import { isContentVisible } from "@/app/services/api/learning-server";
import {
  ReviewNoteDeleteSchema,
  ReviewNoteUpsertSchema,
  validateRequest,
} from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

/**
 * Upsert the caller's review note. Manual select→update/insert because the unique index uses
 * COALESCE(requirement_key, '') and PostgREST onConflict cannot target expression indexes.
 */
export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ReviewNoteUpsertSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, requirementKey, memo, understood } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const supabase = await createServerSupabaseClient();

    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    let existingQuery = supabase
      .from("review_notes")
      .select("id, memo, understood_at")
      .eq("user_id", userId)
      .eq("content_id", contentId);
    existingQuery =
      requirementKey === null
        ? existingQuery.is("requirement_key", null)
        : existingQuery.eq("requirement_key", requirementKey);

    const { data: existing, error: selectError } = await existingQuery.maybeSingle();

    if (selectError) {
      console.error("復習メモ取得エラー:", selectError.message);
      return NextResponse.json({ error: "復習メモの保存に失敗しました" }, { status: 500 });
    }

    const patch: {
      memo?: string | null;
      understood_at?: string | null;
    } = {};
    if (memo !== undefined) {
      patch.memo = memo;
    }
    if (understood !== undefined) {
      patch.understood_at = understood ? new Date().toISOString() : null;
    }

    if (existing) {
      const { data, error } = await supabase
        .from("review_notes")
        .update(patch)
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("id, content_id, requirement_key, memo, understood_at, updated_at")
        .single();
      if (error) {
        console.error("復習メモ更新エラー:", error.message);
        return NextResponse.json({ error: "復習メモの保存に失敗しました" }, { status: 500 });
      }
      return NextResponse.json({ note: data });
    }

    const { data, error } = await supabase
      .from("review_notes")
      .insert({
        user_id: userId,
        content_id: contentId,
        requirement_key: requirementKey,
        memo: memo ?? null,
        understood_at: understood ? new Date().toISOString() : null,
      })
      .select("id, content_id, requirement_key, memo, understood_at, updated_at")
      .single();

    // Concurrent blur + understood on a new note: both SELECTs miss, one INSERT wins with 23505.
    if (error?.code === "23505") {
      let retryQuery = supabase
        .from("review_notes")
        .select("id")
        .eq("user_id", userId)
        .eq("content_id", contentId);
      retryQuery =
        requirementKey === null
          ? retryQuery.is("requirement_key", null)
          : retryQuery.eq("requirement_key", requirementKey);
      const { data: raced, error: retrySelectError } = await retryQuery.maybeSingle();
      if (retrySelectError || !raced) {
        console.error(
          "復習メモ作成競合後の再取得エラー:",
          retrySelectError?.message ?? "not found"
        );
        return NextResponse.json({ error: "復習メモの保存に失敗しました" }, { status: 500 });
      }
      const retryPatch: {
        memo?: string | null;
        understood_at?: string | null;
      } = {};
      if (memo !== undefined) {
        retryPatch.memo = memo;
      }
      if (understood !== undefined) {
        retryPatch.understood_at = understood ? new Date().toISOString() : null;
      }
      const { data: updated, error: retryUpdateError } = await supabase
        .from("review_notes")
        .update(retryPatch)
        .eq("id", raced.id)
        .eq("user_id", userId)
        .select("id, content_id, requirement_key, memo, understood_at, updated_at")
        .single();
      if (retryUpdateError) {
        console.error("復習メモ作成競合後の更新エラー:", retryUpdateError.message);
        return NextResponse.json({ error: "復習メモの保存に失敗しました" }, { status: 500 });
      }
      return NextResponse.json({ note: updated });
    }

    if (error) {
      console.error("復習メモ作成エラー:", error.message);
      return NextResponse.json({ error: "復習メモの保存に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ note: data });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ReviewNoteDeleteSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, requirementKey } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const supabase = await createServerSupabaseClient();

    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    let deleteQuery = supabase
      .from("review_notes")
      .delete()
      .eq("user_id", userId)
      .eq("content_id", contentId);
    deleteQuery =
      requirementKey === null
        ? deleteQuery.is("requirement_key", null)
        : deleteQuery.eq("requirement_key", requirementKey);

    const { error } = await deleteQuery;

    if (error) {
      console.error("復習メモ削除エラー:", error.message);
      return NextResponse.json({ error: "復習メモの削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
