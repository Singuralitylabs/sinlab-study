import { EMAIL_FROM_NAME } from "@/app/constants/notifications";

/** Prefix of certificates.certificate_no (`SS-YYYYMM-XXXXXX`); the DB CHECK expects the same shape. */
export const CERTIFICATE_NO_PREFIX = "SS";

/** Characters of the random part; no I / O so a printed number is hard to misread. */
export const CERTIFICATE_NO_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const CERTIFICATE_NO_RANDOM_LENGTH = 6;

/**
 * Retries when a generated certificate_no collides (UNIQUE). 34^6 combinations per month make a
 * collision rare, so a few attempts are plenty.
 */
export const CERTIFICATE_NO_MAX_ATTEMPTS = 5;

/** Service name printed on the certificate; the same source as the email sender name. */
export const CERTIFICATE_SERVICE_NAME = EMAIL_FROM_NAME;

/**
 * Issuing organization printed on the certificate. Placeholder until the final wording is
 * confirmed (#291 human task); change it here only.
 */
export const CERTIFICATE_ISSUER_NAME = "一般社団法人 未来技術協会";

/** The dashboard card shows a certificate only for this many days after it was issued. */
export const CERTIFICATE_DASHBOARD_DISPLAY_DAYS = 14;

export const CERTIFICATE_SHARE_HASHTAG = "SinlabStudy";

export const CERTIFICATE_SHARE_URL = "https://twitter.com/intent/tweet";
