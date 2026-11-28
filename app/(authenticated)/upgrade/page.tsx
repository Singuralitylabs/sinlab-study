import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { isFeedbackEnabled } from "@/app/constants/feedback";
import {
  CANCELLATION_POLICY_TEXT,
  DISPLAY_PRICE_JPY,
  formatPlanJpyPrice,
  isChargeableSubscriptionPrice,
  isStripeEnabled,
  logDisplayPriceDrift,
  PLAN_PAGE_TITLE,
  planOfBillingInterval,
  SUBSCRIPTION_PLAN_LABELS,
  type SubscriptionPlan,
} from "@/app/constants/stripe";
import { USER_MEMBERSHIP, USER_MEMBERSHIP_LABELS, USER_STATUS } from "@/app/constants/user";
import {
  type SubscriptionPeriodFields,
  subscriptionPeriodLabel,
} from "@/app/lib/subscription-period";
import { fetchCurrentAIReviewLimits } from "@/app/services/api/ai-review-settings-server";
import {
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
  priceIdForPlan,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { CommunityApplyButton } from "./CommunityApplyButton";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { PlanCards } from "./PlanCards";
import { PlanInquiryButton } from "./PlanInquiryButton";
import { type CheckoutPlanOffer, TrialCheckoutDetails } from "./TrialCheckoutDetails";

/**
 * Only a confirmed actual price enables Checkout. On fetch failure the legal display falls back to
 * DISPLAY_PRICE_JPY with Checkout disabled; a Price billing at another interval or currency shows
 * no amount at all (never assert an amount the Price does not charge).
 */
async function fetchPlanOffer(plan: SubscriptionPlan): Promise<CheckoutPlanOffer> {
  try {
    const price = await fetchSubscriptionPrice(plan);
    if (isChargeableSubscriptionPrice(price)) {
      logDisplayPriceDrift(price.amount, plan);
      return {
        plan,
        priceLabel: formatPlanJpyPrice(plan, price.amount),
        checkoutDisabled: false,
      };
    }
    return { plan, priceLabel: null, checkoutDisabled: true };
  } catch (error) {
    console.error(`料金情報取得エラー（${plan}）:`, error);
    return {
      plan,
      priceLabel: formatPlanJpyPrice(plan, DISPLAY_PRICE_JPY[plan]),
      checkoutDisabled: true,
    };
  }
}

/**
 * Monthly is always offered (its legal notice stays even when the price is unconfirmed). Yearly is
 * offered only when STRIPE_PRICE_ID_YEARLY is set and its real price was confirmed, so a broken
 * yearly setup hides the option instead of showing a disabled one.
 */
async function fetchCheckoutPlanOffers(): Promise<CheckoutPlanOffer[]> {
  const [monthly, yearly] = await Promise.all([
    fetchPlanOffer("monthly"),
    priceIdForPlan("yearly") ? fetchPlanOffer("yearly") : Promise.resolve(null),
  ]);
  return yearly && !yearly.checkoutDisabled ? [monthly, yearly] : [monthly];
}

const COMMUNITY_APPLY_TEXT =
  "コミュニティ会員（シンラボ会員）への変更をご希望の方は、申し込みフォームからお申し込みください。運営が内容を確認し、承認後にご案内します。承認までお支払いは発生しません。";

export default async function UpgradePage() {
  const { userId, userStatus, membershipType } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const limits = await fetchCurrentAIReviewLimits();
  const stripeEnabled = isStripeEnabled();
  const feedbackEnabled = isFeedbackEnabled();
  const isCommunity = membershipType === USER_MEMBERSHIP.COMMUNITY;
  const isGeneral = membershipType === USER_MEMBERSHIP.GENERAL;

  let subscriptionFetchFailed = false;
  let fetchedSubscription:
    | ({ status: string; billing_interval: string | null } & SubscriptionPeriodFields)
    | null = null;
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

  const planOffers =
    stripeEnabled && userStatus === USER_STATUS.TRIAL ? await fetchCheckoutPlanOffers() : [];
  // The card face lists every offered price so it cannot disagree with the dialog; "—" (null)
  // when monthly is unconfirmed, as before.
  const generalPriceLabel =
    planOffers.length > 0 && planOffers.every((offer) => offer.priceLabel !== null)
      ? planOffers.map((offer) => offer.priceLabel).join(" / ")
      : null;
  const subscriptionPlan = subscription
    ? planOfBillingInterval(subscription.billing_interval)
    : null;
  const contractDetail = [
    subscriptionPlan ? SUBSCRIPTION_PLAN_LABELS[subscriptionPlan] : null,
    periodLabel,
  ]
    .filter((part) => part !== null)
    .join("、");

  const communityApplyDialog = (
    <div className="space-y-4">
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

  // Active general: no dialog on the general card — status + manage stay on the card face.
  const generalCardFooter =
    userStatus === USER_STATUS.ACTIVE && !isCommunity ? (
      !stripeEnabled ? (
        <p className="text-sm text-muted-foreground">
          既に本登録済みです。すべての学習コンテンツをご利用いただけます。
        </p>
      ) : subscriptionFetchFailed ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            ご契約状況の取得に失敗しました。時間をおいてページを再読み込みしてください。
          </p>
          <ManageSubscriptionButton />
        </div>
      ) : subscription ? (
        <div className="space-y-2">
          <p className="text-sm">
            ご契約中です
            {contractDetail && `（${contractDetail}）`}
          </p>
          <ManageSubscriptionButton />
          <p className="text-sm text-muted-foreground">{CANCELLATION_POLICY_TEXT}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          既に本登録済みです。すべての学習コンテンツをご利用いただけます。
        </p>
      )
    ) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title={PLAN_PAGE_TITLE}
        description={
          stripeEnabled
            ? "会員プランの内容と、お申し込み・契約状況を確認できます"
            : "現在のプランを確認できます"
        }
      />

      <div className="mt-6 space-y-6">
        {userStatus === USER_STATUS.TRIAL &&
          (stripeEnabled ? (
            <PlanCards
              limits={limits}
              generalPriceLabel={generalPriceLabel}
              generalDialog={<TrialCheckoutDetails offers={planOffers} />}
              communityDialog={communityApplyDialog}
            />
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
                    {contractDetail && `（${contractDetail}）`}
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
          <PlanCards
            limits={limits}
            currentPlan={isGeneral ? "general" : null}
            communityDialog={isGeneral ? communityApplyDialog : undefined}
            generalCardFooter={generalCardFooter}
          />
        )}
      </div>
    </div>
  );
}
