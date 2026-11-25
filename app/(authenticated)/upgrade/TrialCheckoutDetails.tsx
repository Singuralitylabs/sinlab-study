import {
  CANCELLATION_POLICY_TEXT,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  PLAN_PAGE_TITLE,
  PROMOTION_CODE_NOTICE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

const MINOR_CONSENT_NOTICE =
  "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

type TrialCheckoutDetailsProps = {
  monthlyPriceLabel: string | null;
  checkoutDisabled: boolean;
};

/** Legal notice + Checkout for the trial general-plan dialog (#407). Order is load-bearing. */
export function TrialCheckoutDetails({
  monthlyPriceLabel,
  checkoutDisabled,
}: TrialCheckoutDetailsProps) {
  return (
    <div className="space-y-4">
      {monthlyPriceLabel && <p className="text-2xl font-bold">{monthlyPriceLabel}</p>}
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます</li>
        <li>お手続き完了後、すぐにご利用いただけます</li>
        <li>
          月額サブスクリプション（自動更新）です。解約手続きをしない限り、毎月自動で更新・請求されます
        </li>
        <li>お申し込み時に、初回分として1か月分の料金をお支払いいただきます</li>
        {/* Stripe counts months in UTC, so a signup before 09:00 JST on the 29th-31st can renew on
            the 1st of the next JST month; hence "around month-end", not "the last day". */}
        <li>
          以後は毎月、お申し込み日と同じ日が更新日となり、引き落としが行われます（その日がない月は月末前後の日）。次回のお支払い日は、お申し込み後に本画面で確認できます
        </li>
        <li>
          解約は、本画面（{PLAN_PAGE_TITLE}）の「{MANAGE_SUBSCRIPTION_BUTTON_LABEL}
          」からいつでもお手続きできます
        </li>
        <li>{CANCELLATION_POLICY_TEXT}</li>
      </ul>
      <p className="text-sm text-muted-foreground">{MINOR_CONSENT_NOTICE}</p>
      {checkoutDisabled && (
        <p className="text-sm text-destructive">
          {SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}
          。時間をおいてページを再読み込みしてください。
        </p>
      )}
      <p className="text-sm text-muted-foreground">{PROMOTION_CODE_NOTICE}</p>
      <UpgradeCheckoutButton disabled={checkoutDisabled} />
    </div>
  );
}
