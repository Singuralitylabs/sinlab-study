import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { STRIPE_DISABLED_MESSAGE } from "@/app/constants/stripe";
import { getStripeClient, isStripeEnabled } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  releaseEventClaim,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackPaymentFailedNotification } from "@/app/services/notifications/slack";

/**
 * True for a Checkout Session this app did not create. The Stripe account is shared with other
 * sales (Payment Links etc.), whose checkout.session.completed events reach this endpoint too;
 * answering 500 for them only makes Stripe retry and eventually disable the endpoint (#302).
 * client_reference_id alone is no proof of origin: a buyer can append `?client_reference_id=42` to
 * a Payment Link URL and would promote user 42 with an unrelated purchase. metadata.auth_id is
 * the marker, because createCheckoutSession() has always set it and buyers cannot set metadata.
 * The user id is deliberately not checked here: our own session without a usable one must stay a
 * 500 (claim released) so Stripe keeps redelivering it instead of the payment being dropped.
 * payment_link and mode are read from the event body; see docs/specification.md 2.11 for why
 * that is safe across webhook API versions.
 */
function isForeignCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return (
    session.payment_link != null || !session.metadata?.auth_id || session.mode !== "subscription"
  );
}

/**
 * Calls releaseEventClaim() guarded against exceptions. It reports DB errors via {error} instead of
 * throwing, but internals such as createAdminSupabaseClient() may throw unexpectedly; a release
 * failure must not break the 500 response for a handler failure (an unreleased claim becomes
 * claimable again after the TTL).
 */
async function safeReleaseEventClaim(eventId: string, processedAt: string): Promise<void> {
  try {
    await releaseEventClaim(eventId, processedAt);
  } catch (error) {
    console.error("イベントclaim解放エラー:", error);
  }
}

export async function POST(request: NextRequest) {
  // While disabled, do no signature verification or event processing at all (fully stopped on the
  // premise of zero existing live subscribers; see AGENTS.md).
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: STRIPE_DISABLED_MESSAGE }, { status: 503 });
  }

  // The raw body (before JSON parsing) is required for signature verification.
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "署名情報が不足しています" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook署名検証エラー:", error);
    return NextResponse.json({ error: "署名検証に失敗しました" }, { status: 400 });
  }

  // Decided from the event body alone, so it runs before the claim: foreign sales would otherwise
  // pile up rows in stripe_events and turn a claim DB error into a pointless 500 and redelivery.
  // A redelivery reaches the same verdict, so no claim is needed to answer it 200.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (isForeignCheckoutSession(session)) {
      console.warn(
        `対象外のCheckout Sessionをスキップしました: id=${session.id} mode=${session.mode} payment_link=${session.payment_link ? "あり" : "なし"}`
      );
      return NextResponse.json({ received: true, skipped: true });
    }
  }

  let claimedProcessedAt: string | null = null;

  try {
    // Atomically acquire event.id via a plain INSERT: of concurrent deliveries of the same event.id
    // only one wins on the unique constraint. If not claimed, another request already processed or
    // is processing it, so skip the handler.
    const {
      claimed: didClaim,
      processedAt,
      error: claimError,
    } = await claimEvent(event.id, event.type);
    if (claimError) {
      console.error("イベントclaimエラー:", claimError);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!didClaim || !processedAt) {
      return NextResponse.json({ received: true, skipped: true });
    }
    claimedProcessedAt = processedAt;

    switch (event.type) {
      case "checkout.session.completed": {
        const { error } = await activateUserFromCheckoutSession(
          event.data.object as Stripe.Checkout.Session
        );
        if (error) {
          console.error("会員昇格エラー:", error);
          await safeReleaseEventClaim(event.id, processedAt);
          return NextResponse.json({ error }, { status: 500 });
        }
        break;
      }
      // By the time of deleted, subscription.status is already 'canceled', so the same sync as
      // updated also completes the demotion.
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const { error } = await syncSubscriptionStatus(event.data.object as Stripe.Subscription);
        if (error) {
          console.error("サブスク状態同期エラー:", error);
          await safeReleaseEventClaim(event.id, processedAt);
          return NextResponse.json({ error }, { status: 500 });
        }
        break;
      }
      case "invoice.payment_failed": {
        // Don't demote on the first failure; leave it to Smart Retries and only notify operators.
        const invoice = event.data.object as Stripe.Invoice;
        await sendSlackPaymentFailedNotification({
          customerEmail: invoice.customer_email,
          amountDue: invoice.amount_due,
          hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook処理エラー:", error);
    // Release the claim before returning 500 so unexpected exceptions after claiming stay
    // retryable.
    if (claimedProcessedAt) {
      await safeReleaseEventClaim(event.id, claimedProcessedAt);
    }
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
