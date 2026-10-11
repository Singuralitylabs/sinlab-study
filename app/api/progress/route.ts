import { type NextRequest, NextResponse } from "next/server";
import { ANALYTICS_EVENT } from "@/app/constants/analytics";
import { USER_STATUS } from "@/app/constants/user";
import { shouldTrackFirstCompletion } from "@/app/lib/analytics-funnel";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import { isContentVisible } from "@/app/services/api/learning-server";
import { ProgressUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, ProgressUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, isCompleted } = validation.data;

    const { user, userId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userId == null) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

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

    return NextResponse.json({ success: true, isCompleted });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
