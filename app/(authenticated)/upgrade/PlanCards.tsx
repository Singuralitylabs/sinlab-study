import type { ReactNode } from "react";
import {
  DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY,
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
} from "@/app/constants/stripe";
import { USER_MEMBERSHIP_LABELS } from "@/app/constants/user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GENERAL_LABEL = USER_MEMBERSHIP_LABELS.general;
const COMMUNITY_LABEL = USER_MEMBERSHIP_LABELS.community;

const FALLBACK_GENERAL_PRICE = formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);
const COMMUNITY_PRICE = formatMonthlyJpyPrice(DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY);

const PLAN_FEATURES = [
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

type PlanCardsProps = {
  /**
   * Trial checkout: pass the same label as the legal/Checkout heading (`monthlyPriceLabel`).
   * `null` means the monthly JPY amount is not confirmed — show "—" instead of the display
   * constant so the cards cannot contradict Checkout disablement (#394 / #407).
   * Omit for the community upsell cards (uses DISPLAY_* constants; not Checkout-adjacent).
   */
  generalPriceLabel?: string | null;
  /** Which plan card shows the 「ご契約中」 badge and emphasized border. */
  currentPlan?: "general" | "community" | null;
  generalAction?: ReactNode;
  communityAction?: ReactNode;
};

type PlanCardProps = {
  title: string;
  subtitle?: string;
  price: string;
  features: ReadonlyArray<{ label: string; value: string }>;
  isCurrent: boolean;
  action?: ReactNode;
};

function PlanCard({ title, subtitle, price, features, isCurrent, action }: PlanCardProps) {
  return (
    <Card
      className={cn("h-full", isCurrent && "border-primary ring-2 ring-primary/20")}
      aria-current={isCurrent ? "true" : undefined}
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {isCurrent && <Badge variant="default">ご契約中</Badge>}
        </div>
        <p className="text-2xl font-bold">{price}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <dl className="space-y-3 text-sm">
          {features.map((feature) => (
            <div key={feature.label}>
              <dt className="font-medium text-muted-foreground">{feature.label}</dt>
              <dd className="mt-0.5">{feature.value}</dd>
            </div>
          ))}
        </dl>
        {action && <div className="mt-auto space-y-2 pt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

/** Side-by-side plan cards for /upgrade (#407). Stacks on small screens. */
export function PlanCards({
  generalPriceLabel,
  currentPlan = null,
  generalAction,
  communityAction,
}: PlanCardsProps = {}) {
  const generalPrice =
    generalPriceLabel === undefined ? FALLBACK_GENERAL_PRICE : (generalPriceLabel ?? "—");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PlanCard
        title={GENERAL_LABEL}
        price={generalPrice}
        features={PLAN_FEATURES.map((feature) => ({
          label: feature.label,
          value: feature.general,
        }))}
        isCurrent={currentPlan === "general"}
        action={generalAction}
      />
      <PlanCard
        title={COMMUNITY_LABEL}
        subtitle="（シンラボ会員）"
        price={COMMUNITY_PRICE}
        features={PLAN_FEATURES.map((feature) => ({
          label: feature.label,
          value: feature.community,
        }))}
        isCurrent={currentPlan === "community"}
        action={communityAction}
      />
    </div>
  );
}
