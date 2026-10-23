import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";

export const BILLING_ANCHOR_DAY_OF_MONTH = 27;
/** UTC hour; 0 = 09:00 JST. */
export const BILLING_ANCHOR_HOUR_UTC = 0;

/**
 * Legal display price (JPY, tax included; #134). /upgrade shows the live Stripe Price; this is the
 * fallback so the legal notice never disappears when the fetch fails. The /login service intro also
 * uses this constant when payments are enabled (unauthenticated screens don't call Stripe; no price
 * text when disabled). When changing the price, update the Stripe Price, this constant and the LP
 * together.
 */
export const DISPLAY_MONTHLY_PRICE_JPY = 1500;

/** Community membership list price (JPY, tax included; #394). Manual approval only for now (#395). */
export const DISPLAY_COMMUNITY_MONTHLY_PRICE_JPY = 3000;

/**
 * External Google Form for community membership applications (#408).
 * Replace when Stripe auto-enrollment for community lands (#395).
 */
export const COMMUNITY_APPLY_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfC8IXtoqTw_vYT3-SVS_JRQAYZMmve1UCaEJcbUcFhn1PHlg/viewform";

export function formatMonthlyJpyPrice(amount: number): string {
  return `月額${amount.toLocaleString("ja-JP")}円（税込）`;
}

/** Page title / nav / settings / email copy for /upgrade (#394). Trial CTA copy keeps 「アップグレード」. */
export const PLAN_PAGE_TITLE = "プランの確認・変更";

/**
 * Value copy for the trial-to-paid prompts only. Not used on /upgrade: that page sits next to the
 * legal notice right before Checkout, so its description of what is provided must stay exact.
 */
export const UPGRADE_BENEFITS = [
  "すべての学習コンテンツ",
  `演習のAIレビュー（${AI_REVIEW_LIMITS.active.perContentPerDay}回/課題/日、全課題の合計で${AI_REVIEW_LIMITS.active.perDay}回/日まで）`,
  "もくもく会への参加",
] as const;

/** Shown instead of a CTA when payments are disabled (same branching as the trial banner). */
export const UPGRADE_APPROVAL_NOTICE = "本登録は運営の承認で行います。承認後に閲覧できます";

export const MANAGE_SUBSCRIPTION_BUTTON_LABEL = "お支払い情報の管理・解約";

/** Shared cancellation copy for /upgrade legal notice and active-subscription cards. */
export const CANCELLATION_POLICY_TEXT = `解約時の日割り計算・返金はありません。解約手続き後も、当該請求期間の末日（次回${BILLING_ANCHOR_DAY_OF_MONTH}日）まで引き続きご利用いただけます。`;

export const SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE =
  "料金を確認できないため、現在お申し込みを受け付けできません";

export type SubscriptionPrice = {
  amount: number | null;
  currency: string;
};

/**
 * Allow Checkout only for monthly JPY prices; non-monthly (amount: null) and non-JPY prices are
 * rejected because they would diverge from the legal display.
 */
export function isChargeableSubscriptionPrice(
  price: SubscriptionPrice
): price is { amount: number; currency: string } {
  return price.amount !== null && price.currency.toLowerCase() === "jpy";
}

/** Log drift between the fetched amount and the fallback (Checkout uses the real amount). */
export function logDisplayPriceDrift(amount: number): void {
  if (amount !== DISPLAY_MONTHLY_PRICE_JPY) {
    console.error(
      `Stripe Price(${amount}) が DISPLAY_MONTHLY_PRICE_JPY(${DISPLAY_MONTHLY_PRICE_JPY}) と異なります`
    );
  }
}

/**
 * Stripe's minimum charge (JPY). Charges below it can fail at Checkout/payment, so this is used to
 * check whether the first proration for a signup just before the anchor falls below it.
 */
export const STRIPE_MINIMUM_CHARGE_AMOUNT_JPY = 50;

/**
 * Master switch for Stripe (temporarily off for the Vercel Hobby terms, #115). Fail-closed:
 * anything but "true" is disabled. Code is kept; re-enable via env after the Cloudflare Workers
 * cutover (see AGENTS.md). Lives here, not in stripe-server.ts, so modules like
 * (authenticated)/layout.tsx don't pull the Stripe SDK in.
 */
export function isStripeEnabled(): boolean {
  return process.env.STRIPE_ENABLED === "true";
}

export const STRIPE_DISABLED_MESSAGE = "現在準備中です";

/**
 * How long after its creation an event for an own object with no mirror row yet is still answered
 * with a retry request (#321). Out-of-order delivery normally resolves within seconds, but a
 * checkout.session.completed that itself failed and waits in Stripe's backoff (hours apart) keeps
 * the mirror row missing for longer, so the window is a day. A mirror row that never appears
 * (a subscription replaced by a newer contract, a permanently rejected Checkout) would otherwise
 * be redelivered until Stripe disables the endpoint.
 */
export const MIRROR_PENDING_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
