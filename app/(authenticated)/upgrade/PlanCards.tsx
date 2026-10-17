"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY,
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
} from "@/app/constants/stripe";
import { USER_MEMBERSHIP_LABELS } from "@/app/constants/user";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const GENERAL_LABEL = USER_MEMBERSHIP_LABELS.general;
const COMMUNITY_LABEL = USER_MEMBERSHIP_LABELS.community;

const FALLBACK_GENERAL_PRICE = formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);
const COMMUNITY_PRICE = formatMonthlyJpyPrice(DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY);

type FeatureValue = string | readonly string[];

const PLAN_FEATURES: ReadonlyArray<{
  label: string;
  general: FeatureValue;
  community: FeatureValue;
}> = [
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
    community: [
      "限定講座・勉強会",
      "交流イベント",
      "限定サービス",
      "現役エンジニアへの相談",
      "Slackでのコミュニケーション",
      "Web/AIの最新情報",
    ],
  },
];

type PlanCardsProps = {
  /**
   * Trial checkout: pass the same label as the legal/Checkout heading (`monthlyPriceLabel`).
   * `null` means the monthly JPY amount is not confirmed — show "—" instead of the display
   * constant so the cards cannot contradict Checkout disablement (#394 / #407).
   * Omit for the community upsell cards (uses DISPLAY_* constants; not Checkout-adjacent).
   */
  generalPriceLabel?: string | null;
  /** Which plan card shows the 「現在のプラン」 badge and emphasized border. */
  currentPlan?: "general" | "community" | null;
  /** Body of the dialog opened from the general card (legal notice / Checkout). */
  generalDialog?: ReactNode;
  /** Body of the dialog opened from the community card (apply form). */
  communityDialog?: ReactNode;
  /**
   * Always-visible controls under the general card (e.g. ManageSubscriptionButton) so billing /
   * cancel stay easy to find without opening the dialog.
   */
  generalCardFooter?: ReactNode;
};

function FeatureValueView({ value }: { value: FeatureValue }) {
  if (typeof value === "string") {
    return <dd className="mt-0.5">{value}</dd>;
  }
  return (
    <dd className="mt-0.5">
      <ul className="list-disc list-inside space-y-1">
        {value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </dd>
  );
}

type PlanCardProps = {
  title: string;
  /** Reserved height on both cards so price/features align on sm+ (empty string = spacer). */
  subtitle: string;
  price: string;
  features: ReadonlyArray<{ label: string; value: FeatureValue }>;
  isCurrent: boolean;
  dialogContent?: ReactNode;
  dialogDescription: string;
  openLabel: string;
  cardFooter?: ReactNode;
};

function PlanCard({
  title,
  subtitle,
  price,
  features,
  isCurrent,
  dialogContent,
  dialogDescription,
  openLabel,
  cardFooter,
}: PlanCardProps) {
  const isOpenable = Boolean(dialogContent);

  const featuresBlock = (
    <dl className="space-y-3 px-6 text-sm">
      {features.map((feature) => (
        <div key={feature.label}>
          <dt className="font-medium text-muted-foreground">{feature.label}</dt>
          <FeatureValueView value={feature.value} />
        </div>
      ))}
    </dl>
  );

  const header = (
    <div className="flex flex-col gap-3 px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-base font-semibold leading-none">{title}</p>
          {/* Keep a subtitle row on both cards so price/features share the same baseline on sm+. */}
          <p
            className={cn(
              "text-xs text-muted-foreground min-h-[1rem]",
              !subtitle && "invisible select-none"
            )}
            aria-hidden={!subtitle || undefined}
          >
            {subtitle || "\u00a0"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isCurrent && <Badge variant="default">現在のプラン</Badge>}
          {isOpenable && (
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground group-focus-within:text-foreground"
            />
          )}
        </div>
      </div>
      <p className="text-2xl font-bold">{price}</p>
    </div>
  );

  if (!isOpenable) {
    return (
      <div
        className={cn(
          "bg-card text-card-foreground flex h-full flex-col gap-6 rounded-xl border py-6 shadow-sm",
          isCurrent && "border-primary ring-2 ring-primary/20"
        )}
        aria-current={isCurrent ? "true" : undefined}
      >
        {header}
        {featuresBlock}
        {cardFooter && <div className="mt-auto space-y-2 px-6 pt-2">{cardFooter}</div>}
      </div>
    );
  }

  return (
    <Dialog>
      <div
        className={cn(
          "group bg-card text-card-foreground flex h-full flex-col gap-6 rounded-xl border py-6 shadow-sm transition-colors",
          "has-[>button:hover]:border-primary/60 has-[>button:hover]:bg-accent/40",
          "has-[>button:focus-visible]:border-primary/60 has-[>button:focus-visible]:bg-accent/40",
          isCurrent && "border-primary ring-2 ring-primary/20"
        )}
        aria-current={isCurrent ? "true" : undefined}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={openLabel}
            className="flex flex-1 cursor-pointer flex-col gap-6 rounded-xl text-left focus-visible:outline-none"
          >
            {header}
            {featuresBlock}
          </button>
        </DialogTrigger>
        {cardFooter && <div className="mt-auto space-y-2 px-6 pt-2">{cardFooter}</div>}
      </div>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{dialogContent}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Side-by-side plan cards for /upgrade (#407). Stacks on small screens; details open in a dialog. */
export function PlanCards({
  generalPriceLabel,
  currentPlan = null,
  generalDialog,
  communityDialog,
  generalCardFooter,
}: PlanCardsProps = {}) {
  const generalPrice =
    generalPriceLabel === undefined ? FALLBACK_GENERAL_PRICE : (generalPriceLabel ?? "—");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PlanCard
        title={GENERAL_LABEL}
        subtitle=""
        price={generalPrice}
        features={PLAN_FEATURES.map((feature) => ({
          label: feature.label,
          value: feature.general,
        }))}
        isCurrent={currentPlan === "general"}
        dialogContent={generalDialog}
        dialogDescription="一般有料会員プランの内容とお申し込み・契約の手続き"
        openLabel={`${GENERAL_LABEL}の詳細を開く`}
        cardFooter={generalCardFooter}
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
        dialogContent={communityDialog}
        dialogDescription="コミュニティ会員プランの内容とお申し込み"
        openLabel={`${COMMUNITY_LABEL}の詳細を開く`}
      />
    </div>
  );
}
