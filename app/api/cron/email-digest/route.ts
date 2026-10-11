import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/app/services/auth/cron-auth";
import { runEmailDigest } from "@/app/services/notifications/email-digest-server";

/**
 * Sending stops new sends at EMAIL_DIGEST_TIME_BUDGET_MS (45s); 60s leaves room for DB round trips
 * and one send's timeout (within Vercel Hobby's limit).
 */
export const maxDuration = 60;

/**
 * Daily batch for periodic emails (weekly progress, unstudied reminders, trial guidance). Vercel
 * Cron (vercel.json, daily 23:00 UTC = 08:00 JST) calls it with `Authorization: Bearer
 * <CRON_SECRET>`. There is no user session, so getServerAuth() isn't used; the CRON_SECRET check is
 * mandatory (unset/mismatch -> 401).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const result = await runEmailDigest();
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
