import { NextResponse } from "next/server";
import {
  EMAIL_TEST_SEND_DAILY_LIMIT,
  EMAIL_TEST_SUBJECT_PREFIX,
} from "@/app/constants/notifications";
import { claimTestSend, loadEmailTextsWithDraft } from "@/app/services/api/email-templates-server";
import { EmailTemplatePreviewSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";
import { isEmailConfigured, sendEmail } from "@/app/services/notifications/email";
import { buildPreviewEmail } from "@/app/services/notifications/email-template-preview";

/**
 * Sends the sample email to the signed-in admin's own address, and only there: the recipient comes
 * from the session, never from the request body (the schema is strict). Nothing is written to
 * `email_logs`; a separate per-day counter caps the volume.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const adminUserId = admin.auth.userId;
    const to = admin.auth.user?.email;
    if (adminUserId === null || !to) {
      return NextResponse.json(
        { error: "送信先のメールアドレスを確認できません" },
        { status: 403 }
      );
    }

    const validation = await validateRequest(request, EmailTemplatePreviewSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { template_key, subject, body, variant, service_name, service_subtitle } =
      validation.data;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!isEmailConfigured() || !appUrl) {
      return NextResponse.json({ error: "メール送信の設定が未完了です" }, { status: 503 });
    }

    const claim = await claimTestSend(adminUserId);
    if (!claim.allowed) {
      return claim.error
        ? NextResponse.json({ error: claim.error }, { status: 503 })
        : NextResponse.json(
            {
              error: `本日のテスト送信の上限（${EMAIL_TEST_SEND_DAILY_LIMIT} 通）に達しました。明日以降にお試しください`,
            },
            { status: 429 }
          );
    }

    const texts = await loadEmailTextsWithDraft(
      template_key,
      { subject, body },
      service_name === undefined
        ? undefined
        : { serviceName: service_name, serviceSubtitle: service_subtitle || null }
    );
    const content = buildPreviewEmail(template_key, variant, texts, appUrl);
    const result = await sendEmail({
      to,
      ...content,
      subject: `${EMAIL_TEST_SUBJECT_PREFIX}${content.subject}`,
    });
    if (result.status !== "sent") {
      // Nothing was delivered, so the attempt does not use up one of today's test sends.
      await claim.release();
      return NextResponse.json({ error: "テスト送信に失敗しました" }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("メール文面テスト送信APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
