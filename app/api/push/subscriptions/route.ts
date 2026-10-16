import { NextResponse } from "next/server";
import { isWebPushConfigured } from "@/app/lib/web-push-config";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/app/services/api/push-subscriptions-server";
import {
  PushSubscriptionDeleteSchema,
  PushSubscriptionSchema,
  validateRequest,
} from "@/app/services/api/schemas";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

function unavailable(): NextResponse {
  return NextResponse.json({ error: "プッシュ通知は無効です" }, { status: 503 });
}

export async function POST(request: Request) {
  try {
    const gate = await requireLearnerApi();
    if (gate.response) {
      return gate.response;
    }
    if (!isWebPushConfigured()) {
      return unavailable();
    }
    const validation = await validateRequest(request, PushSubscriptionSchema);
    if (!validation.success) {
      return validation.response;
    }
    const supabase = await createAdminSupabaseClient();
    const result = await savePushSubscription(
      supabase,
      gate.auth.userId,
      validation.data,
      request.headers.get("user-agent")
    );
    if (result === "conflict") {
      return NextResponse.json(
        { error: "この購読は別のアカウントに紐づいています" },
        { status: 409 }
      );
    }
    if (result === "failed") {
      return NextResponse.json({ error: "購読の保存に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Web Push] 購読 API エラー:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const gate = await requireLearnerApi();
    if (gate.response) {
      return gate.response;
    }
    if (!isWebPushConfigured()) {
      return unavailable();
    }
    const validation = await validateRequest(request, PushSubscriptionDeleteSchema);
    if (!validation.success) {
      return validation.response;
    }
    const supabase = await createAdminSupabaseClient();
    const result = await deletePushSubscription(
      supabase,
      gate.auth.userId,
      validation.data.endpoint
    );
    if (result === "failed") {
      return NextResponse.json({ error: "購読の削除に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "[Web Push] 購読解除 API エラー:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
