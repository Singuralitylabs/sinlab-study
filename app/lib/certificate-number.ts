import { randomInt } from "node:crypto";
import {
  CERTIFICATE_NO_CHARS,
  CERTIFICATE_NO_PREFIX,
  CERTIFICATE_NO_RANDOM_LENGTH,
  CERTIFICATE_NO_UNIQUE_CONSTRAINT,
} from "@/app/constants/certificate";

// Kept apart from certificate.ts: that module is reachable from client components, and this one
// needs node:crypto (importing it there bundled a crypto-browserify polyfill into /upgrade and
// /manage). Import only from server code.

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
