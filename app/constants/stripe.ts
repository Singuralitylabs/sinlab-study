export const BILLING_ANCHOR_DAY_OF_MONTH = 27;
/** UTC hour; 0 = 09:00 JST. */
export const BILLING_ANCHOR_HOUR_UTC = 0;

/**
 * Legal display price (JPY, tax included; #134). /upgrade shows the live Stripe Price; this is the
 * fallback so
 * the legal notice never disappears when the fetch fails.
 */
export const DISPLAY_MONTHLY_PRICE_JPY = 1500;

export const MANAGE_SUBSCRIPTION_BUTTON_LABEL = "お支払い情報の管理・解約";

export const SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE =
  "料金を確認できないため、現在お申し込みを受け付けできません";

export type SubscriptionPrice = {
  amount: number | null;
  currency: string;
};

/**
 * Allow Checkout only for monthly JPY prices; non-monthly (amount: null) and non-JPY prices are
 * rejected
 * because they would diverge from the legal display.
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
 * check whether
 * the first proration for a signup just before the anchor falls below it.
 */
export const STRIPE_MINIMUM_CHARGE_AMOUNT_JPY = 50;

/**
 * Master switch for Stripe (temporarily off for the Vercel Hobby terms, #115). Fail-closed:
 * anything but "true"
 * is disabled. Code is kept; re-enable via env after the Cloudflare Workers cutover (see
 * AGENTS.md).
 * Lives here, not in stripe-server.ts, so modules like (authenticated)/layout.tsx don't pull the
 * Stripe SDK in.
 */
export function isStripeEnabled(): boolean {
  return process.env.STRIPE_ENABLED === "true";
}

export const STRIPE_DISABLED_MESSAGE = "現在準備中です";
