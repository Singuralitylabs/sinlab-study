import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { isFeedbackEnabled } from "@/app/constants/feedback";
import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
  isChargeableSubscriptionPrice,
  isStripeEnabled,
  logDisplayPriceDrift,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  PLAN_PAGE_TITLE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { USER_MEMBERSHIP, USER_MEMBERSHIP_LABELS, USER_STATUS } from "@/app/constants/user";
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
import { CommunityApplyButton } from "./CommunityApplyButton";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { PlanCards } from "./PlanCards";
import { PlanInquiryButton } from "./PlanInquiryButton";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

const FALLBACK_MONTHLY_PRICE_LABEL = formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);

const CANCELLATION_POLICY_TEXT = `解約時の日割り計算・返金はありません。解約手続き後も、当該請求期間の末日（次回${BILLING_ANCHOR_DAY_OF_MONTH}日）まで引き続きご利用いただけます。`;

const MINOR_CONSENT_NOTICE =
  "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

const COMMUNITY_APPLY_TEXT =
  "コミュニティ会員（シンラボ会員）への変更をご希望の方は、申し込みフォームからお申し込みください。運営が内容を確認し、承認後にご案内します。承認までお支払いは発生しません。";

export default async function UpgradePage() {
  const { userId, userStatus, membershipType } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const stripeEnabled = isStripeEnabled();
  const feedbackEnabled = isFeedbackEnabled();
  const isCommunity = membershipType === USER_MEMBERSHIP.COMMUNITY;
  const isGeneral = membershipType === USER_MEMBERSHIP.GENERAL;

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

  const communityApplyAction = (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{COMMUNITY_APPLY_TEXT}</p>
      <CommunityApplyButton />
      {feedbackEnabled && (
        <p className="text-sm text-muted-foreground">
          フォーム以外でのご相談は
          <span className="mx-1">
            <PlanInquiryButton compact />
          </span>
          からどうぞ。
        </p>
      )}
    </div>
  );

  const trialCheckoutAction = (
    <div className="space-y-2">
      {checkoutDisabled && (
        <p className="text-sm text-destructive">
          {SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}
          。時間をおいてページを再読み込みしてください。
        </p>
      )}
      <UpgradeCheckoutButton disabled={checkoutDisabled} />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title={PLAN_PAGE_TITLE}
        description="会員プランの内容と、お申し込み・契約状況を確認できます"
      />

      <div className="mt-6 space-y-6">
        {userStatus === USER_STATUS.TRIAL &&
          (stripeEnabled ? (
            <>
              {/* Checkout stays below the legal notice so learners can read terms before upgrading. */}
              <PlanCards generalPriceLabel={monthlyPriceLabel} />
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
                  解約は、本画面（{PLAN_PAGE_TITLE}）の「{MANAGE_SUBSCRIPTION_BUTTON_LABEL}
                  」からいつでもお手続きできます
                </li>
                <li>{CANCELLATION_POLICY_TEXT}</li>
              </ul>
              <p className="text-sm text-muted-foreground">{MINOR_CONSENT_NOTICE}</p>
              {trialCheckoutAction}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  プランの確認・変更機能は現在準備中です。しばらくお待ちください。
                </p>
              </CardContent>
            </Card>
          ))}

        {userStatus === USER_STATUS.ACTIVE && isCommunity && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm">現在のプラン：{USER_MEMBERSHIP_LABELS.community}</p>
              {!stripeEnabled ? (
                <p className="text-sm text-muted-foreground">お支払いは運営の案内に従います。</p>
              ) : subscriptionFetchFailed ? (
                <>
                  <p className="text-sm text-destructive">
                    ご契約状況の取得に失敗しました。時間をおいてページを再読み込みしてください。
                  </p>
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
                <p className="text-sm text-muted-foreground">お支払いは運営の案内に従います。</p>
              )}
            </CardContent>
          </Card>
        )}

        {userStatus === USER_STATUS.ACTIVE && !isCommunity && (
          <div className="space-y-6">
            <PlanCards
              currentPlan={isGeneral ? "general" : null}
              generalAction={
                !stripeEnabled ? (
                  <p className="text-sm text-muted-foreground">
                    既に本登録済みです。すべての学習コンテンツをご利用いただけます。
                  </p>
                ) : subscriptionFetchFailed ? (
                  <div className="space-y-3">
                    <p className="text-sm text-destructive">
                      ご契約状況の取得に失敗しました。時間をおいてページを再読み込みしてください。
                    </p>
                    {/* Keep the billing-management/cancel entry even while contract status is unknown (/api/stripe/portal returns 404 without a contract, so pressing it is safe). */}
                    <ManageSubscriptionButton />
                  </div>
                ) : subscription ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      ご契約中です
                      {periodLabel && `（${periodLabel}）`}
                    </p>
                    <ManageSubscriptionButton />
                    <p className="text-sm text-muted-foreground">{CANCELLATION_POLICY_TEXT}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    既に本登録済みです。すべての学習コンテンツをご利用いただけます。
                  </p>
                )
              }
              communityAction={isGeneral ? communityApplyAction : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
