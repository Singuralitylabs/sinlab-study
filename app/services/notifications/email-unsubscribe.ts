import { createHmac, timingSafeEqual } from "node:crypto";
import { buildAppUrl } from "@/app/services/notifications/email-templates";

/**
 * Purpose/version prefix included in the signature so it is not confused with HMACs for other
 * purposes.
 */
const TOKEN_PURPOSE = "email-unsubscribe:v1";

/** Unsubscribe route path (link target in the footer of promotional emails). */
export const EMAIL_UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

function getSecret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || null;
}

function sign(secret: string, userId: number): string {
  return createHmac("sha256", secret).update(`${TOKEN_PURPOSE}:${userId}`).digest("base64url");
}

/** Whether unsubscribe links can be built (`EMAIL_UNSUBSCRIBE_SECRET` set). */
export function isUnsubscribeConfigured(): boolean {
  return getSecret() !== null;
}

/**
 * Unsubscribe token: `users.id` signed with HMAC-SHA256 using `EMAIL_UNSUBSCRIBE_SECRET`
 * (`<userId>.<signature>`). No expiry, so links in old emails still work. Returns null when the
 * secret is unset (callers then do not send promotional emails).
 */
export function createUnsubscribeToken(userId: number): string | null {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  return `${userId}.${sign(secret, userId)}`;
}

/** Unsubscribe link for promotional email footers; null when the secret is unset. */
export function buildUnsubscribeUrl(appUrl: string, userId: number): string | null {
  const token = createUnsubscribeToken(userId);
  return token
    ? buildAppUrl(appUrl, `${EMAIL_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`)
    : null;
}

/**
 * Verifies the token and returns `users.id` if the signature is valid. Malformed, tampered, or
 * secret unset all return null (fail-closed; callers answer 400 without distinguishing the
 * reason).
 */
export function verifyUnsubscribeToken(token: string | null): number | null {
  const secret = getSecret();
  if (!secret || !token) {
    return null;
  }

  const match = /^([1-9]\d{0,9})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) {
    return null;
  }
  const userId = Number(match[1]);
  if (!Number.isSafeInteger(userId)) {
    return null;
  }

  const expected = Buffer.from(sign(secret, userId));
  const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return userId;
}
