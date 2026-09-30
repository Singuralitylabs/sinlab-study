import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Verifies the caller of Cron routes (`/api/cron/*`); Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`. There is no user session, so getServerAuth() is not used and every cron route
 * must pass this check.
 * Fail-closed: an unset or empty CRON_SECRET always returns false regardless of the header.
 * Compares SHA-256 digests in constant time so the comparison does not depend on length.
 */
export function isAuthorizedCronRequest(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorizationHeader) {
    return false;
  }
  return timingSafeEqual(sha256(authorizationHeader), sha256(`Bearer ${secret}`));
}
