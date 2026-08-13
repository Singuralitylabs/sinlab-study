import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import {
  fetchStripeSubscriptionByUserId,
  PAID_CHECKOUT_PAYMENT_STATUSES,
  retrieveCheckoutSession,
} from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  extractUserId,
} from "@/app/services/api/stripe-webhook-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

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

  if (userId && sessionId) {
    try {
      const session = await retrieveCheckoutSession(sessionId);
      const sessionUserId = extractUserId(session.client_reference_id, session.metadata);

      if (
        !PAID_CHECKOUT_PAYMENT_STATUSES.includes(session.payment_status) ||
        sessionUserId !== userId
      ) {
        errorMessage = "決済情報を確認できませんでした";
      } else {
        // Webhookより先にここへ遷移してくる場合があるため、successページ側でも
        // 同じ冪等な昇格処理を呼ぶ（Webhookと重複実行しても安全）
        const { error, activated } = await activateUserFromCheckoutSession(session);
        if (error) {
          console.error("会員昇格エラー:", error);
          errorMessage = "会員登録の反映に失敗しました。時間をおいて再度お試しください";
        } else if (!activated) {
          // 解約済み等のセッションURL再訪・未入金など、実際には昇格しなかったケース。
          // 権限は変わっていないため、成功表示は出さない
          errorMessage = "このお申し込みは現在有効ではありません";
        } else {
          succeeded = true;
          // 日割りで少額決済された直後のため、次に満額が請求される日を示して
          // 問い合わせを減らす。取得に失敗しても完了画面自体は表示する（表示のみ省略）
          const { data: subscription } = await fetchStripeSubscriptionByUserId(userId);
          if (subscription?.current_period_end) {
            nextBillingDateLabel = formatDate(subscription.current_period_end);
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
