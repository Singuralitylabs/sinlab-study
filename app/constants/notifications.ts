/**
 * Slack webhook fetch timeout (ms). Kept short so a slow or unresponsive webhook can't block main
 * work such as approval requests or Stripe webhook handling.
 */
export const SLACK_WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Resend API fetch timeout (ms). Sending happens in after() once the response is returned; keep it
 * short like Slack so serverless execution time isn't needlessly extended.
 */
export const EMAIL_SEND_TIMEOUT_MS = 5_000;

export const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Defaults for the sender name / subject prefix / header (`EMAIL_SERVICE_NAME`) and the header
 * supplement / footer (`EMAIL_SERVICE_SUBTITLE`). `email_settings.service_name` /
 * `service_subtitle` override them at runtime; these apply when the row cannot be read.
 */
export const EMAIL_SERVICE_NAME = "Sinlab Study";

export const EMAIL_SERVICE_SUBTITLE = "AIと学ぶ実践Web技術講座";

/** Display name only; the address comes from the EMAIL_FROM_ADDRESS env var. */
export const EMAIL_FROM_NAME = EMAIL_SERVICE_NAME;

/**
 * Input limits for the editable email text (enforced by zod). Kept small so a subject stays
 * readable in clients and a body cannot bloat every broadcast.
 */
export const EMAIL_TEMPLATE_SUBJECT_MAX = 100;
export const EMAIL_TEMPLATE_BODY_MAX = 5000;
export const EMAIL_SERVICE_NAME_MAX = 50;
export const EMAIL_SERVICE_SUBTITLE_MAX = 100;

/**
 * Cap on test sends per day (JST, all admins together). Test sends are not recorded in
 * `email_logs`, so they never count toward the promotional daily limit; this keeps them from
 * eating Resend's free tier of 100/day.
 */
export const EMAIL_TEST_SEND_DAILY_LIMIT = 10;

export const EMAIL_TEST_SUBJECT_PREFIX = "【テスト】";

/**
 * Kinds of send log (email_logs.kind). Part of the UNIQUE (user_id, kind, reference_key) that
 * prevents double sends, so never change existing values.
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
 * Promotional kinds (cron periodic mail and announcement broadcasts): subject to unsubscribe
 * (users.email_opt_out_at) and must always include an unsubscribe link in the footer. Other kinds
 * are transactional and exempt.
 */
export const PROMOTIONAL_EMAIL_KINDS = [
  EMAIL_KIND.WEEKLY_DIGEST,
  EMAIL_KIND.INACTIVITY_REMINDER,
  EMAIL_KIND.TRIAL_NURTURE,
  EMAIL_KIND.ANNOUNCEMENT,
] as const;

export type PromotionalEmailKind = (typeof PROMOTIONAL_EMAIL_KINDS)[number];

/**
 * Carry-over reservation for the weekly digest (email_logs.kind; sends no mail). Monday's run
 * records users targeted for the weekly digest with reference_key = the week's start date; Tue-Sun
 * runs send weekly_digest only to users holding this reservation who haven't received it yet
 * (carrying over only those Monday couldn't send due to the cap, timeout or another same-day mail;
 * users who become eligible mid-week aren't sent).
 */
export const WEEKLY_DIGEST_RESERVATION_KIND = "weekly_digest_reserved";

/**
 * Catch-up window (days from the week's start) for deciding weekly digest targets. If Monday's run
 * failed, was skipped or missed and no reservation exists for this week, runs within this many days
 * decide and reserve targets in Monday's place (through Tuesday). After that, only warn and don't
 * send (so the first cron run mid-week doesn't mass-send on the remaining days).
 */
export const WEEKLY_DIGEST_CATCH_UP_DAYS = 1;

/**
 * Kinds managed in email_kind_settings (every sending kind; the weekly digest carry-over
 * reservation sends no mail and is excluded).
 */
export const EMAIL_KINDS: readonly EmailKind[] = Object.values(EMAIL_KIND);

/** Kinds that use email_kind_settings.send_days ("Nth day since sign-up"). */
export const EMAIL_KINDS_WITH_SEND_DAYS: readonly EmailKind[] = [
  EMAIL_KIND.INACTIVITY_REMINDER,
  EMAIL_KIND.TRIAL_NURTURE,
];

/** The only kind that uses email_kind_settings.send_weekday. */
export const EMAIL_KIND_WITH_SEND_WEEKDAY: EmailKind = EMAIL_KIND.WEEKLY_DIGEST;

