import { NextResponse } from "next/server";
import { updateEmailBranding } from "@/app/services/api/email-templates-server";
import { EmailBrandingSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

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

    const validation = await validateRequest(request, EmailBrandingSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { service_name, service_subtitle } = validation.data;

    const result = await updateEmailBranding(
      { serviceName: service_name, serviceSubtitle: service_subtitle || null },
      adminUserId
    );
    if (result.error) {
      return NextResponse.json({ error: "サービス名の更新に失敗しました" }, { status: 500 });
    }
    // 0 rows: the settings row is missing, or RLS refused a non-admin session.
    if (!result.updated) {
      return NextResponse.json({ error: "更新対象の設定が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("サービス名更新APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
