import { NextResponse } from "next/server";
import { STRIPE_DISABLED_MESSAGE } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  createCheckoutSession,
  isStripeEnabled,
  TERMINAL_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST() {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: STRIPE_DISABLED_MESSAGE }, { status: 503 });
  }

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
      .select("id, status, stripe_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (fetchError) {
      console.error("サブスク存在チェックエラー:", fetchError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (existing && !TERMINAL_SUBSCRIPTION_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: "既に決済手続き中、またはご契約済みです" },
        { status: 409 }
      );
    }

    // 解約済み等で終端状態の行が残っている場合、以前作成済みのCustomerを再利用する
    // （毎回新規Customerを作らないことで、保存済みカード・請求履歴の孤児化を防ぐ）
    const { url } = await createCheckoutSession(
      auth.userId,
      auth.user.id,
      auth.user.email,
      existing?.stripe_customer_id ?? null
    );
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Checkout作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
