import { NextResponse } from "next/server";
import {
  authorizeSettingsUser,
  cancelPendingNotificationEmail,
} from "@/app/services/api/notification-email-server";

/** Drops a pending confirmation. The current notification address is left as it is. */
export async function POST() {
  try {
    const auth = await authorizeSettingsUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await cancelPendingNotificationEmail(auth.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("通知先確認の取り消しAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
