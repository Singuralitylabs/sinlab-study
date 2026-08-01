import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createContent } from "@/app/services/api/admin-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (!checkContentPermissions(userRole)) {
      return NextResponse.json({ error: "コンテンツ管理権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      exercise_instructions,
      hint,
      reference_answer,
      allowed_submission_types,
      code_language,
      pdf_url,
      display_order,
      is_published,
      is_open_to_trial,
    } = body;

    if (!title || !week_id || !content_type) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    const { data, error } = await createContent({
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      exercise_instructions,
      hint,
      reference_answer,
      allowed_submission_types,
      code_language,
      pdf_url,
      display_order,
      is_published,
      is_open_to_trial,
    });

    if (error) {
      return NextResponse.json({ error: "コンテンツの作成に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, content: data });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
