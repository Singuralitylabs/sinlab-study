import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import {
  deletePlaygroundTemplate,
  updatePlaygroundTemplate,
} from "@/app/services/api/playground-templates-server";
import { PlaygroundTemplateSchema, validateRequest } from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

async function authorize(): Promise<NextResponse | null> {
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
    return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
  }
  return null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorize();
    if (denied) {
      return denied;
    }
    const templateId = parsePositiveInteger((await params).id);
    if (templateId === null) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, PlaygroundTemplateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { error, notFound } = await updatePlaygroundTemplate(templateId, validation.data);
    if (error) {
      return NextResponse.json({ error: "ひな形の更新に失敗しました" }, { status: 500 });
    }
    if (notFound) {
      return NextResponse.json({ error: "ひな形が見つかりません" }, { status: 404 });
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
    const denied = await authorize();
    if (denied) {
      return denied;
    }
    const templateId = parsePositiveInteger((await params).id);
    if (templateId === null) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const { error, notFound } = await deletePlaygroundTemplate(templateId);
    if (error) {
      return NextResponse.json({ error: "ひな形の削除に失敗しました" }, { status: 500 });
    }
    if (notFound) {
      return NextResponse.json({ error: "ひな形が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
