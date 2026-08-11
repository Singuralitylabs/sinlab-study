import { NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createCheckoutSession } from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

// 過去のサブスクがこれらのステータスの場合は再契約（Checkoutのやり直し）を許可する。
// それ以外（active/trialing/past_due/incomplete等）は「既に有効・手続き中」とみなし409で弾く
const REACTIVATABLE_SUBSCRIPTION_STATUSES = ["canceled", "unpaid", "incomplete_expired"];

export async function POST() {
  try {
    const auth = await getServerAuth();
    if (!auth.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!auth.userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (auth.userStatus !== USER_STATUS.PENDING) {
      return NextResponse.json(
        { error: "アップグレードはお試しユーザーのみ利用できます" },
        { status: 403 }
      );
    }

    const supabase = await createAdminSupabaseClient();
    const { data: existing, error: fetchError } = await supabase
      .from("stripe_subscriptions")
      .select("id, status")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (fetchError) {
      console.error("サブスク存在チェックエラー:", fetchError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (existing && !REACTIVATABLE_SUBSCRIPTION_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: "既に決済手続き中、またはご契約済みです" },
        { status: 409 }
      );
    }

    const { url } = await createCheckoutSession(auth.userId, auth.user.id, auth.user.email);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Checkout作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
