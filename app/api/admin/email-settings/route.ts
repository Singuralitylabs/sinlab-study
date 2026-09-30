import { NextResponse } from "next/server";
import {
  type EmailKindSettingsPatch,
  fetchEmailSettingsForAdmin,
  updateDigestDailyLimit,
  updateEmailKindSettings,
} from "@/app/services/api/email-settings-server";
import { EmailSettingsUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

export async function GET() {
  try {
    const admin = await requireAdminApi();
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
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const adminUserId = admin.auth.userId;
    if (adminUserId === null) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const validation = await validateRequest(request, EmailSettingsUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { kind, digest_daily_limit, ...rest } = validation.data;

    const result =
      kind === undefined
        ? await updateDigestDailyLimit(digest_daily_limit as number, adminUserId)
        : await updateEmailKindSettings(kind, rest as EmailKindSettingsPatch, adminUserId);

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
