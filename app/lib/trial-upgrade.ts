import {
  DISPLAY_MONTHLY_PRICE_JPY,
  formatMonthlyJpyPrice,
  isChargeableSubscriptionPrice,
  type SubscriptionPrice,
} from "@/app/constants/stripe";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import type { ContentType } from "@/app/types";

export type UpgradePriceResult = { status: "ok"; price: SubscriptionPrice } | { status: "failed" };

/**
 * Price text for the trial prompts: the live Stripe amount first, then DISPLAY_MONTHLY_PRICE_JPY
 * only when the fetch failed. A non-monthly/non-JPY price asserts no amount (null), like /upgrade.
 */
export function resolveUpgradePriceLabel(result: UpgradePriceResult): string | null {
  if (result.status === "failed") {
    return formatMonthlyJpyPrice(DISPLAY_MONTHLY_PRICE_JPY);
  }
  return isChargeableSubscriptionPrice(result.price)
    ? formatMonthlyJpyPrice(result.price.amount)
    : null;
}

/** Dashboard "next step" card: a member on trial who finished every trial-open content. */
export function shouldShowTrialNextStep(
  userStatus: string | null,
  userRole: string | null,
  themes: { totalContents: number; completedContents: number }[]
): boolean {
  if (userStatus !== USER_STATUS.TRIAL || userRole !== USER_ROLE.MEMBER) {
    return false;
  }
  const total = themes.reduce((sum, theme) => sum + theme.totalContents, 0);
  return total > 0 && themes.every((theme) => theme.completedContents >= theme.totalContents);
}

const FALLBACK_OVERVIEW_BY_TYPE: Record<ContentType, string> = {
  video: "このコンテンツでは動画で学びます",
  text: "このコンテンツではテキストで学びます",
  slide: "このコンテンツではスライドで学びます",
  exercise: "このコンテンツでは演習に取り組みます",
  quiz: "このコンテンツではクイズに答えて理解を確かめます",
};

export function getLockedContentFallbackOverview(contentType: ContentType): string {
  return FALLBACK_OVERVIEW_BY_TYPE[contentType];
}
