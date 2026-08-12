import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { assertServiceRoleConfigured, getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  releaseEventClaim,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackPaymentFailedNotification } from "@/app/services/notifications/slack";

/**
 * releaseEventClaim() を例外から保護して呼ぶ。releaseEventClaim() 自体はDBエラーを
 * throwせず{error}で返す設計だが、内部で呼ぶ assertServiceRoleConfigured() 等が
 * 予期せずthrowした場合に、解放処理の失敗でハンドラ失敗時の500応答自体を
 * 壊さないようにする（解放できなければclaimは残るが、TTL経過後に再claim可能になる）。
 */
async function safeReleaseEventClaim(eventId: string): Promise<void> {
  try {
    await releaseEventClaim(eventId);
  } catch (error) {
    console.error("イベントclaim解放エラー:", error);
  }
}

export async function POST(request: NextRequest) {
  // JSONパース前の生ボディが署名検証に必須
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

  let claimed = false;

  try {
    assertServiceRoleConfigured();

    // event.idの処理権を原子的に確保する（素のINSERTのため、同一event.idの並行配信は
    // 一意制約により片方だけがclaimに成功する）。claimできなければ「他のリクエストが
    // 既に処理済み、または処理中」であり、ハンドラを実行せずスキップする
    const { claimed: didClaim, error: claimError } = await claimEvent(event.id, event.type);
    if (claimError) {
      console.error("イベントclaimエラー:", claimError);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (!didClaim) {
      return NextResponse.json({ received: true, skipped: true });
    }
    claimed = true;

    switch (event.type) {
      case "checkout.session.completed": {
        const { error } = await activateUserFromCheckoutSession(
          event.data.object as Stripe.Checkout.Session
        );
        if (error) {
          console.error("会員昇格エラー:", error);
          await safeReleaseEventClaim(event.id);
          return NextResponse.json({ error }, { status: 500 });
        }
        break;
      }
      // deleted時点でsubscription.statusは既に'canceled'のため、updatedと同じ同期処理で降格まで完結する
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const { error } = await syncSubscriptionStatus(event.data.object as Stripe.Subscription);
        if (error) {
          console.error("サブスク状態同期エラー:", error);
          await safeReleaseEventClaim(event.id);
          return NextResponse.json({ error }, { status: 500 });
        }
        break;
      }
      case "invoice.payment_failed": {
        // 初回失敗では降格せずSmart Retriesに任せる。運用者への通知のみ行う
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
    // claim後の予期しない例外もリトライ可能にするため、処理権を解放してから500を返す
    if (claimed) {
      await safeReleaseEventClaim(event.id);
    }
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
