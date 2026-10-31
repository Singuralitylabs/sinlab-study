import { createHash, randomBytes } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  NOTIFICATION_EMAIL_CONFIRM_LIMIT,
  NOTIFICATION_EMAIL_CONFIRM_WINDOW_MS,
  NOTIFICATION_EMAIL_LOG_KIND,
  NOTIFICATION_EMAIL_TOKEN_TTL_LABEL,
  NOTIFICATION_EMAIL_TOKEN_TTL_MS,
} from "@/app/constants/notifications";
import { ALLOWED_USER_STATUSES } from "@/app/constants/user";
import { resolveNotificationEmail } from "@/app/lib/notification-email";
import { loadEmailTexts } from "@/app/services/api/email-templates-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import {
  isEmailConfigured,
  type SendEmailResult,
  sendEmail,
} from "@/app/services/notifications/email";
import {
  buildAppUrl,
  buildNotificationEmailChangedEmail,
  buildNotificationEmailConfirmEmail,
} from "@/app/services/notifications/email-templates";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type SettingsFailure = { ok: false; status: number; error: string };
export type SettingsSuccess = { ok: true };
export type SettingsResult = SettingsSuccess | SettingsFailure;

export type NotificationEmailState = {
  loginEmail: string;
  notificationEmail: string | null;
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
};

export type NotificationEmailLinkState = "ready" | "invalid" | "expired" | "error";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const CLEARED_PENDING = {
  notification_email_pending: null,
  notification_email_token_hash: null,
  notification_email_expires_at: null,
} as const;

type UserMailRow = {
  id: number;
  email: string;
  display_name: string;
  notification_email: string | null;
  notification_email_pending: string | null;
  notification_email_expires_at: string | null;
};

const USER_MAIL_COLUMNS =
  "id, email, display_name, notification_email, notification_email_pending, notification_email_expires_at";

/**
 * Logged-in self-service gate. The target is always `userId` from getServerAuth(); callers must
 * not take a user id from the body. Rejected (and any status outside the allowlist) is refused.
 */
export async function authorizeSettingsUser(): Promise<
  { ok: true; userId: number } | SettingsFailure
> {
  const { user, userId, userStatus } = await getServerAuth();
  if (!user) {
    return { ok: false, status: 401, error: "認証が必要です" };
  }
  if (userId == null) {
    return { ok: false, status: 403, error: "ユーザー情報が見つかりません" };
  }
  if (userStatus == null || !ALLOWED_USER_STATUSES.includes(userStatus)) {
    return { ok: false, status: 403, error: "アクセスが拒否されています" };
  }
  return { ok: true, userId };
}

/**
 * Own notification-address state for the settings screen. Normal client: own-row SELECT is already
 * allowed, and the token hash is not selected.
 */
export async function fetchNotificationEmailState(
  userId: number
): Promise<{ data: NotificationEmailState | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("email, notification_email, notification_email_pending, notification_email_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("通知先の取得エラー:", error.message);
    }
    return { data: null, error };
  }

  return {
    data: {
      loginEmail: data.email,
      notificationEmail: data.notification_email,
      pendingEmail: data.notification_email_pending,
      pendingExpiresAt: data.notification_email_expires_at,
    },
    error: null,
  };
}

