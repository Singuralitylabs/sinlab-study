import { createHmac, timingSafeEqual } from "node:crypto";
import { buildAppUrl } from "@/app/services/notifications/email-templates";

/** 署名対象に含める用途・版の接頭辞（他用途の HMAC と取り違えないため） */
const TOKEN_PURPOSE = "email-unsubscribe:v1";

/** 配信停止ルートのパス（案内系メールのフッターのリンク先） */
export const EMAIL_UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

function getSecret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || null;
}

function sign(secret: string, userId: number): string {
  return createHmac("sha256", secret).update(`${TOKEN_PURPOSE}:${userId}`).digest("base64url");
}

/** 配信停止リンクを作れるか（`EMAIL_UNSUBSCRIBE_SECRET` が設定済みか） */
export function isUnsubscribeConfigured(): boolean {
  return getSecret() !== null;
}

/**
 * `users.id` を `EMAIL_UNSUBSCRIBE_SECRET` で HMAC-SHA256 署名した配信停止トークン
 * （`<userId>.<署名>`）。有効期限は持たない（古いメールのリンクからも停止できるようにする）。
 * シークレット未設定なら null（呼び出し元は案内系メールを送らない）。
 */
export function createUnsubscribeToken(userId: number): string | null {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  return `${userId}.${sign(secret, userId)}`;
}

/** 案内系メールのフッターに入れる配信停止リンク。シークレット未設定なら null */
export function buildUnsubscribeUrl(appUrl: string, userId: number): string | null {
  const token = createUnsubscribeToken(userId);
  return token
    ? buildAppUrl(appUrl, `${EMAIL_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`)
    : null;
}

/**
 * 配信停止トークンを検証し、署名が正しければ `users.id` を返す。形式不正・改ざん・
 * シークレット未設定はいずれも null（フェイルクローズ。呼び出し元は理由を区別せず 400 にする）。
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
