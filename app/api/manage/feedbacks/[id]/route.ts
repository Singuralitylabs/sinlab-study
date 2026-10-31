import { type NextRequest, NextResponse } from "next/server";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { updateFeedbackStatus } from "@/app/services/api/feedback-server";
import { FeedbackStatusUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireContentManagerApi } from "@/app/services/auth/admin-guard";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireContentManagerApi();
    if (guard.response) {
      return guard.response;
    }

    const { id: rawId } = await context.params;
    const id = parsePositiveInteger(rawId);
    if (!id) {
      return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    }

    const validation = await validateRequest(request, FeedbackStatusUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { data, error } = await updateFeedbackStatus(id, validation.data.status);
    if (error) {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "フィードバックが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ success: true, status: data.status });
  } catch (error) {
    console.error("フィードバック状態更新APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
