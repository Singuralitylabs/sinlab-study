import { NextResponse } from "next/server";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import {
  type EmailKindSettingsPatch,
  fetchEmailSettingsForAdmin,
  updateDigestDailyLimit,
  updateEmailKindSettings,
} from "@/app/services/api/email-settings-server";
import { EmailSettingsUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * admin only, like /api/admin/users: settings decide what is mailed to every student. Rejected
 * users keep their role, so the status is checked as well.
 */
async function requireAdmin(): Promise<
  { response: NextResponse } | { response: null; userId: number }
> {
  const auth = await getServerAuth();
  if (!auth.user) {
    return { response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (auth.userStatus === USER_STATUS.REJECTED) {
    return {
      response: NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 }),
    };
  }
  if (auth.userRole !== USER_ROLE.ADMIN || auth.userId === null) {
    return { response: NextResponse.json({ error: "権限がありません" }, { status: 403 }) };
  }
  return { response: null, userId: auth.userId };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin.response) {
      return admin.response;
    }
    const { data, error } = await fetchEmailSettingsForAdmin();
    if (error || !data) {
      return NextResponse.json(
        { error: error ?? "メール設定の取得に失敗しました" },
        { status: 500 }
      );
    }
    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error("メール設定取得APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    if (admin.response) {
      return admin.response;
    }

    const validation = await validateRequest(request, EmailSettingsUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { kind, digest_daily_limit, ...rest } = validation.data;

    const result =
      kind === undefined
        ? await updateDigestDailyLimit(digest_daily_limit as number, admin.userId)
        : await updateEmailKindSettings(kind, rest as EmailKindSettingsPatch, admin.userId);

    if (result.error) {
      return NextResponse.json({ error: "メール設定の更新に失敗しました" }, { status: 500 });
    }
    // 0 rows: the setting row is missing, or RLS refused a non-admin session.
    if (!result.updated) {
      return NextResponse.json({ error: "更新対象の設定が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("メール設定更新APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
