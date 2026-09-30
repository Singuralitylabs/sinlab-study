import { NextResponse } from "next/server";
import { loadEmailTextsWithDraft } from "@/app/services/api/email-templates-server";
import { EmailTemplatePreviewSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";
import {
  buildPreviewEmail,
  getPreviewVariants,
} from "@/app/services/notifications/email-template-preview";

/** Sample rendering of an unsaved draft (text + HTML). Sends and stores nothing. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }

    const validation = await validateRequest(request, EmailTemplatePreviewSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { template_key, subject, body, variant, service_name, service_subtitle } =
      validation.data;

    const texts = await loadEmailTextsWithDraft(
      template_key,
      { subject, body },
      service_name === undefined
        ? undefined
        : { serviceName: service_name, serviceSubtitle: service_subtitle || null }
    );
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://study.example.com";
    const content = buildPreviewEmail(template_key, variant, texts, appUrl);
    return NextResponse.json({
      subject: content.subject,
      text: content.text,
      html: content.html,
      variants: getPreviewVariants(template_key),
    });
  } catch (error) {
    console.error("メール文面プレビューAPIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
