import { NextResponse } from "next/server";
import {
  isChargeableSubscriptionPrice,
  logDisplayPriceDrift,
  STRIPE_DISABLED_MESSAGE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  type CheckoutSlotClaim,
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * 契約中・他リクエストが手続き中のいずれでも同じ案内を返す（契約状態を推測させないため）。
 * 手続きを中断したユーザーが処理権のTTL（CHECKOUT_CLAIM_TTL_MINUTES）を待てば再試行できる
 * ことも併せて伝える。
 */
const CHECKOUT_CONFLICT_MESSAGE =
  "既に決済手続き中、またはご契約済みです。お手続きを中断した場合は、しばらく時間をおいてから再度お試しください";

/**
 * 処理権（claim）確保後のCheckout作成。失敗はthrowせず応答内容として返し、呼び出し元が
 * 必ず処理権を解放できるようにする（解放漏れがあると、当該ユーザーはTTLが切れるまで
 * アップグレードできなくなる）。
 */
async function createCheckoutUrl(
  userId: number,
  authId: string,
  email: string | undefined,
  claim: Extract<CheckoutSlotClaim, { outcome: "claimed" }>
): Promise<{ url: string } | { error: string; status: number }> {
  // UIの disabled だけでは古いタブ・直接POSTを防げないため、作成直前にも実額を確認する
  try {
    const price = await fetchSubscriptionPrice();
    if (!isChargeableSubscriptionPrice(price)) {
      return { error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE, status: 503 };
    }
    logDisplayPriceDrift(price.amount);
  } catch (error) {
    console.error("料金情報取得エラー:", error);
    return { error: SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE, status: 503 };
  }

  try {
    return await createCheckoutSessionForUser(
      userId,
      authId,
      email,
      claim.stripeCustomerId,
      claim.claimedAt
    );
  } catch (error) {
    console.error("Checkoutセッション作成エラー:", error);
    return { error: "内部エラーが発生しました", status: 500 };
  }
}

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

    // Stripeを呼ぶ前に処理権を原子的に確保する。素のSELECTによる存在チェックだけでは、
    // 決済完了までミラー行が存在しない時間帯に並行リクエストがすり抜け、2つのCheckout
    // Sessionが作られて二重契約・二重課金になる（#103）
    const claim = await claimCheckoutSlot(auth.userId);
    if (claim.outcome === "error") {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (claim.outcome === "conflict") {
      return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
    }

    const result = await createCheckoutUrl(auth.userId, auth.user.id, auth.user.email, claim);
    if ("error" in result) {
      // Checkoutへ進めなかったので処理権を返す。以後の解放は決済完了時のミラー更新
      // （activateUserFromCheckoutSession）またはTTLに委ねる
      await releaseCheckoutSlot(auth.userId, claim.claimedAt);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ url: result.url });
  } catch (error) {
    console.error("Checkout作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
