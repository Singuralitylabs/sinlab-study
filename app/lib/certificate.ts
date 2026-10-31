import {
  CERTIFICATE_DASHBOARD_DISPLAY_DAYS,
  CERTIFICATE_SHARE_HASHTAG,
  CERTIFICATE_SHARE_URL,
  CERTIFICATE_SHARE_URL_FACEBOOK,
  CERTIFICATE_SHARE_URL_LINE,
} from "@/app/constants/certificate";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import type { UserRoleType, UserStatusType } from "@/app/types";

// Reached from client components (theme-progress -> email-digest -> PlanCards / WeeklyFunnelCard),
// so nothing here may import Node built-ins: a `node:crypto` import pulled a ~420 KB
// crypto-browserify polyfill into /upgrade and /manage. Server-only helpers live in
// certificate-number.ts.
const DAY_MS = 24 * 60 * 60 * 1000;

/** Only active members receive certificates; trial users and admin / maintainer never do. */
export function isCertificateEligible(
  userStatus: UserStatusType | null,
  userRole: UserRoleType | null
): boolean {
  return userStatus === USER_STATUS.ACTIVE && userRole === USER_ROLE.MEMBER;
}

/**
 * A theme counts as completed only when it has published contents and every one is done. An empty
 * theme (nothing published) is never completed, so a certificate cannot be issued for it.
 */
export function isThemeCompleted(summary: {
  totalContents: number;
  completedContents: number;
}): boolean {
  return summary.totalContents > 0 && summary.completedContents >= summary.totalContents;
}

/** ISO timestamp of the oldest `issued_at` the dashboard card may show. */
export function dashboardCertificateCutoff(now: Date): string {
  return new Date(now.getTime() - CERTIFICATE_DASHBOARD_DISPLAY_DAYS * DAY_MS).toISOString();
}

function buildShareTargetUrl(appUrl: string | null): string | null {
  return appUrl ? `${appUrl.replace(/\/+$/, "")}/login` : null;
}

function buildShareText(themeName: string): string {
  return `『${themeName}』を修了しました #${CERTIFICATE_SHARE_HASHTAG}`;
}

/**
 * X (Twitter) share link. Points at the login page, never at the certificate: the certificate page
 * is viewable only by its owner and no public URL exists.
 */
export function buildCertificateShareUrl(themeName: string, appUrl: string | null): string {
  const params = new URLSearchParams({ text: buildShareText(themeName) });
  const target = buildShareTargetUrl(appUrl);
  if (target) {
    params.set("url", target);
  }
  return `${CERTIFICATE_SHARE_URL}?${params.toString()}`;
}

/** LINE share link. null without an app URL: LINE needs a URL to share, unlike X. */
export function buildCertificateLineShareUrl(
  themeName: string,
  appUrl: string | null
): string | null {
  const target = buildShareTargetUrl(appUrl);
  if (!target) {
    return null;
  }
  const params = new URLSearchParams({ url: target, text: buildShareText(themeName) });
  return `${CERTIFICATE_SHARE_URL_LINE}?${params.toString()}`;
}

/**
 * Facebook share link. The sharer takes no body text, so only the URL and one hashtag are passed
 * (the hashtag parameter includes the leading `#`). null without an app URL.
 */
export function buildCertificateFacebookShareUrl(appUrl: string | null): string | null {
  const target = buildShareTargetUrl(appUrl);
  if (!target) {
    return null;
  }
  const params = new URLSearchParams({ u: target, hashtag: `#${CERTIFICATE_SHARE_HASHTAG}` });
  return `${CERTIFICATE_SHARE_URL_FACEBOOK}?${params.toString()}`;
}
