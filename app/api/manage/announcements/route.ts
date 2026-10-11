import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createAnnouncement } from "@/app/services/api/announcements-server";
import { AnnouncementSchema, validateRequest } from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

/** send_email is not sent synchronously from the screen; the daily cron batch sends it. */
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
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }

    const validation = await validateRequest(request, AnnouncementSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { data, error } = await createAnnouncement(validation.data, userId);
    if (error || !data) {
      return NextResponse.json({ error: "お知らせの作成に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
