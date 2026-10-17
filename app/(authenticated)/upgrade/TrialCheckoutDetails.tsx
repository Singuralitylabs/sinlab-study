import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  MANAGE_SUBSCRIPTION_BUTTON_LABEL,
  PLAN_PAGE_TITLE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

const CANCELLATION_POLICY_TEXT = `解約時の日割り計算・返金はありません。解約手続き後も、当該請求期間の末日（次回${BILLING_ANCHOR_DAY_OF_MONTH}日）まで引き続きご利用いただけます。`;

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
      {checkoutDisabled && (
        <p className="text-sm text-destructive">
          {SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}
          。時間をおいてページを再読み込みしてください。
        </p>
      )}
      <UpgradeCheckoutButton disabled={checkoutDisabled} />
    </div>
  );
}
