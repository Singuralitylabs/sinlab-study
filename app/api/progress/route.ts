import { type NextRequest, NextResponse } from "next/server";
import { ANALYTICS_EVENT } from "@/app/constants/analytics";
import { runAfterResponse } from "@/app/lib/after-response";
import { shouldTrackFirstCompletion } from "@/app/lib/analytics-funnel";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import { issueCertificateIfEligible } from "@/app/services/api/certificates-server";
import { isContentVisible } from "@/app/services/api/learning-server";
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
    // nonexistent IDs all give 0 rows via RLS).
    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // Count rows that have ever been completed, before the upsert. is_completed is cleared
    // when the user toggles completion off, so counting it would send first_content_completed
    // again on the next complete. ever_completed stays true. A count failure skips the event.
    let existingCompletedCount: number | null = null;
    if (isCompleted) {
      const { count, error: countError } = await supabase
        .from("user_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("ever_completed", true);
      if (countError) {
        console.error("進捗完了数の取得エラー:", countError.message);
      } else {
        existingCompletedCount = count ?? 0;
      }
    }

    const { error: upsertError } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        content_id: contentId,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
        // Uncomplete must not send false, or the next complete looks like the first one.
        ...(isCompleted ? { ever_completed: true } : {}),
      },
      {
        onConflict: "user_id,content_id",
      }
    );

    if (upsertError) {
      console.error("進捗更新エラー:", upsertError);
      return NextResponse.json({ error: "進捗の更新に失敗しました" }, { status: 500 });
    }

    if (
      existingCompletedCount !== null &&
      shouldTrackFirstCompletion(isCompleted, existingCompletedCount) &&
      userStatus
    ) {
      trackServerEvent(ANALYTICS_EVENT.FIRST_CONTENT_COMPLETED, { status: userStatus });
    }

    // Issue the theme certificate when this completion finished the theme. Deferred with after()
    // so the aggregation queries do not delay the response; outside request scope (where after()
    // throws) it just runs inline. The helper never throws and its result is not used: a failure
    // (or the email) must not change this response.
    if (isCompleted) {
      await runAfterResponse(() =>
        issueCertificateIfEligible({ userId, userStatus, userRole, contentId })
      );
    }

    return NextResponse.json({ success: true, isCompleted });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
