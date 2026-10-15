import { NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { EmailPreferencesSchema, validateRequest } from "@/app/services/api/schemas";
import { fetchUserEmailOptOutAt, setUserEmailOptOut } from "@/app/services/api/user-email-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * Self-service promotional-mail unsubscribe / resume. The target is always the caller's own
 * `userId` from getServerAuth(), never a value from the body, and only `email_opt_out_at` is
 * written (no self-UPDATE RLS policy exists, so role / status cannot be rewritten this way).
 * Idempotent: already being in the requested state is a 200 with the current state, unlike the
 * admin API, which answers 409.
 */
export async function PATCH(request: Request) {
  try {
    const { user, userId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userId == null) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const validation = await validateRequest(request, EmailPreferencesSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { error: updateError } = await setUserEmailOptOut(
      userId,
      !validation.data.promotionalEmails
    );
    if (updateError) {
      return NextResponse.json({ error: "配信設定の更新に失敗しました" }, { status: 500 });
    }

    // Re-read instead of echoing the request: a no-op update (already in that state) must still
    // return the real stored timestamp.
    const { data: emailOptOutAt, error: readError } = await fetchUserEmailOptOutAt(userId);
    if (readError) {
      return NextResponse.json({ error: "配信設定の取得に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ emailOptOutAt });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
