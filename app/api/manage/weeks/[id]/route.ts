import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { deleteWeek, updateWeek } from "@/app/services/api/admin-server";
import { validateRequest, WeekUpdateSchema } from "@/app/services/api/schemas";
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
    const weekId = Number.parseInt(id, 10);
    if (Number.isNaN(weekId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, WeekUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { phase_id, name, description, display_order, is_published } = validation.data;

    const { error } = await updateWeek(weekId, {
      phase_id,
      name,
      description,
      display_order,
      is_published,
    });
    if (error) {
      return NextResponse.json({ error: "週の更新に失敗しました" }, { status: 500 });
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
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }
    const { id } = await params;
    const weekId = Number.parseInt(id, 10);
    if (Number.isNaN(weekId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }
    const { error } = await deleteWeek(weekId);
    if (error) {
      return NextResponse.json({ error: "週の削除に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
