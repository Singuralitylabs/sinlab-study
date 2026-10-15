import { NextResponse } from "next/server";
import { ALLOWED_USER_STATUSES } from "@/app/constants/user";
import { ProfileUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { updateUserDisplayName } from "@/app/services/api/user-profile-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * Self-service display name. The target is always the caller's own `userId` from getServerAuth(),
 * never a value from the body, and only `display_name` is written (no self-UPDATE RLS policy
 * exists, so role / status cannot be rewritten this way). Other body keys are ignored.
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
    // Fail closed: rejected (and any status outside the allowlist) cannot rename themselves.
    if (userStatus == null || !ALLOWED_USER_STATUSES.includes(userStatus)) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const validation = await validateRequest(request, ProfileUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { data: displayName, error: updateError } = await updateUserDisplayName(
      userId,
      validation.data.displayName
    );
    if (updateError || displayName == null) {
      return NextResponse.json({ error: "表示名の更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ displayName });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
