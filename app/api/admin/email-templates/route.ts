import { NextResponse } from "next/server";
import { isEmailTemplateKey } from "@/app/lib/email-template";
import {
  fetchEmailTemplatesForAdmin,
  resetEmailTemplate,
  upsertEmailTemplate,
} from "@/app/services/api/email-templates-server";
import { EmailTemplateUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

export async function GET() {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const { data, error } = await fetchEmailTemplatesForAdmin();
    if (error || !data) {
      return NextResponse.json(
        { error: error ?? "メール文面の取得に失敗しました" },
        { status: 500 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("メール文面取得APIエラー:", error);
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

    const validation = await validateRequest(request, EmailTemplateUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { template_key, subject, body } = validation.data;

    const { error } = await upsertEmailTemplate(template_key, { subject, body }, adminUserId);
    if (error) {
      return NextResponse.json({ error: "メール文面の更新に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("メール文面更新APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

/** "Restore default": `?template_key=` deletes the stored row so the code default applies. */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const key = new URL(request.url).searchParams.get("template_key");
    if (!isEmailTemplateKey(key)) {
      return NextResponse.json({ error: "template_key が不正です" }, { status: 400 });
    }
    const { error } = await resetEmailTemplate(key);
    if (error) {
      return NextResponse.json({ error: "既定に戻せませんでした" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("メール文面リセットAPIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
