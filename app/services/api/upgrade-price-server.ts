import { resolveUpgradePriceLabel } from "@/app/lib/trial-upgrade";
import { fetchSubscriptionPrice } from "./stripe-server";

/**
 * Upper bound for the Stripe call. These prompts sit on the main learning pages, and the Stripe SDK
 * default (80s plus retries) would stall them for every trial user during a Stripe incident.
 */
const UPGRADE_PRICE_TIMEOUT_MS = 2000;

/**
 * Price text for trial prompts; call only when isStripeEnabled(). A failed or slow Stripe fetch
 * falls back to DISPLAY_MONTHLY_PRICE_JPY so the prompt never breaks or delays the page it sits on.
 */
export async function fetchUpgradePriceLabel(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const price = await Promise.race([
      fetchSubscriptionPrice(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Stripe料金取得が${UPGRADE_PRICE_TIMEOUT_MS}msでタイムアウト`)),
          UPGRADE_PRICE_TIMEOUT_MS
        );
      }),
    ]);
    return resolveUpgradePriceLabel({ status: "ok", price });
  } catch (error) {
    console.error("料金情報取得エラー:", error);
    return resolveUpgradePriceLabel({ status: "failed" });
  } finally {
    clearTimeout(timer);
  }
}
