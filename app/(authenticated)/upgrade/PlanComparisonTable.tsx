import {
  DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY,
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
} from "@/app/constants/stripe";
import { USER_MEMBERSHIP_LABELS } from "@/app/constants/user";

const GENERAL_LABEL = USER_MEMBERSHIP_LABELS.general;
const COMMUNITY_LABEL = USER_MEMBERSHIP_LABELS.community;

const FALLBACK_GENERAL_PRICE = formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);
const COMMUNITY_PRICE = formatMonthlyJpyPrice(DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY);

type PlanComparisonTableProps = {
  /**
   * Trial checkout: pass the same label as the legal/Checkout heading (`monthlyPriceLabel`).
   * `null` means the monthly JPY amount is not confirmed — show "—" instead of the display
   * constant so the table cannot contradict Checkout disablement (#394 review).
   * Omit for the community upsell table (uses DISPLAY_* constants; not Checkout-adjacent).
   */
  generalPriceLabel?: string | null;
};

/** Plan matrix for /upgrade (#394). */
export function PlanComparisonTable({ generalPriceLabel }: PlanComparisonTableProps = {}) {
  const generalPrice =
    generalPriceLabel === undefined ? FALLBACK_GENERAL_PRICE : (generalPriceLabel ?? "—");

  const rows = [
    {
      label: "価格",
      general: generalPrice,
      community: COMMUNITY_PRICE,
    },
    {
      label: "学習コンテンツ",
      general: "閲覧・演習の提出",
      community: "一般有料会員と同じ",
    },
    {
      label: "AIレビュー",
      general: "利用可",
      community: "利用可",
    },
    {
      label: "コミュニティ特典",
      general: "—",
      community: "限定講座・勉強会、交流イベント、限定サービス、現役エンジニアへの相談",
    },
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">会員プランの比較</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="py-2 pr-3 font-medium">
              項目
            </th>
            <th scope="col" className="py-2 px-3 font-medium">
              {GENERAL_LABEL}
            </th>
            <th scope="col" className="py-2 pl-3 font-medium">
              {COMMUNITY_LABEL}
              <span className="block text-xs font-normal text-muted-foreground">
                （シンラボ会員）
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b align-top">
              <th scope="row" className="py-2 pr-3 font-medium text-muted-foreground">
                {row.label}
              </th>
              <td className="py-2 px-3">{row.general}</td>
              <td className="py-2 pl-3">{row.community}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
