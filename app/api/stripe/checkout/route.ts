import { NextResponse } from "next/server";
import {
  isChargeableSubscriptionPrice,
  logDisplayPriceDrift,
  STRIPE_DISABLED_MESSAGE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  reactivatePaidTrialUser,
  recoverCompletedCheckout,
} from "@/app/services/api/stripe-checkout-recovery-server";
import {
  CheckoutCreationError,
  claimCheckoutSlot,
  createCheckoutSessionForUser,
  fetchSubscriptionPrice,
  isStripeEnabled,
  releaseCheckoutSlot,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

/**
 * Same message for an active contract and a payment in progress, so the contract state can't be
 * inferred.
 */
const CHECKOUT_CONFLICT_MESSAGE = "既に決済手続き中、またはご契約済みです";

/**
 * Destination when this request applied a paid-but-unapplied checkout and promoted the member. The
 * success page
 * re-runs the same idempotent apply and shows the completion screen (with the next billing date),
 * so recovery
 * reads as the normal path (no error prompting a reload).
 */
function checkoutSuccessPath(sessionId: string): string {
  return `/upgrade/success?session_id=${encodeURIComponent(sessionId)}`;
}

const REACTIVATED_PATH = "/upgrade";

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

    // UI disabled alone doesn't stop stale tabs or direct POSTs, so re-check the real price right
    // before creation.
    // Price retrieval (a cached read) creates no Checkout Session, so do it before acquiring the
    // claim; a request
    // that only can't confirm the price must not write to the DB.
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

    // Acquire the claim atomically before creating a Checkout Session. A plain SELECT existence
    // check lets concurrent
    // requests through while no mirror row exists until payment completes, creating two sessions
    // (double contract
    // and double billing; #103).
    let claim = await claimCheckoutSlot(auth.userId);
    // A claim left paid-but-unapplied never clears with time (not covered by the TTL). Apply it
    // here to self-recover
    // and retry the claim once (#250).
    if (claim.outcome === "blocked") {
      const recovery = await recoverCompletedCheckout(
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
      if (recovery.kind === "activated") {
        return NextResponse.json({ url: checkoutSuccessPath(recovery.sessionId) });
      }
      claim = await claimCheckoutSlot(auth.userId);
    }
    if (claim.outcome === "error") {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (claim.outcome === "conflict") {
      // A live contract in the mirror row while the user is still trial is inconsistent: re-promote
      // and redirect.
      if (await reactivatePaidTrialUser(auth.userId)) {
        return NextResponse.json({ url: REACTIVATED_PATH });
      }
      return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
    }
    // Still blocked after the retry (e.g. another concurrent flow was paid): make the user wait
    // instead of applying
    // repeatedly, as before.
    if (claim.outcome === "blocked") {
      return NextResponse.json({ error: CHECKOUT_CONFLICT_MESSAGE }, { status: 409 });
    }
    // If the in-progress session is still valid, send the user to the same URL instead of creating
    // a second one.
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
      // Release the claim only when it is certain no valid session remains on Stripe's side.
      // Releasing while unsure
      // whether one was created (e.g. a network timeout) would allow another on top of an
      // unrecorded valid session
      // (that claim is cleared by recovery at the next claim - reusing a valid session for the
      // Customer - or by the TTL).
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
