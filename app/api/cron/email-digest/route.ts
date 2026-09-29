import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/app/services/auth/cron-auth";
import { runEmailDigest } from "@/app/services/notifications/email-digest-server";

/**
 * 送信は `EMAIL_DIGEST_TIME_BUDGET_MS`（45秒）で新規送信を打ち切るため、DB 往復と送信1通の
 * タイムアウト分の余裕を見て 60 秒とする（Vercel Hobby の上限内）
 */
export const maxDuration = 60;

/**
 * 定期メール（週次進捗・未学習リマインド・お試しユーザー向け案内）の日次バッチ。
 * Vercel Cron（`vercel.json`、毎日 UTC 23 時 = JST 8 時）が
 * `Authorization: Bearer <CRON_SECRET>` を付けて呼ぶ。ユーザーセッションの無い呼び出しのため
 * `getServerAuth()` は使わず、`CRON_SECRET` の検証を必ず通す（未設定・不一致は 401）。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const result = await runEmailDigest();
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
