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
  ANNOUNCEMENT: "announcement",
} as const;

export type EmailKind = (typeof EMAIL_KIND)[keyof typeof EMAIL_KIND];

/**
 * 案内系メール（Cron が送る定期メールとお知らせの一斉送信）の種別。配信停止（`users.email_opt_out_at`）の対象で、
 * 必ずフッターに配信停止リンクを入れる。トランザクションメール（上記以外）は対象外。
 */
export const PROMOTIONAL_EMAIL_KINDS = [
  EMAIL_KIND.WEEKLY_DIGEST,
  EMAIL_KIND.INACTIVITY_REMINDER,
  EMAIL_KIND.TRIAL_NURTURE,
  EMAIL_KIND.ANNOUNCEMENT,
] as const;

export type PromotionalEmailKind = (typeof PROMOTIONAL_EMAIL_KINDS)[number];

/**
 * 週次進捗の繰り越し予約（`email_logs.kind`。メールは送らない）。月曜の実行で週次進捗の対象に
 * なったユーザーを reference_key = 週の開始日で記録し、火〜日曜の実行はこの予約を持ち、まだ
 * `weekly_digest` を送っていないユーザーだけに送る（月曜に上限・時間切れ・同日の別の案内で
 * 送れなかった分だけを繰り越し、週の途中で新しく対象になったユーザーには送らない）
 */
export const WEEKLY_DIGEST_RESERVATION_KIND = "weekly_digest_reserved";

/**
 * 週次進捗の対象決定の取り戻し期間（週の開始日からの日数）。月曜の実行が失敗・スキップ・
 * 起動漏れで今週の繰り越し予約が1件も無いとき、この日数までの実行は月曜の代わりに対象を
 * 決めて予約する（火曜まで）。それより後は送らず警告だけ出す（週の途中で初めて Cron を
 * 動かした場合に、その週の残りの日に一斉に送らないため）
 */
export const WEEKLY_DIGEST_CATCH_UP_DAYS = 1;

/** 未学習リマインド（`inactivity_reminder`）を送る「登録から N 日目」 */
export const INACTIVITY_REMINDER_DAYS = [7, 14] as const;

/** お試しユーザー向け案内（`trial_nurture`）を送る「登録から N 日目」 */
export const TRIAL_NURTURE_DAYS = [2, 5, 7, 14] as const;

export type TrialNurtureDay = (typeof TRIAL_NURTURE_DAYS)[number];

/**
 * Cron（`GET /api/cron/email-digest`）で送る案内系メールの上限。1回の実行ごとではなく、
 * 同じ日（JST）の実行の合計（その日に claim した `email_logs` の行数）に対して効かせる。
 * Resend 無料枠の日次 100 通に、同日のトランザクションメール分の余裕を残す。
 * 超過分は週次進捗なら同じ週の翌日以降の実行に繰り越す（`docs/specification.md` 10.7）
 */
export const EMAIL_DIGEST_MAX_PER_DAY = 80;

/** 定期メールの日次バッチの実行ロック名（`cron_locks.name`） */
export const EMAIL_DIGEST_LOCK_NAME = "email-digest";

/**
 * 実行ロックの有効期限（ms）。関数のハードタイムアウト（`maxDuration` 60秒）等で解放されなかった
 * ロックは、これを過ぎたら次の実行が取り直す。実行時間より十分長くし、進行中の実行から
 * ロックを奪わないようにする
 */
export const EMAIL_DIGEST_LOCK_TTL_MS = 5 * 60_000;

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

/**
 * お知らせのメール一斉送信で、送信に失敗した宛先へ再送する期間（公開日（JST）からの日数）。
 * Resend が受け付けなかったことが確実な失敗（`status=429` / `5xx`）だけを、失敗した日の翌日
 * 以降の実行で送り直す（同じ日には送り直さない。1日の上限の数え方を崩さないため）。
 * 期間を過ぎた失敗は送り直さず、一斉送信を完了にする（`docs/specification.md` 11.4）
 */
export const ANNOUNCEMENT_EMAIL_RETRY_DAYS = 3;

/** 再送してよい送信失敗（`email_logs.error`）。`sendEmail()` が記録する Resend の応答コード */
export const RETRYABLE_EMAIL_ERROR = /status=(429|5\d\d)$/;
