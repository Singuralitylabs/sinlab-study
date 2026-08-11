import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { assertServiceRoleConfigured, getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  isEventProcessed,
  recordEventProcessed,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackPaymentFailedNotification } from "@/app/services/notifications/slack";

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

  try {
    assertServiceRoleConfigured();

    // ハンドラ実行より前に「処理済みか」だけを確認する（記録はハンドラ成功後に行う）。
    // 先に記録してしまうと、ハンドラが失敗して500を返してもStripeの再送時に
    // 「処理済み」と誤判定され、二度とハンドラに到達できなくなるため
    const { processed, error: checkError } = await isEventProcessed(event.id);
    if (checkError) {
      console.error("イベント処理済み確認エラー:", checkError);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (processed) {
      return NextResponse.json({ received: true, skipped: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const { error } = await activateUserFromCheckoutSession(
          event.data.object as Stripe.Checkout.Session
        );
        if (error) {
          console.error("会員昇格エラー:", error);
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

    // ハンドラが成功した場合のみ処理済みとして記録する（失敗時は500を返し、再送で再度ハンドラへ到達させる）
    const { error: recordError } = await recordEventProcessed(event.id, event.type);
    if (recordError) {
      console.error("イベント処理済み記録エラー:", recordError);
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook処理エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
