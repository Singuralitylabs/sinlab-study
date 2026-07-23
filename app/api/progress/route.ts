import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, userId, isCompleted } = body;

    if (!contentId || !userId) {
      return NextResponse.json({ error: "contentIdとuserIdは必須です" }, { status: 400 });
    }

    // 認証チェック
    const { user, userId: authUserId, userStatus } = await getServerAuth();
    if (!user || !authUserId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // ユーザーIDを検証
    if (authUserId !== userId) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();

    // コンテンツ可視性チェック: 対象contentIdが自分に不可視なら403
    // （お試し非公開・未公開・存在しないIDのいずれもRLSにより0行になる）
    const { data: visibleContent } = await supabase
      .from("learning_contents")
      .select("id")
      .eq("id", contentId)
      .maybeSingle();

    if (!visibleContent) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // 進捗をupsert
    const { error: upsertError } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        content_id: contentId,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      {
        onConflict: "user_id,content_id",
      }
    );

    if (upsertError) {
      console.error("進捗更新エラー:", upsertError);
      return NextResponse.json({ error: "進捗の更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isCompleted });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
