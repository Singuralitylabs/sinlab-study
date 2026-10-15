import { type NextRequest, NextResponse } from "next/server";
import { isContentVisible } from "@/app/services/api/learning-server";
import { saveContentProgress } from "@/app/services/api/progress-server";
import { ProgressUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

// Mail is sent in after() and the platform caps that at this route's maxDuration; the default
// (10s without Fluid Compute) would kill the function before EMAIL_SEND_TIMEOUT_MS (15s) aborts,
// leaving the email_logs claim row neither sent nor failed.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ProgressUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, isCompleted } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId, userStatus, userRole } = guard.auth;

    const supabase = await createServerSupabaseClient();

    // Visibility check: 403 if contentId isn't visible to the user (trial-closed, unpublished and
    // nonexistent IDs all give 0 rows via RLS). Unpublished preview never records progress.
    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    const saved = await saveContentProgress({
      supabase,
      userId,
      userStatus,
      userRole,
      contentId,
      isCompleted,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }

    return NextResponse.json({ success: true, isCompleted });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
