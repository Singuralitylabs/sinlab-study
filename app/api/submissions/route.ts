import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
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
    const { contentId, submissionType, codeContent, codeFiles, url } = body;

    if (!contentId || !submissionType) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    // 提出種別の許容値を明示的に検証（不正値はDBのCHECK制約違反→500になる前に400で弾く）
    if (submissionType !== "code" && submissionType !== "url") {
      return NextResponse.json({ error: "提出種別が不正です" }, { status: 400 });
    }

    // コード提出時の保存形式を決定（後方互換: 単一ファイルは code_content、複数は code_files）
    let storedCodeContent: string | null = null;
    let storedCodeFiles: CodeFile[] | null = null;
    let storedUrl: string | null = null;

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
    } else {
      // URL提出: 空白のみの値を弾き、トリム済みの値を保存する
      const trimmedUrl = typeof url === "string" ? url.trim() : "";
      if (trimmedUrl.length === 0) {
        return NextResponse.json({ error: "URLが入力されていません" }, { status: 400 });
      }
      storedUrl = trimmedUrl;
    }

    // 認証チェック
    const { user, userId: authUserId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!authUserId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();

    // コンテンツ可視性チェック: 対象contentIdが自分に不可視なら403
    // （お試し非公開・未公開・存在しないIDのいずれもRLSにより0行になる）
    if (!(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // 提出を作成
    const { data: submission, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: authUserId,
        content_id: contentId,
        submission_type: submissionType,
        code_content: storedCodeContent,
        code_files: storedCodeFiles,
        url: storedUrl,
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
