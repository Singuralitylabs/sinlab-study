/**
 * Slack Webhook通知のfetchタイムアウト（ms）。
 * Webhook側の遅延・無応答が承認依頼やStripe Webhook処理等の主処理をブロックしないよう短めに設定する。
 */
export const SLACK_WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Resend API呼び出しのfetchタイムアウト（ms）。送信は `after()` でレスポンス返却後に行うが、
 * サーバーレス関数の実行時間を無駄に延ばさないよう Slack と同じく短めに設定する。
 */
export const EMAIL_SEND_TIMEOUT_MS = 5_000;

/** Resend のメール送信エンドポイント */
export const RESEND_API_URL = "https://api.resend.com/emails";

/** メール本文・送信元表示名に使うサービス名 */
export const EMAIL_SERVICE_NAME = "AIと学ぶ実践Web技術講座";

/** 送信元の表示名（アドレス自体は環境変数 `EMAIL_FROM_ADDRESS` から読む） */
export const EMAIL_FROM_NAME = EMAIL_SERVICE_NAME;

/**
 * 送信ログ（`email_logs.kind`）の種別。二重送信防止の UNIQUE (user_id, kind, reference_key) の
 * 一部になるため、既存の値は変更しない。
 */
export const EMAIL_KIND = {
  SIGNUP: "signup",
  APPROVED: "approved",
  UPGRADED: "upgraded",
  CANCEL_SCHEDULED: "cancel_scheduled",
  SUBSCRIPTION_ENDED: "subscription_ended",
} as const;

export type EmailKind = (typeof EMAIL_KIND)[keyof typeof EMAIL_KIND];
