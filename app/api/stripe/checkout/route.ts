import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  isChargeableSubscriptionPrice,
  logDisplayPriceDrift,
  STRIPE_DISABLED_MESSAGE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  CheckoutCreationError,
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  extractUserId,
  reactivateUserFromMirror,
} from "@/app/services/api/stripe-webhook-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

/** 契約中・決済確認中のいずれでも同じ案内を返す（契約状態を推測させないため） */
const CHECKOUT_CONFLICT_MESSAGE = "既に決済手続き中、またはご契約済みです";

/**
 * 反映されていなかった決済をこのリクエストで反映し、会員へ昇格させた場合の遷移先。
 * successページは同じ冪等な反映処理を呼び直したうえで完了画面（次回請求日つき）を出すため、
 * 復旧を正常系として案内できる（エラー表示で再読み込みを促さない）
 */
function checkoutSuccessPath(sessionId: string): string {
  return `/upgrade/success?session_id=${encodeURIComponent(sessionId)}`;
}

/** 昇格だけが漏れていた契約を再昇格させた場合の遷移先（契約中の表示になる） */
const REACTIVATED_PATH = "/upgrade";

type CheckoutRecovery =
  | { kind: "activated"; sessionId: string }
  | { kind: "applied" }
  | { kind: "unrecoverable" }
  | { kind: "error" };

/**
 * 処理権が保持したまま反映されていない決済済みセッション（Webhookとsuccessページの両方が
 * 失敗した場合に残る。#250）を、既存の冪等な反映処理で反映する。反映によりサブスクの
 * ライブ状態がミラー行に書かれ、処理権は解除される（有効な契約なら会員へ昇格する）。
 *
 * 反映後に claim をやり直すことで、次の分岐はミラー行の実状態に従う。有効・未入金など
 * 契約が残っていれば conflict（新しいセッションは作らない）、終端状態なら再契約できる。
 *
 * 次の場合は自動では反映せず（unrecoverable）、運用者へ通知する。いずれも時間が経っても
 * 変わらない状態で、再試行しても同じ結果になる。
 * - 決済済みセッションが複数ある（1つの処理権では通常起こらない）: 1件目の反映で処理権が
 *   解けた後に2件目の反映が失敗すると、2件目の有効な契約を残したまま次のCheckoutを
 *   作れてしまう（二重契約）
 * - セッションのユーザーが本人と一致しない: 他人の契約を書き込むことになる
 * - セッションに customer / subscription が無い: 反映処理が必ず失敗する
 *
 * @param heldClaimedAt 判定に使った処理権の確保時刻。並行する別リクエストが確保し直した
 * 処理権を、この反映が解除しないようにする（`activateUserFromCheckoutSession()` 参照）
 */
async function applyCompletedCheckout(
  userId: number,
  sessions: Stripe.Checkout.Session[],
  heldClaimedAt: string
): Promise<CheckoutRecovery> {
  const unrecoverable = async (reason: string): Promise<CheckoutRecovery> => {
    const sessionIds = sessions.map((session) => session.id);
    console.error(`決済済みCheckoutを自動復旧できません（${reason}）:`, userId, sessionIds);
    await sendSlackCheckoutRecoveryNotification({ userId, reason, sessionIds });
    return { kind: "unrecoverable" };
  };

  if (sessions.length !== 1) {
    return await unrecoverable("決済済みのセッションが複数あります");
  }
  const [session] = sessions;
  // Customerはユーザーごとに一意のため通常は一致する
  if (extractUserId(session.client_reference_id, session.metadata) !== userId) {
    return await unrecoverable("セッションのユーザーが一致しません");
  }
  if (!session.customer || !session.subscription) {
    return await unrecoverable("セッションにcustomer/subscription情報がありません");
  }
  try {
    const result = await activateUserFromCheckoutSession(session, {
      expectedClaimedAt: heldClaimedAt,
    });
    if (result.error) {
      console.error("決済済みCheckoutセッションの反映エラー:", result.error);
      return { kind: "error" };
    }
    return result.activated ? { kind: "activated", sessionId: session.id } : { kind: "applied" };
  } catch (error) {
    console.error("決済済みCheckoutセッションの反映エラー:", error);
    return { kind: "error" };
  }
}

/**
 * お試しユーザーの Checkout が conflict になったとき、ミラー行が有効な契約を記録している
 * のに昇格していない不整合（反映で users の更新だけが失敗した場合に残る。#250）を解消する。
 * 失敗しても従来どおり409を返せばよいため、例外は握りつぶして false を返す。
 */
async function tryReactivateFromMirror(userId: number): Promise<boolean> {
  try {
    const { error, activated } = await reactivateUserFromMirror(userId);
    if (error) {
      console.error("契約済みユーザーの再昇格エラー:", error);
    }
    return activated;
  } catch (error) {
    console.error("契約済みユーザーの再昇格エラー:", error);
    return false;
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
    if (auth.userStatus !== USER_STATUS.TRIAL) {
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
    let claim = await claimCheckoutSlot(auth.userId);
    // 決済済みのまま反映されていない処理権は、時間が経っても解けない（TTLの対象外）。
    // ここで反映して自己復旧させ、claimを1度だけやり直す（#250）
    if (claim.outcome === "blocked") {
      const recovery = await applyCompletedCheckout(
        auth.userId,
        claim.completedSessions,
        claim.heldClaimedAt
      );
      if (recovery.kind === "error") {
        return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
      }
      if (recovery.kind === "unrecoverable") {
        return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
      }
      // 有効な契約を反映して昇格した。新しいセッションは作らず、完了画面へ案内する
      if (recovery.kind === "activated") {
        return NextResponse.json({ url: checkoutSuccessPath(recovery.sessionId) });
      }
      claim = await claimCheckoutSlot(auth.userId);
    }
    if (claim.outcome === "error") {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (claim.outcome === "conflict") {
      // 有効な契約がミラー行にあるのにお試しのまま、という不整合なら再昇格して案内する
      if (await tryReactivateFromMirror(auth.userId)) {
        return NextResponse.json({ url: REACTIVATED_PATH });
      }
      return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
    }
    // やり直しても blocked のまま（並行する別の手続きが決済済みになった等）なら、
    // 反映を繰り返さず従来どおり待たせる
    if (claim.outcome === "blocked") {
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
      console.error("Checkoutセッション作成エラー:", error);
      // 処理権を返してよいのは「Stripe側に有効なセッションが残っていない」と確定できる
      // 場合だけ。通信タイムアウト等で作成済みかどうか不明なまま解放すると、記録されて
      // いない有効なセッションの上にもう1件作れてしまう（その場合の処理権は、次回の
      // claim時の復旧（Customerに紐づく有効セッションの再利用）またはTTLで解ける）
      const releasable = !(error instanceof CheckoutCreationError) || error.claimReleasable;
      if (releasable) {
        await releaseCheckoutSlot(auth.userId, claim.claimedAt);
      }
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
  } catch (error) {
    console.error("Checkout作成APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
