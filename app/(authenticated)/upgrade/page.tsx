import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
  isChargeableSubscriptionPrice,
  isStripeEnabled,
  logDisplayPriceDrift,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
  UPGRADE_BENEFITS,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  type SubscriptionPeriodFields,
  subscriptionPeriodLabel,
} from "@/app/lib/subscription-period";
import {
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

const FALLBACK_MONTHLY_PRICE_LABEL = formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);

const CANCELLATION_POLICY_TEXT = `解約時の日割り計算・返金はありません。解約手続き後も、当該請求期間の末日（次回${BILLING_ANCHOR_DAY_OF_MONTH}日）まで引き続きご利用いただけます。`;

const MINOR_CONSENT_NOTICE =
  "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

export default async function UpgradePage() {
  const { userId, userStatus } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const stripeEnabled = isStripeEnabled();

  let subscriptionFetchFailed = false;
  let fetchedSubscription: ({ status: string } & SubscriptionPeriodFields) | null = null;
  if (stripeEnabled && userStatus === USER_STATUS.ACTIVE) {
    const { data, error } = await fetchStripeSubscriptionByUserId(userId);
    if (error) {
      subscriptionFetchFailed = true;
    } else {
      fetchedSubscription = data;
    }
  }
  // Rows that are only terminal (canceled) or Checkout-in-progress remnants don't count as a
  // current contract.
  const subscription =
    fetchedSubscription && !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(fetchedSubscription.status)
      ? fetchedSubscription
      : null;
  const periodLabel = subscription ? subscriptionPeriodLabel(subscription) : null;

  // Only a confirmed actual price counts; don't enable Checkout when it is unconfirmed.
  let confirmedPrice: { amount: number; currency: string } | null = null;
  let priceFetchFailed = false;
  if (stripeEnabled && userStatus === USER_STATUS.TRIAL) {
    try {
      const price = await fetchSubscriptionPrice();
      if (isChargeableSubscriptionPrice(price)) {
        logDisplayPriceDrift(price.amount);
        confirmedPrice = price;
      }
    } catch (error) {
      priceFetchFailed = true;
      console.error("料金情報取得エラー:", error);
    }
  }

  const checkoutDisabled = confirmedPrice === null;
  // Fall back to the legal display only on fetch failure. Non-monthly/non-JPY prices don't assert a
  // monthly amount.
  const monthlyPriceLabel = confirmedPrice
    ? formatMonthlyJpyPrice(confirmedPrice.amount)
    : priceFetchFailed
      ? FALLBACK_MONTHLY_PRICE_LABEL
      : null;

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle
        title="アップグレード"
        description="一般有料会員になると、すべての学習コンテンツを利用できます"
      />

      <Card className="mt-6">
        <CardContent className="space-y-4">
          {userStatus === USER_STATUS.TRIAL &&
            (stripeEnabled ? (
              <>
                {monthlyPriceLabel && <p className="text-2xl font-bold">{monthlyPriceLabel}</p>}
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {UPGRADE_BENEFITS.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                  <li>お手続き完了後、すぐにご利用いただけます</li>
                  <li>
                    月額サブスクリプション（自動更新）です。解約手続きをしない限り、毎月自動で更新・請求されます
                  </li>
                  <li>
                    お支払いは全員一律で毎月{BILLING_ANCHOR_DAY_OF_MONTH}
                    日です。この日が更新日となり、引き落としが行われます
                  </li>
                  <li>
                    初回のみ、ご登録日から次回のお支払い日（{BILLING_ANCHOR_DAY_OF_MONTH}
                    日）までの日割り料金となります（登録タイミングによっては初回分が発生しない場合があります）
                  </li>
                  <li>
                    解約は、本画面（プラン・お支払い）の「{MANAGE_SUBSCRIPTION_BUTTON_LABEL}
                    」からいつでもお手続きできます
                  </li>
                  <li>{CANCELLATION_POLICY_TEXT}</li>
                </ul>
                {checkoutDisabled && (
                  <p className="text-sm text-destructive">
                    {SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}
                    。時間をおいてページを再読み込みしてください。
                  </p>
                )}
                <UpgradeCheckoutButton disabled={checkoutDisabled} />
                <p className="text-sm text-muted-foreground">{MINOR_CONSENT_NOTICE}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                アップグレード機能は現在準備中です。しばらくお待ちください。
              </p>
            ))}

          {userStatus === USER_STATUS.ACTIVE &&
            (!stripeEnabled ? (
              <p className="text-sm text-muted-foreground">
                既に本登録済みです。すべての学習コンテンツをご利用いただけます。
              </p>
            ) : subscriptionFetchFailed ? (
              <>
                <p className="text-sm text-destructive">
                  ご契約状況の取得に失敗しました。時間をおいてページを再読み込みしてください。
                </p>
                {/* Keep the billing-management/cancel entry even while contract status is unknown (/api/stripe/portal returns 404 without a contract, so pressing it is safe). */}
                <ManageSubscriptionButton />
              </>
            ) : subscription ? (
              <>
                <p className="text-sm">
                  ご契約中です
                  {periodLabel && `（${periodLabel}）`}
                </p>
                <ManageSubscriptionButton />
                <p className="text-sm text-muted-foreground">{CANCELLATION_POLICY_TEXT}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                既に本登録済みです。すべての学習コンテンツをご利用いただけます。
              </p>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
