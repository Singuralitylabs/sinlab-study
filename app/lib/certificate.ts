import { randomInt } from "node:crypto";
import {
  CERTIFICATE_DASHBOARD_DISPLAY_DAYS,
  CERTIFICATE_NO_CHARS,
  CERTIFICATE_NO_PREFIX,
  CERTIFICATE_NO_RANDOM_LENGTH,
  CERTIFICATE_NO_UNIQUE_CONSTRAINT,
  CERTIFICATE_SHARE_HASHTAG,
  CERTIFICATE_SHARE_URL,
  CERTIFICATE_SHARE_URL_FACEBOOK,
  CERTIFICATE_SHARE_URL_LINE,
} from "@/app/constants/certificate";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import type { UserRoleType, UserStatusType } from "@/app/types";

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

/** Year-month in JST (`YYYYMM`), so a number issued just after midnight JST uses the JST month. */
function formatYearMonthJst(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  return `${jst.getUTCFullYear()}${month}`;
}

/**
 * `SS-YYYYMM-XXXXXX`. The random part uses a CSPRNG (the number is meant to be verifiable later, so
 * it must not be guessable). `randomIndex(max)` returns an integer in [0, max) and is injectable
 * for tests.
 */
export function generateCertificateNo(
  date: Date,
  randomIndex: (max: number) => number = randomInt
): string {
  let suffix = "";
  for (let i = 0; i < CERTIFICATE_NO_RANDOM_LENGTH; i++) {
    suffix += CERTIFICATE_NO_CHARS[randomIndex(CERTIFICATE_NO_CHARS.length)];
  }
  return `${CERTIFICATE_NO_PREFIX}-${formatYearMonthJst(date)}-${suffix}`;
}

/**
 * Whether a unique-violation error is the certificate_no collision (worth retrying with a new
 * number) rather than the (user_id, theme_id) duplicate (already issued). Matches the constraint
 * name or the `Key (certificate_no)=...` detail, never the free-form message wording alone.
 */
export function isCertificateNoCollision(error: { message?: string; details?: string }): boolean {
  return (
    (error.details ?? "").includes("(certificate_no)") ||
    (error.message ?? "").includes(CERTIFICATE_NO_UNIQUE_CONSTRAINT)
  );
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
