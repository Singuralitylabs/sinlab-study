/**
 * Query value for `/settings?notification_email=…` after the confirm-mail link finishes
 * (POST /api/settings/notification-email/verify). Settings shows a banner; the verify HTML also
 * links here so the result is visible once the user opens settings (#420).
 */
export const NOTIFICATION_EMAIL_RESULT = {
  CONFIRMED: "confirmed",
  EXPIRED: "expired",
  INVALID: "invalid",
  ERROR: "error",
} as const;

export type NotificationEmailResult =
  (typeof NOTIFICATION_EMAIL_RESULT)[keyof typeof NOTIFICATION_EMAIL_RESULT];

export const NOTIFICATION_EMAIL_RESULT_VALUES: readonly NotificationEmailResult[] =
  Object.values(NOTIFICATION_EMAIL_RESULT);
