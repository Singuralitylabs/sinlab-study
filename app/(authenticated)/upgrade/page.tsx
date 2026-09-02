import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  DISPLAY_MONTHLY_PRICE_JPY,
  isChargeableSubscriptionPrice,
  isStripeEnabled,
  logDisplayPriceDrift,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import {
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "./format-date";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

function formatMonthlyJpyPrice(amount: number): string {
  return `月額${amount.toLocaleString("ja-JP")}円（税込）`;
}

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
  let fetchedSubscription: {
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  } | null = null;
  if (stripeEnabled && userStatus === USER_STATUS.ACTIVE) {
    const { data, error } = await fetchStripeSubscriptionByUserId(userId);
    if (error) {
      subscriptionFetchFailed = true;
    } else {
      fetchedSubscription = data;
    }
  }
  // 解約済み（終端状態）・Checkout手続き中の行が残っているだけの場合は「契約中」として扱わない
  const subscription =
    fetchedSubscription && !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(fetchedSubscription.status)
      ? fetchedSubscription
      : null;

  // 確認できた実額だけを正とする。未確認時に Checkout を有効化しない
  let confirmedPrice: { amount: number; currency: string } | null = null;
  let priceFetchFailed = false;
  if (stripeEnabled && userStatus === USER_STATUS.PENDING) {
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
  // 取得失敗時のみフォールバックで法定表示を残す。非月額・非JPYは月額を断定しない
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
          {userStatus === USER_STATUS.PENDING &&
            (stripeEnabled ? (
              <>
                {monthlyPriceLabel && <p className="text-2xl font-bold">{monthlyPriceLabel}</p>}
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます</li>
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
                {/* 契約状況が不明な間もお支払い管理・解約の導線は残す（/api/stripe/portal は
                    契約が無ければ404を返すため、契約が無いユーザーが押しても安全） */}
                <ManageSubscriptionButton />
              </>
            ) : subscription ? (
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
