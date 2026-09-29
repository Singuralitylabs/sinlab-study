import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import {
  fetchVisibleAnnouncement,
  markAnnouncementRead,
  resolveAnnouncementViewer,
} from "@/app/services/api/announcements-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * Records the announcement as read (called from the client when the detail screen opens).
 * Announcements the user
 * can't see (draft, deleted, not targeted, unknown ID) give 404. Already-read counts as success.
 * Not recorded
 * during page rendering so link prefetching doesn't mark it read.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, userId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    const announcementId = parsePositiveInteger((await params).id);
    if (announcementId === null) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const viewer = await resolveAnnouncementViewer({ userId, userStatus });
    if (!viewer) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    const { data: announcement, error: fetchError } = await fetchVisibleAnnouncement(
      viewer,
      announcementId
    );
    if (fetchError) {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!announcement) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    const { error } = await markAnnouncementRead(userId, announcementId);
    if (error) {
      return NextResponse.json({ error: "既読の記録に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
