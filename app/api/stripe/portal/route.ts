import { NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createPortalSession, isStripeEnabled } from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST() {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "現在準備中です" }, { status: 503 });
  }

  try {
    const auth = await getServerAuth();
    if (!auth.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!auth.userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (auth.userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const supabase = await createAdminSupabaseClient();
    const { data: subscription, error: fetchError } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (fetchError) {
      console.error("サブスク取得エラー:", fetchError.message);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!subscription) {
      return NextResponse.json({ error: "ご契約情報が見つかりません" }, { status: 404 });
    }

    const { url } = await createPortalSession(subscription.stripe_customer_id);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Portal作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