/**
 * Initial values seeded by the email_kind_settings migration; the settings tables are the source
 * of truth at runtime. Never read these to decide sending (a read failure must fail closed, not
 * fall back to these). Kept for the seed-parity test only.
 */
export const INACTIVITY_REMINDER_DAYS = [7, 14] as const;

export const TRIAL_NURTURE_DAYS = [2, 5, 7, 14] as const;

/** Initial send weekday of the weekly digest (0 = Sunday ... 6 = Saturday). */
export const WEEKLY_DIGEST_WEEKDAY = 1;

/**
 * Initial value of email_settings.digest_daily_limit: cap on promotional mail sent by cron (GET
 * /api/cron/email-digest), applied to the daily total (JST) across runs (rows claimed in
 * email_logs that day), not per run. Leaves room within Resend's free tier of 100/day for the same
 * day's transactional mail. Overflow of the weekly digest carries over to later runs in the same
 * week (docs/specification.md 10.7).
 */
export const EMAIL_DIGEST_MAX_PER_DAY = 80;

/**
 * Input ranges for the settings, enforced by zod. The migration's CHECK constraints only cover
 * the array length, the weekday and the daily limit, so a direct write can still store a day
 * outside 1..60 or a duplicate (the cron then fails closed on it).
 */
export const EMAIL_SEND_DAY_MIN = 1;
export const EMAIL_SEND_DAY_MAX = 60;
export const EMAIL_SEND_DAYS_MAX_COUNT = 10;
export const EMAIL_DIGEST_DAILY_LIMIT_MIN = 1;
/** Stays under Resend's free tier of 100/day. */
export const EMAIL_DIGEST_DAILY_LIMIT_MAX = 95;

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  signup: "登録完了",
  approved: "承認完了",
  upgraded: "有料会員化",
  cancel_scheduled: "解約予約",
  subscription_ended: "有料会員終了",
  weekly_digest: "週次進捗",
  inactivity_reminder: "未学習リマインド",
  trial_nurture: "お試しユーザー向け案内",
  announcement: "お知らせ一斉送信",
};

/** Consequence shown in the confirmation dialog when a transactional kind is disabled. */
export const TRANSACTIONAL_DISABLE_IMPACT: Partial<Record<EmailKind, string>> = {
  signup: "登録完了のメールが本人に届かなくなります。",
  approved: "承認完了が本人に伝わらなくなります。",
  upgraded: "有料会員になったことのメールが本人に届かなくなります。",
  cancel_scheduled: "解約予約のメールが本人に届かなくなります。",
  subscription_ended: "有料会員の終了がメールで伝わらなくなります。",
};

export const EMAIL_LOG_PAGE_SIZE = 50;

export const EMAIL_DIGEST_LOCK_NAME = "email-digest";

/**
 * Lock expiry (ms). A lock not released (e.g. by the function hard timeout, maxDuration 60s) is
 * retaken by the next run after this. Keep it well above the run time so a running job's lock isn't
 * stolen.
 */
export const EMAIL_DIGEST_LOCK_TTL_MS = 5 * 60_000;

/**
 * Minimum interval (ms) between cron sends, to stay within the Resend API rate limit (default 2
 * requests/s).
 */
export const EMAIL_DIGEST_SEND_INTERVAL_MS = 500;

/**
 * Elapsed-time cap (ms) after which cron may not start new sends. Stop before the route's
 * maxDuration (60s) cuts it off and carry the rest over like cap overflow (leaving room for a
 * single send's EMAIL_SEND_TIMEOUT_MS and DB round trips).
 */
export const EMAIL_DIGEST_TIME_BUDGET_MS = 45_000;

/**
 * Retry window (days from the publish date, JST) for announcement email recipients whose send
 * failed. Only failures where Resend certainly didn't accept the mail (status=429 / 5xx) are
 * resent, from the day after the failure (never the same day, to keep the daily cap accounting
 * intact). After the window, failures aren't retried and the broadcast is completed
 * (docs/specification.md 11.4).
 */
export const ANNOUNCEMENT_EMAIL_RETRY_DAYS = 3;

/** Retryable send failures (email_logs.error): the Resend response code recorded by sendEmail(). */
export const RETRYABLE_EMAIL_ERROR = /status=(429|5\d\d)$/;
