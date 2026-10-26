import { type NextRequest, NextResponse } from "next/server";
import { LAST_VIEWED_AT_DEBOUNCE_MS } from "@/app/constants/progress";
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

    const supabase = await createServerSupabaseClient();

    // Visibility, debounce (#396), and last_viewed_at-only upsert run in one RPC (#501).
    const { data, error } = await supabase.rpc("record_content_view", {
      p_content_id: contentId,
      p_debounce_ms: LAST_VIEWED_AT_DEBOUNCE_MS,
    });

    if (error) {
      if (error.code === "42501" || error.message.includes("content not visible")) {
        return NextResponse.json(
          { error: "対象のコンテンツにアクセスできません" },
          { status: 403 }
        );
      }
      console.error("閲覧記録の更新エラー:", error.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    const skipped =
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as { skipped?: unknown }).skipped === true;

    return NextResponse.json(skipped ? { success: true, skipped: true } : { success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
