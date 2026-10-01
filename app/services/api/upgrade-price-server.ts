import { resolveUpgradePriceLabel } from "@/app/lib/trial-upgrade";
import { fetchSubscriptionPrice } from "./stripe-server";

/**
 * Price text for trial prompts; call only when isStripeEnabled(). A failed Stripe fetch falls back
 * to DISPLAY_MONTHLY_PRICE_JPY so the prompt never breaks the page it sits on.
 */
export async function fetchUpgradePriceLabel(): Promise<string | null> {
  try {
    return resolveUpgradePriceLabel({ status: "ok", price: await fetchSubscriptionPrice() });
  } catch (error) {
    console.error("料金情報取得エラー:", error);
    return resolveUpgradePriceLabel({ status: "failed" });
  }
}
