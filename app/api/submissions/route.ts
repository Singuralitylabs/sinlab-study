import { type NextRequest, NextResponse } from "next/server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";
import type { CodeFile } from "@/app/types";

/**
 * リクエストの codeFiles を検証し、content が空でないファイルのみ抽出する。
 */
function sanitizeCodeFiles(input: unknown): CodeFile[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((f) => ({
      filename: typeof f?.filename === "string" ? f.filename.trim() : "",
      language: typeof f?.language === "string" ? f.language : "",
      content: typeof f?.content === "string" ? f.content : "",
    }))
    .filter((f) => f.content.trim().length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, userId, submissionType, codeContent, codeFiles, url } = body;

    if (!contentId || !userId || !submissionType) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    // コード提出時の保存形式を決定（後方互換: 単一ファイルは code_content、複数は code_files）
    let storedCodeContent: string | null = null;
    let storedCodeFiles: CodeFile[] | null = null;

    if (submissionType === "code") {
      const files = sanitizeCodeFiles(codeFiles);
      const hasLegacyContent = typeof codeContent === "string" && codeContent.trim().length > 0;

      if (files.length >= 2) {
        storedCodeFiles = files;
      } else if (files.length === 1) {
        storedCodeContent = files[0].content;
      } else if (hasLegacyContent) {
        storedCodeContent = codeContent;
      } else {
        return NextResponse.json({ error: "コードが入力されていません" }, { status: 400 });
      }
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
        code_content: storedCodeContent,
        code_files: storedCodeFiles,
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
