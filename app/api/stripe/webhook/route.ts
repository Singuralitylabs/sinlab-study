import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { STRIPE_DISABLED_MESSAGE } from "@/app/constants/stripe";
import { getStripeClient, isStripeEnabled } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  CHECKOUT_SESSION_REJECTION_MESSAGES,
  claimEvent,
  isForeignCheckoutSession,
  isMirroredStripeObject,
  releaseEventClaim,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackPaymentFailedNotification } from "@/app/services/notifications/slack";

type EventPlan =
  | { kind: "skip"; reason: string }
  | { kind: "error" }
  | { kind: "handle"; run: () => Promise<string | null> };

/**
 * Decides, per event type, whether the event is this app's and what to run for it, so the
 * ownership check and the handler for one type cannot drift apart. The verdict needs only the
 * event body and the mirror, so it runs before the claim: the shared Stripe account's other sales
 * would otherwise pile up rows in stripe_events, and answering them 500 only makes Stripe retry
 * and eventually disable the endpoint, stopping cancellations and payment-failure alerts. A
 * redelivery reaches the same verdict, so no claim is needed to answer it 200.
 * @returns run resolves to an error message (500 with the claim released) or null.
 */
async function planEvent(event: Stripe.Event): Promise<EventPlan> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // activateUserFromCheckoutSession() makes the same check, but only after the claim; doing it
      // here too keeps the shared account's Payment Link sales out of stripe_events.
      if (isForeignCheckoutSession(session)) {
        return {
          kind: "skip",
          reason: `Checkout Session id=${session.id} mode=${session.mode} payment_link=${session.payment_link ? "あり" : "なし"}`,
        };
      }
      return {
        kind: "handle",
        run: async () => {
          const { error, rejection } = await activateUserFromCheckoutSession(session);
          if (error) {
            console.error("会員昇格エラー:", error);
            return error;
          }
          // Accepted with 200 and the claim kept: a completed session never changes, so a 500
          // would only be redelivered until Stripe disables the endpoint.
          if (rejection) {
            console.error(
              `Checkout Sessionを昇格できないため受領のみ行いました（要確認）: id=${session.id} ${CHECKOUT_SESSION_REJECTION_MESSAGES[rejection]}`
            );
          }
          return null;
        },
      };
    }
    // By the time of deleted, subscription.status is already 'canceled', so the same sync as
    // updated also completes the demotion.
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const { error, userId } = await isMirroredStripeObject(
        "stripe_subscription_id",
        subscription.id
      );
      if (error) {
        return { kind: "error" };
      }
      if (userId === null) {
        return { kind: "skip", reason: `Subscription id=${subscription.id}` };
      }
      return {
        kind: "handle",
        run: async () => {
          const { error: syncError } = await syncSubscriptionStatus(subscription, userId);
          if (syncError) {
            console.error("サブスク状態同期エラー:", syncError);
          }
          return syncError;
        },
      };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      // Matched by customer because where an invoice names its subscription differs across
      // webhook API versions, while the customer id does not.
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
      if (!customerId) {
        return { kind: "skip", reason: `Invoice id=${invoice.id}` };
      }
      const { error, userId } = await isMirroredStripeObject("stripe_customer_id", customerId);
      if (error) {
        return { kind: "error" };
      }
      if (userId === null) {
        return { kind: "skip", reason: `Invoice id=${invoice.id}` };
      }
      return {
        kind: "handle",
        run: async () => {
          // Don't demote on the first failure; leave it to Smart Retries and only notify operators.
          await sendSlackPaymentFailedNotification({
            customerEmail: invoice.customer_email,
            amountDue: invoice.amount_due,
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          });
          return null;
        },
      };
    }
    // Nothing to do, so not claimed either: claiming would only add stripe_events rows for event
    // types the endpoint happens to receive.
    default:
      return { kind: "skip", reason: "処理対象外の種別" };
  }
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

  let plan: EventPlan;
  try {
    plan = await planEvent(event);
  } catch (error) {
    console.error(`Webhook対象判定エラー: id=${event.id} type=${event.type}`, error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
  if (plan.kind === "error") {
    console.error(`Webhook対象判定エラー: id=${event.id} type=${event.type}`);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
  if (plan.kind === "skip") {
    console.warn(`対象外のイベントをスキップしました: type=${event.type} ${plan.reason}`);
    return NextResponse.json({ received: true, skipped: true });
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

    const handlerError = await plan.run();
    if (handlerError) {
      await safeReleaseEventClaim(event.id, processedAt);
      return NextResponse.json({ error: handlerError }, { status: 500 });
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
