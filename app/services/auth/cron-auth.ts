import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Cron ルート（`/api/cron/*`）の呼び出し元を検証する。Vercel Cron は
 * `Authorization: Bearer <CRON_SECRET>` を付けて呼ぶ。ユーザーセッションの無い呼び出しの
 * ため `getServerAuth()` は使わず、この判定を必ず通す。
 *
 * フェイルクローズ: `CRON_SECRET` が未設定・空なら常に false（ヘッダーの有無に関係なく拒否）。
 * 比較は長さに依存しないよう SHA-256 のダイジェスト同士を定数時間で比較する。
 */
export function isAuthorizedCronRequest(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorizationHeader) {
    return false;
  }
  return timingSafeEqual(sha256(authorizationHeader), sha256(`Bearer ${secret}`));
}
