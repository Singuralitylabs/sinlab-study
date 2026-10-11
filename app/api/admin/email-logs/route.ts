import { NextResponse } from "next/server";
import { z } from "zod";
import { EMAIL_KINDS, type EmailKind } from "@/app/constants/notifications";
import { EMAIL_LOG_STATUSES, fetchEmailLogs } from "@/app/services/api/email-settings-server";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

const QuerySchema = z.object({
  kind: z.enum(EMAIL_KINDS as [EmailKind, ...EmailKind[]]).optional(),
  status: z.enum(EMAIL_LOG_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

/** Send history (admin only). Reservation rows and bodies are never returned. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }

    const params = new URL(request.url).searchParams;
    const parsed = QuerySchema.safeParse({
      kind: params.get("kind") || undefined,
      status: params.get("status") || undefined,
      page: params.get("page") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "絞り込み条件が不正です" }, { status: 400 });
    }

    const { data, hasNext, error } = await fetchEmailLogs(parsed.data);
    if (error || !data) {
      return NextResponse.json({ error: error ?? "送信履歴の取得に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ logs: data, hasNext });
  } catch (error) {
    console.error("メール送信履歴APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
