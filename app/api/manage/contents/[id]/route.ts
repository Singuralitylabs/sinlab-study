import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { deleteContent, updateContent } from "@/app/services/api/admin-server";
import { ContentUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const contentId = Number.parseInt(id, 10);
    if (Number.isNaN(contentId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, ContentUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const {
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      description,
      exercise_instructions,
      hint,
      reference_answer,
      allowed_submission_types,
      code_language,
      pdf_url,
      display_order,
      is_published,
      is_open_to_trial,
    } = validation.data;

    const { error } = await updateContent(contentId, {
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      description,
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
      return NextResponse.json({ error: "コンテンツの更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const contentId = Number.parseInt(id, 10);
    if (Number.isNaN(contentId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }
    const { error } = await deleteContent(contentId);
    if (error) {
      return NextResponse.json({ error: "コンテンツの削除に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
