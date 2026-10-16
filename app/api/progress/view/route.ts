import { type NextRequest, NextResponse } from "next/server";
import { LAST_VIEWED_AT_DEBOUNCE_MS } from "@/app/constants/progress";
import { isContentVisible } from "@/app/services/api/learning-server";
import { ProgressViewSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ProgressViewSchema);
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

    // Same visibility gate as POST /api/progress (published SELECT → 0 rows → 403).
    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    const { data: existing, error: readError } = await supabase
      .from("user_progress")
      .select("last_viewed_at")
      .eq("user_id", userId)
      .eq("content_id", contentId)
      .maybeSingle();

    if (readError) {
      console.error("閲覧記録の取得エラー:", readError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    // Skip only continuous reloads of the content that is already the learner's latest view.
    // After visiting another content, reopen must rewrite so continue-learning tracks it (#396).
    if (existing?.last_viewed_at) {
      const elapsed = Date.now() - Date.parse(existing.last_viewed_at);
      if (Number.isFinite(elapsed) && elapsed < LAST_VIEWED_AT_DEBOUNCE_MS) {
        const { count, error: newerError } = await supabase
          .from("user_progress")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gt("last_viewed_at", existing.last_viewed_at);
        if (newerError) {
          console.error("閲覧記録の比較エラー:", newerError.message);
          return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
        }
        if ((count ?? 0) === 0) {
          return NextResponse.json({ success: true, skipped: true });
        }
      }
    }

    // Only last_viewed_at: do not touch is_completed / completed_at / ever_completed / retry_started_at.
    const { error: upsertError } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        content_id: contentId,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_id" }
    );

    if (upsertError) {
      console.error("閲覧記録の更新エラー:", upsertError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
