import { type NextRequest, NextResponse } from "next/server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, userId, isCompleted } = body;

    if (!contentId || !userId) {
      return NextResponse.json({ error: "contentIdとuserIdは必須です" }, { status: 400 });
    }

    // 認証チェック
    const auth = await getApiAuth();
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // ユーザーIDを検証
    if (auth.data.userId !== userId) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const supabase = await getApiSupabaseClient();

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
