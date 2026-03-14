import { type NextRequest, NextResponse } from "next/server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, userId, submissionType, codeContent, url } = body;

    if (!contentId || !userId || !submissionType) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    if (submissionType === "code" && !codeContent) {
      return NextResponse.json({ error: "コードが入力されていません" }, { status: 400 });
    }

    if (submissionType === "url" && !url) {
      return NextResponse.json({ error: "URLが入力されていません" }, { status: 400 });
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

    // 提出を作成
    const { data: submission, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: userId,
        content_id: contentId,
        submission_type: submissionType,
        code_content: submissionType === "code" ? codeContent : null,
        url: submissionType === "url" ? url : null,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("提出作成エラー:", insertError);
      return NextResponse.json({ error: "提出の作成に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, submission });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
