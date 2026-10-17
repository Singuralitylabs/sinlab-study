import { EMAIL_FROM_NAME } from "@/app/constants/notifications";

/** Prefix of certificates.certificate_no (`SS-YYYYMM-XXXXXX`); the DB CHECK expects the same shape. */
export const CERTIFICATE_NO_PREFIX = "SS";

/** Characters of the random part; no I / O so a printed number is hard to misread. */
export const CERTIFICATE_NO_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const CERTIFICATE_NO_RANDOM_LENGTH = 6;

/** Constraint name from the certificates migration (UNIQUE (certificate_no)). */
export const CERTIFICATE_NO_UNIQUE_CONSTRAINT = "certificates_certificate_no_unique";

/**
 * Retries when a generated certificate_no collides (UNIQUE). 34^6 combinations per month make a
 * collision rare, so a few attempts are plenty.
 */
export const CERTIFICATE_NO_MAX_ATTEMPTS = 5;

/** Service name printed on the certificate; the same source as the email sender name. */
export const CERTIFICATE_SERVICE_NAME = EMAIL_FROM_NAME;

/**
 * Issuing organization printed on the certificate, from the CERTIFICATE_ISSUER_NAME env var. Unset
 * or blank returns null and the line is omitted: a printed certificate cannot be corrected, so the
 * name is never guessed. Set it only once the final wording is confirmed.
 */
export function getCertificateIssuerName(): string | null {
  return process.env.CERTIFICATE_ISSUER_NAME?.trim() || null;
}

/** The dashboard card shows a certificate only for this many days after it was issued. */
export const CERTIFICATE_DASHBOARD_DISPLAY_DAYS = 14;

export const CERTIFICATE_SHARE_HASHTAG = "SinlabStudy";

export const CERTIFICATE_SHARE_URL = "https://twitter.com/intent/tweet";

export const CERTIFICATE_SHARE_URL_LINE = "https://social-plugins.line.me/lineit/share";

export const CERTIFICATE_SHARE_URL_FACEBOOK = "https://www.facebook.com/sharer/sharer.php";
