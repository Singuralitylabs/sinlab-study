import { NextResponse } from "next/server";
import {
  AI_CHAT_DISABLED_MESSAGE,
  AI_CHAT_SAVED_NOTES_MAX_PER_USER,
  isAiChatEnabled,
} from "@/app/constants/ai-chat";
import { isContentVisible } from "@/app/services/api/learning-server";
import {
  AiChatSavedNoteCreateSchema,
  AiChatSavedNoteDeleteSchema,
  validateRequest,
} from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

/**
 * Saves one answer and its question to the review list. No Gemini call, so it does not use up the
 * chat allowance. Normal client: RLS pins user_id to the caller and the content to a visible one.
 */
export async function POST(request: Request) {
  try {
    if (!isAiChatEnabled()) {
      return NextResponse.json({ error: AI_CHAT_DISABLED_MESSAGE }, { status: 503 });
    }
    const validation = await validateRequest(request, AiChatSavedNoteCreateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, question, answer } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const supabase = await createServerSupabaseClient();
    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // Not atomic with the insert: two saves at the same moment can pass at 299 and end at 301.
    // The cap only keeps the list readable, so that is acceptable.
    const { count, error: countError } = await supabase
      .from("ai_chat_saved_notes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) {
      console.error("シンラビに聞いたことの件数取得エラー:", countError.message);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }
    if ((count ?? 0) >= AI_CHAT_SAVED_NOTES_MAX_PER_USER) {
      return NextResponse.json(
        {
          error: `保存できるのは ${AI_CHAT_SAVED_NOTES_MAX_PER_USER} 件までです。復習リストの「シンラビに聞いたこと」から古いものを消してね`,
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("ai_chat_saved_notes")
      .insert({ user_id: userId, content_id: contentId, question, answer })
      .select("id, content_id, question, answer, created_at")
      .single();
    if (error) {
      console.error("シンラビに聞いたことの保存エラー:", error.message);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ note: data });
  } catch (error) {
    console.error("シンラビに聞いたこと保存APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

/** Deletes one of the caller's saved answers. Allowed while the feature is off (cleanup only). */
export async function DELETE(request: Request) {
  try {
    const validation = await validateRequest(request, AiChatSavedNoteDeleteSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { id } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("ai_chat_saved_notes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id");
    if (error) {
      console.error("シンラビに聞いたことの削除エラー:", error.message);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }
    if ((data?.length ?? 0) === 0) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("シンラビに聞いたこと削除APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
