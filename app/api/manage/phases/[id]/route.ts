import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { deletePhase, updatePhase } from "@/app/services/api/admin-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user || !userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
    const body = await request.json();
    const { theme_id, name, description, display_order, is_published } = body;
    const { error } = await updatePhase(phaseId, {
      theme_id,
      name,
      description,
      display_order,
      is_published,
    });
    if (error) {
      return NextResponse.json({ error: "フェーズの更新に失敗しました" }, { status: 500 });
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
    if (!user || !userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
