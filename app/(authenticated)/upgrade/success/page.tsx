import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { isStripeEnabled, STRIPE_DISABLED_MESSAGE } from "@/app/constants/stripe";
import { formatDate } from "@/app/lib/format-date";
import {
  PAID_CHECKOUT_PAYMENT_STATUSES,
  retrieveCheckoutSession,
} from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  extractUserId,
  isForeignCheckoutSession,
} from "@/app/services/api/stripe-webhook-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function UpgradeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const { userId } = await getServerAuth();

  let succeeded = false;
  let errorMessage = "決済情報を確認できませんでした";
  let nextBillingDateLabel: string | null = null;

  if (!isStripeEnabled()) {
    // While disabled, make no Stripe API calls or promotions. Hosted Checkout sessions stay valid
    // up to 24h after creation, so revisiting the success page of a session started just before the
    // flag went OFF must not unconditionally verify payment and promote.
    errorMessage = STRIPE_DISABLED_MESSAGE;
  } else if (userId && sessionId) {
    try {
      const session = await retrieveCheckoutSession(sessionId);
      const sessionUserId = extractUserId(session.client_reference_id, session.metadata);

      // activateUserFromCheckoutSession() rejects foreign sessions too; checking here as well shows
      // "could not verify" instead of a retry prompt that can never succeed.
      if (
        !PAID_CHECKOUT_PAYMENT_STATUSES.includes(session.payment_status) ||
        isForeignCheckoutSession(session) ||
        sessionUserId !== userId
      ) {
        errorMessage = "決済情報を確認できませんでした";
      } else {
        // The redirect can land here before the webhook, so run the same idempotent promotion here
        // too (safe even if it overlaps the webhook).
        const { error, activated, currentPeriodEnd } =
          await activateUserFromCheckoutSession(session);
        if (error) {
          console.error("会員昇格エラー:", error);
          errorMessage = "会員登録の反映に失敗しました。時間をおいて再度お試しください";
        } else if (!activated) {
          // Cases where nothing was actually promoted, e.g. revisiting a canceled session's URL or
          // an unpaid payment. Permissions are unchanged, so show no success.
          errorMessage = "このお申し込みは現在有効ではありません";
        } else {
          succeeded = true;
          // Right after a small prorated charge, show the next full-charge date to reduce
          // inquiries. activateUserFromCheckoutSession() already returns the value fetched from
          // Stripe, so no DB re-read.
          if (currentPeriodEnd) {
            nextBillingDateLabel = formatDate(currentPeriodEnd);
          }
        }
      }
    } catch (error) {
      console.error("Checkoutセッション確認エラー:", error);
      errorMessage = "決済情報の確認に失敗しました";
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          {succeeded ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-success" />
              <div>
                <p className="font-medium">ご登録が完了しました</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  すべての学習コンテンツをご利用いただけます
                </p>
                {nextBillingDateLabel && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    次回のお支払い予定日: {nextBillingDateLabel}
                  </p>
                )}
              </div>
              <Button asChild>
                <Link href="/">ダッシュボードへ</Link>
              </Button>
            </>
          ) : (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button asChild variant="outline">
                <Link href="/upgrade">アップグレードページへ戻る</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
