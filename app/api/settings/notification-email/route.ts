import { NextResponse } from "next/server";
import {
  authorizeSettingsUser,
  clearNotificationEmail,
  requestNotificationEmailChange,
} from "@/app/services/api/notification-email-server";
import { NotificationEmailRequestSchema, validateRequest } from "@/app/services/api/schemas";

// The handler waits for Resend, so maxDuration must exceed EMAIL_SEND_TIMEOUT_MS (15s).
export const maxDuration = 30;

/**
 * Asks to change the notification address. The caller's userId comes from getServerAuth();
 * the body cannot name another user. `users.email` is not written, and `notification_email`
 * stays unchanged until the confirmation link is accepted.
 */
export async function POST(request: Request) {
  try {
    const auth = await authorizeSettingsUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const validation = await validateRequest(request, NotificationEmailRequestSchema);
    if (!validation.success) {
      return validation.response;
    }

    const result = await requestNotificationEmailChange(auth.userId, validation.data.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("通知先変更APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

/** Puts the notification address back on the login address (`notification_email` NULL). */
export async function DELETE() {
  try {
    const auth = await authorizeSettingsUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await clearNotificationEmail(auth.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("通知先解除APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
