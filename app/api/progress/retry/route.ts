import { type NextRequest, NextResponse } from "next/server";
import { isContentVisible } from "@/app/services/api/learning-server";
import { ProgressRetrySchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ProgressRetrySchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const supabase = await createServerSupabaseClient();

    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    const { count, error: countError } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("content_id", contentId);

    if (countError) {
      console.error("再挑戦の提出確認エラー:", countError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!count || count < 1) {
      return NextResponse.json(
        { error: "提出が無い演習では再挑戦を開始できません" },
        { status: 409 }
      );
    }

    // Only retry_started_at: do not touch is_completed / completed_at / ever_completed.
    const { error: upsertError } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        content_id: contentId,
        retry_started_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_id" }
    );

    if (upsertError) {
      console.error("再挑戦の開始エラー:", upsertError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
