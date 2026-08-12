import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { USER_STATUS } from "@/app/constants/user";
import {
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  TERMINAL_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP");
}

function formatMonthlyPrice(amount: number, currency: string): string {
  if (currency.toLowerCase() !== "jpy") {
    // JPY以外は想定していない（複数通貨対応はスコープ外）ため、通貨コード付きでそのまま表示する
    return `${amount.toLocaleString("ja-JP")} ${currency.toUpperCase()} / 月`;
  }
  return `${amount.toLocaleString("ja-JP")}円 / 月`;
}

export default async function UpgradePage() {
  const { userId, userStatus } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  let subscriptionFetchFailed = false;
  let fetchedSubscription: {
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  } | null = null;
  if (userStatus === USER_STATUS.ACTIVE) {
    const { data, error } = await fetchStripeSubscriptionByUserId(userId);
    if (error) {
      subscriptionFetchFailed = true;
    } else {
      fetchedSubscription = data;
    }
  }
  // 解約済み（終端状態）の行が残っているだけの場合は「契約中」として扱わない
  const subscription =
    fetchedSubscription && !TERMINAL_SUBSCRIPTION_STATUSES.includes(fetchedSubscription.status)
      ? fetchedSubscription
      : null;

  let monthlyPriceLabel: string | null = null;
  if (userStatus === USER_STATUS.PENDING) {
    try {
      const price = await fetchSubscriptionPrice();
      if (price.amount !== null) {
        monthlyPriceLabel = formatMonthlyPrice(price.amount, price.currency);
      }
    } catch (error) {
      console.error("料金情報取得エラー:", error);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle
        title="アップグレード"
        description="一般有料会員になると、すべての学習コンテンツを利用できます"
      />

      <Card className="mt-6">
        <CardContent className="space-y-4">
          {userStatus === USER_STATUS.PENDING && (
            <>
              {monthlyPriceLabel && <p className="text-2xl font-bold">{monthlyPriceLabel}</p>}
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます</li>
                <li>月額サブスクリプションで、いつでも解約可能です</li>
                <li>お手続き完了後、すぐにご利用いただけます</li>
              </ul>
              <UpgradeCheckoutButton />
            </>
          )}

          {userStatus === USER_STATUS.ACTIVE && subscriptionFetchFailed && (
            <>
              <p className="text-sm text-destructive">
                ご契約状況の取得に失敗しました。時間をおいてページを再読み込みしてください。
              </p>
              {/* 契約状況が不明な間もお支払い管理・解約の導線は残す（/api/stripe/portal は
                  契約が無ければ404を返すため、契約が無いユーザーが押しても安全） */}
              <ManageSubscriptionButton />
            </>
          )}

          {userStatus === USER_STATUS.ACTIVE && !subscriptionFetchFailed && subscription && (
            <>
              <p className="text-sm">
                ご契約中です
                {subscription.current_period_end && (
                  <>
                    （
                    {subscription.cancel_at_period_end
                      ? `${formatDate(subscription.current_period_end)}をもって解約予定です`
                      : `次回のお支払い: ${formatDate(subscription.current_period_end)}`}
                    ）
                  </>
                )}
              </p>
              <ManageSubscriptionButton />
            </>
          )}

          {userStatus === USER_STATUS.ACTIVE && !subscriptionFetchFailed && !subscription && (
            <p className="text-sm text-muted-foreground">
              既に本登録済みです。すべての学習コンテンツをご利用いただけます。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
