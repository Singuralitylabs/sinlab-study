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

export const EMAIL_SERVICE_NAME = "AIと学ぶ実践Web技術講座";

/** Display name only; the address comes from the EMAIL_FROM_ADDRESS env var. */
export const EMAIL_FROM_NAME = EMAIL_SERVICE_NAME;

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

export const INACTIVITY_REMINDER_DAYS = [7, 14] as const;

export const TRIAL_NURTURE_DAYS = [2, 5, 7, 14] as const;

export type TrialNurtureDay = (typeof TRIAL_NURTURE_DAYS)[number];

/**
 * Cap on promotional mail sent by cron (GET /api/cron/email-digest), applied to the daily total
 * (JST) across runs (rows claimed in email_logs that day), not per run. Leaves room within Resend's
 * free tier of 100/day for the same day's transactional mail. Overflow of the weekly digest carries
 * over to later runs in the same week (docs/specification.md 10.7).
 */
export const EMAIL_DIGEST_MAX_PER_DAY = 80;

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
