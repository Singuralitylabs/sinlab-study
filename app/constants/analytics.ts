/**
 * Funnel event names and the only property keys sent to Vercel Web Analytics.
 * String literals stay here so call sites cannot drift, and so a new key cannot
 * carry personal data without changing this allowlist.
 */

export const ANALYTICS_EVENT = {
  SIGNUP: "signup",
  FIRST_CONTENT_COMPLETED: "first_content_completed",
  FIRST_SUBMISSION: "first_submission",
  LOCKED_CONTENT_VIEWED: "locked_content_viewed",
  UPGRADE_CTA_CLICKED: "upgrade_cta_clicked",
  CHECKOUT_STARTED: "checkout_started",
  CHECKOUT_COMPLETED: "checkout_completed",
  SUBSCRIPTION_ENDED: "subscription_ended",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

/** Matches the trial-to-paid CTAs from #288, plus the existing trial banner. */
export const UPGRADE_CTA_SOURCE = {
  LOCK_SCREEN: "lock_screen",
  PHASE_LIST: "phase_list",
  DASHBOARD_CARD: "dashboard_card",
  BANNER: "banner",
  AI_REVIEW_LIMIT: "ai_review_limit",
} as const;

export type UpgradeCtaSource = (typeof UPGRADE_CTA_SOURCE)[keyof typeof UPGRADE_CTA_SOURCE];

/** Allowlist. Email, display name, and user id are intentionally absent. */
export const ANALYTICS_PROPERTY_KEYS = ["status", "content_type", "source"] as const;

export type AnalyticsPropertyKey = (typeof ANALYTICS_PROPERTY_KEYS)[number];

export type AnalyticsProperties = Partial<Record<AnalyticsPropertyKey, string>>;

/** Default window for get_weekly_funnel on the manage dashboard. */
export const WEEKLY_FUNNEL_WEEKS = 8;

/** Allowlist for `?weeks=` on /manage. Values outside this list fall back to WEEKLY_FUNNEL_WEEKS. */
export const WEEKLY_FUNNEL_WEEK_OPTIONS = [8, 26, 52] as const;

export type WeeklyFunnelWeekOption = (typeof WEEKLY_FUNNEL_WEEK_OPTIONS)[number];

export function resolveWeeklyFunnelWeeks(raw: string | string[] | undefined | null): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (
    Number.isInteger(parsed) &&
    (WEEKLY_FUNNEL_WEEK_OPTIONS as readonly number[]).includes(parsed)
  ) {
    return parsed;
  }
  return WEEKLY_FUNNEL_WEEKS;
}

const ALLOWED_PROPERTY_KEYS = new Set<string>(ANALYTICS_PROPERTY_KEYS);

/**
 * Last gate before track(). Drops any key outside the allowlist and any string that
 * looks like an email, so a mistaken call site cannot attach personal data.
 */
export function sanitizeAnalyticsProperties(
  properties: Record<string, string | number | boolean | null | undefined> | undefined
): AnalyticsProperties | undefined {
  if (!properties) {
    return undefined;
  }
  const sanitized: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key) || typeof value !== "string") {
      continue;
    }
    if (value.includes("@") || value.trim() === "") {
      continue;
    }
    sanitized[key as AnalyticsPropertyKey] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