function newReferenceKey(prefix: "confirm" | "changed"): string {
  return `${prefix}:${randomBytes(16).toString("hex")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL || null;
}

function failure(status: number, error: string): SettingsFailure {
  return { ok: false, status, error };
}

async function loadOwnMailRow(
  supabase: AdminClient,
  userId: number
): Promise<{ row: UserMailRow | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("users")
    .select(USER_MAIL_COLUMNS)
    .eq("id", userId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) {
    console.error("通知先の取得エラー:", error.message);
    return { row: null, error };
  }
  return { row: data, error: null };
}

async function recordSendResult(
  supabase: AdminClient,
  logId: number,
  result: SendEmailResult
): Promise<void> {
  const { error } = await supabase
    .from("email_logs")
    .update(
      result.status === "sent"
        ? { sent_at: new Date().toISOString(), provider_message_id: result.messageId }
        : { error: result.error }
    )
    .eq("id", logId);
  if (error) {
    console.error("[メール通知] email_logs 更新エラー:", error.message);
  }
}

/**
 * Tells the previous destination that the address changed. Best-effort: a send failure does not
 * roll the switch back (the confirmation already happened). Exempt from the global switch and
 * from unsubscribe. The address is not written to logs.
 */
async function sendDestinationChangedNotice(
  supabase: AdminClient,
  params: { userId: number; displayName: string; to: string; newAddress: string }
): Promise<void> {
  if (!params.to || params.to.toLowerCase() === params.newAddress.toLowerCase()) {
    return;
  }
  if (!isEmailConfigured()) {
    console.warn("[メール通知] 送信設定が無いため変更通知をスキップしました");
    return;
  }

  const { data: claimed, error: claimError } = await supabase
    .from("email_logs")
    .insert({
      user_id: params.userId,
      kind: NOTIFICATION_EMAIL_LOG_KIND.CHANGED,
      reference_key: newReferenceKey("changed"),
    })
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    console.error("[メール通知] 変更通知の記録に失敗しました:", claimError?.message);
    return;
  }

  const texts = await loadEmailTexts(supabase);
  const url = appUrl();
  const content = buildNotificationEmailChangedEmail(
    {
      displayName: params.displayName,
      newAddress: params.newAddress,
      settingsUrl: url ? buildAppUrl(url, "/settings") : null,
    },
    texts
  );
  const result = await sendEmail({ to: params.to, ...content });
  await recordSendResult(supabase, claimed.id, result);
}

/**
 * Asks for a new notification address. Stores only the token hash and does not change
 * `notification_email` until the link is confirmed. The confirmation mail bypasses the global
 * switch and unsubscribe, and is still claimed in `email_logs` (that claim is also the rate limit).
 */
export async function requestNotificationEmailChange(
  userId: number,
  email: string
): Promise<SettingsResult> {
  const url = appUrl();
  if (!isEmailConfigured() || !url) {
    return failure(503, "メールを送信できないため、変更を受け付けられません");
  }

  const supabase = await createAdminSupabaseClient();
  const { row, error: readError } = await loadOwnMailRow(supabase, userId);
  if (readError) {
    return failure(500, "通知先の取得に失敗しました");
  }
  if (!row) {
    return failure(404, "ユーザー情報が見つかりません");
  }

  const current = resolveNotificationEmail(row).toLowerCase();
  if (email === current) {
    return failure(400, "現在の送り先と同じアドレスです");
  }
  if (email === row.email.trim().toLowerCase()) {
    return failure(400, "ログイン用のアドレスに戻すには、送り先の解除を使ってください");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const referenceKey = newReferenceKey("confirm");
  const since = new Date(Date.now() - NOTIFICATION_EMAIL_CONFIRM_WINDOW_MS).toISOString();
  const { data: claimId, error: claimError } = await supabase.rpc(
    "claim_notification_email_confirm",
    {
      p_user_id: userId,
      p_reference_key: referenceKey,
      p_since: since,
      p_limit: NOTIFICATION_EMAIL_CONFIRM_LIMIT,
    }
  );
  if (claimError) {
    console.error("[メール通知] 確認メールの claim エラー:", claimError.message);
    return failure(500, "確認メールを送信できませんでした");
  }
  if (claimId == null) {
    return failure(429, "確認メールの送信回数が上限に達しました。時間をおいて再度お試しください。");
  }

  const expiresAt = new Date(Date.now() + NOTIFICATION_EMAIL_TOKEN_TTL_MS).toISOString();
  const { data: pendingRow, error: pendingError } = await supabase
    .from("users")
    .update({
      notification_email_pending: email,
      notification_email_token_hash: tokenHash,
      notification_email_expires_at: expiresAt,
    })
    .eq("id", userId)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();
  if (pendingError || !pendingRow) {
    console.error("[メール通知] 確認待ちの保存に失敗しました:", pendingError?.message);
    await recordSendResult(supabase, claimId, {
      status: "failed",
      error: "確認待ちの保存に失敗しました",
    });
    return failure(500, "確認メールを送信できませんでした");
  }

  const texts = await loadEmailTexts(supabase);
  const confirmUrl = `${buildAppUrl(url, "/api/settings/notification-email/verify")}?token=${encodeURIComponent(token)}`;
  const content = buildNotificationEmailConfirmEmail(
    {
      displayName: row.display_name,
      confirmUrl,
      expiresLabel: NOTIFICATION_EMAIL_TOKEN_TTL_LABEL,
    },
    texts
  );
  const result = await sendEmail({ to: email, ...content });
  await recordSendResult(supabase, claimId, result);
  if (result.status !== "sent") {
    // Drop the token we could not deliver. A later retry issues a new one and counts again.
    // Match the hash so a newer request is not cleared.
    await supabase
      .from("users")
      .update(CLEARED_PENDING)
      .eq("id", userId)
      .eq("notification_email_token_hash", tokenHash);
    return failure(502, "確認メールを送信できませんでした。時間をおいて再度お試しください。");
  }

  return { ok: true };
}

/**
 * Drops a pending confirmation without touching the current destination. Idempotent.
 */
export async function cancelPendingNotificationEmail(userId: number): Promise<SettingsResult> {
  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update(CLEARED_PENDING)
    .eq("id", userId)
    .eq("is_deleted", false);
  if (error) {
    console.error("確認待ちの取り消しエラー:", error.message);
    return failure(500, "確認待ちを取り消せませんでした");
  }
  return { ok: true };
}

/**
 * Sets `notification_email` back to NULL (login address). Notifies the address that was receiving
 * mail. Does not cancel a pending confirmation; that is a separate action.
 */
export async function clearNotificationEmail(userId: number): Promise<SettingsResult> {
  const supabase = await createAdminSupabaseClient();
  const { row, error: readError } = await loadOwnMailRow(supabase, userId);
  if (readError) {
    return failure(500, "通知先の取得に失敗しました");
  }
  if (!row) {
    return failure(404, "ユーザー情報が見つかりません");
  }
  if (!row.notification_email) {
    return { ok: true };
  }

  const previous = row.notification_email;
  const { data: cleared, error } = await supabase
    .from("users")
    .update({ notification_email: null })
    .eq("id", userId)
    .eq("is_deleted", false)
    .eq("notification_email", previous)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("通知先の解除エラー:", error.message);
    return failure(500, "通知先を解除できませんでした");
  }
  if (!cleared) {
    return { ok: true };
  }

  await sendDestinationChangedNotice(supabase, {
    userId,
    displayName: row.display_name,
    to: previous,
    newAddress: row.email,
  });
  return { ok: true };
}

function tokenHashOrNull(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) {
    return null;
  }
  return hashToken(token);
}

async function findPendingByToken(
  supabase: AdminClient,
  token: string
): Promise<{ status: "invalid" | "error" } | { status: "found"; row: UserMailRow }> {
  const tokenHash = tokenHashOrNull(token);
  if (!tokenHash) {
    return { status: "invalid" };
  }
  const { data, error } = await supabase
    .from("users")
    .select(USER_MAIL_COLUMNS)
    .eq("notification_email_token_hash", tokenHash)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) {
    console.error("確認トークンの取得エラー:", error.message);
    return { status: "error" };
  }
  if (!data?.notification_email_pending || !data.notification_email_expires_at) {
    return { status: "invalid" };
  }
  return { status: "found", row: data };
}

function isExpired(expiresAt: string, now: number): boolean {
  return new Date(expiresAt).getTime() <= now;
}

/**
 * Read-only check for the confirmation page. Does not switch the address and does not consume
 * the token: mail scanners prefetch GET, and consuming it there would burn the one-time link.
 */
export async function previewNotificationEmailLink(
  token: string
): Promise<NotificationEmailLinkState> {
  const supabase = await createAdminSupabaseClient();
  const found = await findPendingByToken(supabase, token);
  if (found.status !== "found") {
    return found.status;
  }
  if (isExpired(found.row.notification_email_expires_at as string, Date.now())) {
    return "expired";
  }
  return "ready";
}

/**
 * Confirms the pending address. The token alone identifies the row (no login): the link is opened
 * from the new inbox, often on another device. A second use finds no hash and does nothing.
 * Does not write `users.email`.
 */
export async function confirmNotificationEmail(
  token: string
): Promise<NotificationEmailLinkState | "confirmed"> {
  const tokenHash = tokenHashOrNull(token);
  if (!tokenHash) {
    return "invalid";
  }

  const supabase = await createAdminSupabaseClient();
  const found = await findPendingByToken(supabase, token);
  if (found.status !== "found") {
    return found.status;
  }

  const pending = found.row.notification_email_pending as string;
  const expiresAt = found.row.notification_email_expires_at as string;
  if (isExpired(expiresAt, Date.now())) {
    await supabase
      .from("users")
      .update(CLEARED_PENDING)
      .eq("notification_email_token_hash", tokenHash);
    return "expired";
  }

  const previous = resolveNotificationEmail(found.row);
  const nowIso = new Date().toISOString();
  const { data: switched, error } = await supabase
    .from("users")
    .update({
      notification_email: pending,
      ...CLEARED_PENDING,
    })
    .eq("id", found.row.id)
    .eq("notification_email_token_hash", tokenHash)
    .gt("notification_email_expires_at", nowIso)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("通知先の切り替えエラー:", error.message);
    return "error";
  }
  if (!switched) {
    return "invalid";
  }

  await sendDestinationChangedNotice(supabase, {
    userId: found.row.id,
    displayName: found.row.display_name,
    to: previous,
    newAddress: pending,
  });
  return "confirmed";
}
