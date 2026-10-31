import { NOTIFICATION_EMAIL_MAX_LENGTH } from "@/app/constants/notifications";

/**
 * The only place that decides where a student-facing mail goes.
 * NULL / blank `notification_email` means the login address (`users.email`).
 */
export function resolveNotificationEmail(user: {
  email: string | null | undefined;
  notification_email?: string | null;
}): string {
  const custom = user.notification_email?.trim() ?? "";
  if (custom) {
    return custom;
  }
  return user.email?.trim() ?? "";
}

export type NotificationEmailParse = { ok: true; email: string } | { ok: false; message: string };

// One @, a dot in the domain, no whitespace. Control characters are whitespace or rejected here.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim and lowercase. The message never echoes the input. */
export function parseNotificationEmail(value: string): NotificationEmailParse {
  const email = value.trim().toLowerCase();
  if (!email) {
    return { ok: false, message: "メールアドレスを入力してください" };
  }
  if (email.length > NOTIFICATION_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "メールアドレスの形式が正しくありません" };
  }
  return { ok: true, email };
}
