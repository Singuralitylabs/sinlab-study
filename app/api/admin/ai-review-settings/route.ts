import { NextResponse } from "next/server";
import {
  fetchAIReviewSettingsForAdmin,
  updateAIReviewLimits,
} from "@/app/services/api/ai-review-settings-server";
import { AiReviewSettingsUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

export async function GET() {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const { data, error } = await fetchAIReviewSettingsForAdmin();
    if (error || !data) {
      return NextResponse.json(
        { error: error ?? "AIレビューの上限値の取得に失敗しました" },
        { status: 500 }
      );
    }
    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error("AIレビュー上限値取得APIエラー:", error);
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

    const validation = await validateRequest(request, AiReviewSettingsUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const result = await updateAIReviewLimits(validation.data, adminUserId);
    if (result.error) {
      return NextResponse.json(
        { error: "AIレビューの上限値の更新に失敗しました" },
        { status: 500 }
      );
    }
    // 0 rows: the settings row is missing, or RLS refused a non-admin session.
    if (!result.updated) {
      return NextResponse.json({ error: "更新対象の設定が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AIレビュー上限値更新APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
