import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { deleteAnnouncement, updateAnnouncement } from "@/app/services/api/announcements-server";
import { AnnouncementSchema, validateRequest } from "@/app/services/api/schemas";
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

/** お知らせの更新（admin / maintainer。公開・非公開の切り替えを含む） */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorize();
    if (denied) {
      return denied;
    }
    const announcementId = parsePositiveInteger((await params).id);
    if (announcementId === null) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, AnnouncementSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { error, notFound } = await updateAnnouncement(announcementId, validation.data);
    if (error) {
      return NextResponse.json({ error: "お知らせの更新に失敗しました" }, { status: 500 });
    }
    if (notFound) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

/** お知らせの論理削除（admin / maintainer） */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await authorize();
    if (denied) {
      return denied;
    }
    const announcementId = parsePositiveInteger((await params).id);
    if (announcementId === null) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const { error, notFound } = await deleteAnnouncement(announcementId);
    if (error) {
      return NextResponse.json({ error: "お知らせの削除に失敗しました" }, { status: 500 });
    }
    if (notFound) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
