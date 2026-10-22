"use client";

import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { TECH_COMMUNITY_URL } from "@/app/constants/marketing";
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

const AI_REVIEW_FEATURE = `演習ごとに1日${AI_REVIEW_LIMITS.active.perContentPerDay}回まで再レビューできます（お試しは1課題につき${AI_REVIEW_LIMITS.trial.perContentLifetime}回）`;

type FeatureValue = string | readonly string[];

const PLAN_FEATURES: ReadonlyArray<{
  label: string;
  general: FeatureValue;
  community: FeatureValue;
}> = [
  {
    label: "学習コンテンツ",
    general: [
      "全テーマ・全フェーズのコンテンツを閲覧できます（お試しはお試し公開分のみ）",
      "全演習に取り組めます",
    ],
    community: "一般有料会員と同じ",
  },
  {
    label: "AIレビュー",
    general: AI_REVIEW_FEATURE,
    community: "一般有料会員と同じ",
  },
  {
    label: "もくもく会",
    general: "もくもく会に参加できます",
    community: "一般有料会員と同じ",
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

// Benefits are listed right above; keep this to one line so it does not repeat them.
const COMMUNITY_CARD_DESCRIPTION =
  "テックコミュニティ『シンギュラリティ・ラボ』のメンバー向けプランです。";

// On sm+ both cards share the grid's row tracks (header, one per feature, bottom) via nested
// subgrid so every feature row lines up; stacked cards on mobile need no alignment.
const FEATURE_ROWS = PLAN_FEATURES.length;
const GRID_ROW_VARS = {
  "--plan-feature-rows": FEATURE_ROWS,
  "--plan-body-rows": FEATURE_ROWS + 1,
  "--plan-card-rows": FEATURE_ROWS + 2,
} as CSSProperties;
const CARD_LAYOUT_CLASS =
  "sm:grid sm:grid-rows-subgrid sm:gap-y-0 sm:[grid-row:span_var(--plan-card-rows)]";
const BODY_LAYOUT_CLASS =
  "flex flex-col gap-6 sm:grid sm:grid-rows-subgrid sm:gap-y-0 sm:[grid-row:span_var(--plan-body-rows)]";

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
  /** Optional intro at the card bottom (community card; #472) so feature rows align across cards. */
  description?: string;
  features: ReadonlyArray<{ label: string; value: FeatureValue }>;
  isCurrent: boolean;
  dialogContent?: ReactNode;
  dialogDescription: string;
  openLabel: string;
  /** Link outside the dialog trigger so it does not open the modal (#472). */
  externalLink?: { href: string; label: string };
  cardFooter?: ReactNode;
};

function PlanCard({
  title,
  subtitle,
  price,
  description,
  features,
  isCurrent,
  dialogContent,
  dialogDescription,
  openLabel,
  externalLink,
  cardFooter,
}: PlanCardProps) {
  const isOpenable = Boolean(dialogContent);

  const featuresBlock = (
    <dl className="space-y-3 px-6 text-sm sm:grid sm:grid-rows-subgrid sm:[grid-row:span_var(--plan-feature-rows)]">
      {features.map((feature) => (
        <div key={feature.label}>
          <dt className="font-medium text-muted-foreground">{feature.label}</dt>
          <FeatureValueView value={feature.value} />
        </div>
      ))}
    </dl>
  );

  const header = (
    <div className="flex flex-col gap-3 px-6 sm:mb-6">
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

  // Keep the <a> outside the dialog <button> so the community site link does not open the apply
  // dialog (nested interactive content would also be invalid HTML; #472).
  const introBlock = (description || externalLink) && (
    <div className="space-y-2 border-t px-6 pt-4 text-sm">
      {description && <p className="text-muted-foreground">{description}</p>}
      {externalLink && (
        <a
          href={externalLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-primary underline-offset-4 hover:underline"
        >
          {externalLink.label}
        </a>
      )}
    </div>
  );

  const hasBottom = Boolean(introBlock || cardFooter);
  const bottomBlock = (
    <div className={cn("flex flex-col gap-6 sm:mt-6", !hasBottom && "max-sm:hidden")}>
      {introBlock}
      {cardFooter && <div className="space-y-2 px-6">{cardFooter}</div>}
    </div>
  );

  if (!isOpenable) {
    return (
      <div
        className={cn(
          "bg-card text-card-foreground flex h-full flex-col gap-6 rounded-xl border py-6 shadow-sm",
          CARD_LAYOUT_CLASS,
          isCurrent && "border-primary ring-2 ring-primary/20"
        )}
        aria-current={isCurrent ? "true" : undefined}
      >
        <div className={BODY_LAYOUT_CLASS}>
          {header}
          {featuresBlock}
        </div>
        {bottomBlock}
      </div>
    );
  }

  return (
    <Dialog>
      <div
        className={cn(
          "group bg-card text-card-foreground flex h-full flex-col gap-6 rounded-xl border py-6 shadow-sm transition-colors",
          CARD_LAYOUT_CLASS,
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
            className={cn(
              BODY_LAYOUT_CLASS,
              "cursor-pointer rounded-xl text-left focus-visible:outline-none"
            )}
          >
            {header}
            {featuresBlock}
          </button>
        </DialogTrigger>
        {bottomBlock}
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-y-0" style={GRID_ROW_VARS}>
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
        description={COMMUNITY_CARD_DESCRIPTION}
        features={PLAN_FEATURES.map((feature) => ({
          label: feature.label,
          value: feature.community,
        }))}
        isCurrent={currentPlan === "community"}
        dialogContent={communityDialog}
        dialogDescription="コミュニティ会員プランの内容とお申し込み"
        openLabel={`${COMMUNITY_LABEL}の詳細を開く`}
        externalLink={{
          href: TECH_COMMUNITY_URL,
          label: "シンギュラリティ・ラボについて詳しく見る",
        }}
      />
    </div>
  );
}
