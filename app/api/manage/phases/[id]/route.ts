import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { deletePhase, updatePhase } from "@/app/services/api/admin-server";
import { PhaseUpdateSchema, validateRequest } from "@/app/services/api/schemas";
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
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }
    const { id } = await params;
    const phaseId = Number.parseInt(id, 10);
    if (Number.isNaN(phaseId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, PhaseUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { theme_id, name, description, insert_after_id, is_published } = validation.data;

    const { error } = await updatePhase(phaseId, {
      theme_id,
      name,
      description,
      insertAfterId: insert_after_id,
      is_published,
    });
    if (error) {
      return NextResponse.json({ error: "フェーズの更新に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidInsertAfterIdError) {
      console.error("フェーズ更新エラー（insert_after_id不正）:", error.insertAfterId);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }
    const { id } = await params;
    const phaseId = Number.parseInt(id, 10);
    if (Number.isNaN(phaseId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }
    const { error } = await deletePhase(phaseId);
    if (error) {
      return NextResponse.json({ error: "フェーズの削除に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
