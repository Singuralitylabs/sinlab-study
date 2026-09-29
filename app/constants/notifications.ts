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
  WEEKLY_DIGEST: "weekly_digest",
  INACTIVITY_REMINDER: "inactivity_reminder",
  TRIAL_NURTURE: "trial_nurture",
} as const;

export type EmailKind = (typeof EMAIL_KIND)[keyof typeof EMAIL_KIND];

/**
 * 案内系メール（Cron が送る定期メール）の種別。配信停止（`users.email_opt_out_at`）の対象で、
 * 必ずフッターに配信停止リンクを入れる。トランザクションメール（上記以外）は対象外。
 */
export const PROMOTIONAL_EMAIL_KINDS = [
  EMAIL_KIND.WEEKLY_DIGEST,
  EMAIL_KIND.INACTIVITY_REMINDER,
  EMAIL_KIND.TRIAL_NURTURE,
] as const;

export type PromotionalEmailKind = (typeof PROMOTIONAL_EMAIL_KINDS)[number];

/** 未学習リマインド（`inactivity_reminder`）を送る「登録から N 日目」 */
export const INACTIVITY_REMINDER_DAYS = [7, 14] as const;

/** お試しユーザー向け案内（`trial_nurture`）を送る「登録から N 日目」 */
export const TRIAL_NURTURE_DAYS = [2, 5, 7, 14] as const;

export type TrialNurtureDay = (typeof TRIAL_NURTURE_DAYS)[number];

/**
 * Cron（`GET /api/cron/email-digest`）の1回の実行で送る上限（送信を試みた通数）。
 * Resend 無料枠の日次 100 通に、同日のトランザクションメール分の余裕を残す。
 * 超過分は週次進捗なら同じ週の翌日以降の実行に繰り越す（`docs/specification.md` 10.7）
 */
export const EMAIL_DIGEST_MAX_PER_RUN = 80;

/**
 * Cron の送信1通ごとの最小間隔（ms）。Resend API のレート制限（既定 2 リクエスト/秒）を
 * 超えないよう、送信の開始間隔をこれ以上空ける
 */
export const EMAIL_DIGEST_SEND_INTERVAL_MS = 500;

/**
 * Cron が新しい送信を始めてよい経過時間の上限（ms）。ルートの `maxDuration`（60秒）で
 * 打ち切られる前に止め、残りは上限超過分と同じく繰り越す（送信1通のタイムアウト
 * `EMAIL_SEND_TIMEOUT_MS` と DB 往復の余裕を残す）
 */
export const EMAIL_DIGEST_TIME_BUDGET_MS = 45_000;
