import { NextResponse } from "next/server";
import {
  isChargeableSubscriptionPrice,
  logDisplayPriceDrift,
  STRIPE_DISABLED_MESSAGE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/** 契約中・決済確認中のいずれでも同じ案内を返す（契約状態を推測させないため） */
const CHECKOUT_CONFLICT_MESSAGE = "既に決済手続き中、またはご契約済みです";

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

    // UIの disabled だけでは古いタブ・直接POSTを防げないため、作成直前にも実額を確認する。
    // Priceの取得（キャッシュ付きの読み取り）はCheckout Sessionを作らないため、処理権を
    // 確保する前に行い、料金を確認できないだけのリクエストでDBを書かないようにする
    let price: { amount: number | null; currency: string };
    try {
      price = await fetchSubscriptionPrice();
    } catch (error) {
      console.error("料金情報取得エラー:", error);
      return NextResponse.json({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (!isChargeableSubscriptionPrice(price)) {
      return NextResponse.json({ error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    logDisplayPriceDrift(price.amount);

    // Checkout Sessionを作る前に処理権を原子的に確保する。素のSELECTによる存在チェック
    // だけでは、決済完了までミラー行が存在しない時間帯に並行リクエストがすり抜け、2つの
    // Checkout Sessionが作られて二重契約・二重課金になる（#103）
    const claim = await claimCheckoutSlot(auth.userId);
    if (claim.outcome === "error") {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (claim.outcome === "conflict") {
      return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
    }
    // 手続き中のセッションがまだ有効な場合は、新しく作らず同じURLへ案内する
    // （2つ目のセッションを作らないまま、中断・再操作をやり直せるようにする）
    if (claim.outcome === "reusable") {
      return NextResponse.json({ url: claim.url });
    }

    try {
      const { url } = await createCheckoutSessionForUser(
        auth.userId,
        auth.user.id,
        auth.user.email,
        claim.stripeCustomerId,
        claim.claimedAt
      );
      return NextResponse.json({ url });
    } catch (error) {
      // Checkoutへ進めなかったので処理権を返す。成功した場合の解除は、決済完了時の
      // ミラー更新（activateUserFromCheckoutSession）が行う
      console.error("Checkoutセッション作成エラー:", error);
      await releaseCheckoutSlot(auth.userId, claim.claimedAt);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
  } catch (error) {
    console.error("Checkout作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
