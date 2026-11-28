"use client";

import { useState } from "react";
import {
  CANCELLATION_POLICY_TEXT,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  PLAN_PAGE_TITLE,
  PROMOTION_CODE_NOTICE,
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
  type SubscriptionPlan,
} from "@/app/constants/stripe";
import { cn } from "@/lib/utils";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

const MINOR_CONSENT_NOTICE =
  "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

/** One selectable plan. priceLabel null = amount not confirmed (no heading). */
export type CheckoutPlanOffer = {
  plan: SubscriptionPlan;
  priceLabel: string | null;
  checkoutDisabled: boolean;
};

/**
 * Billing terms per plan. Both renew from the signup date with no proration (contract-date
 * billing), so only the unit changes; the wording must match what Stripe actually charges.
 */
const PLAN_BILLING_TERMS: Record<
  SubscriptionPlan,
  { autoRenew: string; firstCharge: string; renewal: string }
> = {
  monthly: {
    autoRenew:
      "月額サブスクリプション（自動更新）です。解約手続きをしない限り、毎月自動で更新・請求されます",
    firstCharge: "お申し込み時に、初回分として1か月分の料金をお支払いいただきます",
    // Stripe counts months in UTC, so a signup before 09:00 JST renews on a JST date that can
    // differ from the signup day (1st -> previous month's end; 29th-31st -> next month's 1st).
    // Hence no promise of "the same day".
    renewal:
      "以後は1か月ごとに自動で更新・請求されます（更新日はお申し込み日と同じ日が基本ですが、月の日数やお申し込みの時刻によって前後することがあります）。次回のお支払い日は、お申し込み後に本画面で確認できます",
  },
  yearly: {
    autoRenew:
      "年額サブスクリプション（自動更新）です。解約手続きをしない限り、毎年自動で更新・請求されます",
    firstCharge: "お申し込み時に、初回分として1年分の料金をお支払いいただきます",
    // Same UTC caveat as monthly, plus Feb 29 signups renew around Feb 28 / Mar 1.
    renewal:
      "以後は1年ごとに自動で更新・請求されます（更新日はお申し込み日と同じ月日が基本ですが、うるう年やお申し込みの時刻によって前後することがあります）。次回のお支払い日は、お申し込み後に本画面で確認できます",
  },
};

type TrialCheckoutDetailsProps = {
  /** Monthly first; yearly only when its Price was confirmed (fail-closed). */
  offers: readonly CheckoutPlanOffer[];
};

/** Legal notice + Checkout for the trial general-plan dialog (#407). Order is load-bearing. */
export function TrialCheckoutDetails({ offers }: TrialCheckoutDetailsProps) {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | undefined>(offers[0]?.plan);
  const offer = offers.find((candidate) => candidate.plan === selectedPlan) ?? offers[0];
  if (!offer) {
    return null;
  }
  const terms = PLAN_BILLING_TERMS[offer.plan];

  return (
    <div className="space-y-4">
      {offers.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">プランを選択</legend>
          <div className="grid grid-cols-2 gap-2">
            {offers.map((candidate) => (
              <label
                key={candidate.plan}
                className={cn(
                  "flex cursor-pointer flex-col rounded-md border p-3 text-sm",
                  candidate.plan === offer.plan && "border-primary ring-1 ring-primary"
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="subscription-plan"
                    value={candidate.plan}
                    checked={candidate.plan === offer.plan}
                    onChange={() => setSelectedPlan(candidate.plan)}
                  />
                  {SUBSCRIPTION_PLAN_LABELS[candidate.plan]}
                </span>
                {candidate.priceLabel && (
                  <span className="mt-1 text-muted-foreground">{candidate.priceLabel}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {offer.priceLabel && <p className="text-2xl font-bold">{offer.priceLabel}</p>}
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます</li>
        <li>お手続き完了後、すぐにご利用いただけます</li>
        <li>{terms.autoRenew}</li>
        <li>{terms.firstCharge}</li>
        <li>{terms.renewal}</li>
        <li>
          解約は、本画面（{PLAN_PAGE_TITLE}）の「{MANAGE_SUBSCRIPTION_BUTTON_LABEL}
          」からいつでもお手続きできます
        </li>
        <li>{CANCELLATION_POLICY_TEXT}</li>
      </ul>
      <p className="text-sm text-muted-foreground">{MINOR_CONSENT_NOTICE}</p>
      {offer.checkoutDisabled && (
        <p className="text-sm text-destructive">
          {SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}
          。時間をおいてページを再読み込みしてください。
        </p>
      )}
      <p className="text-sm text-muted-foreground">{PROMOTION_CODE_NOTICE}</p>
      <UpgradeCheckoutButton plan={offer.plan} disabled={offer.checkoutDisabled} />
    </div>
  );
}
