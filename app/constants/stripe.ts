/** 月額サブスクの請求日（毎月この日に決済する） */
export const BILLING_ANCHOR_DAY_OF_MONTH = 27;
/** 請求時刻（UTC基準。0 = JST 9:00） */
export const BILLING_ANCHOR_HOUR_UTC = 0;

/**
 * 法務部指示（#134）の表示用月額料金（JPY・税込）。`/upgrade` の料金表示は
 * `fetchSubscriptionPrice()` による Stripe Price の動的取得を正とするが、
 * 取得失敗時にも法定表示が消えないよう、この定数をフォールバックに使う。
 */
export const DISPLAY_MONTHLY_PRICE_JPY = 1500;

/** `/upgrade` と Customer Portal 導線で共有する解約・支払い管理ボタンのラベル */
export const MANAGE_SUBSCRIPTION_BUTTON_LABEL = "お支払い情報の管理・解約";

/** 実請求額を確認できないときに画面・Checkout API で共有する案内 */
export const SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE =
  "料金を確認できないため、現在お申し込みを受け付けできません";

export type SubscriptionPrice = {
  amount: number | null;
  currency: string;
};

/**
 * Checkout を許可してよい月額JPY料金か。非月額（`amount: null`）と非JPYは、
 * 法定表示（税込円額）と実請求が食い違うため拒否する。
 */
export function isChargeableSubscriptionPrice(
  price: SubscriptionPrice
): price is { amount: number; currency: string } {
  return price.amount !== null && price.currency.toLowerCase() === "jpy";
}

/** 取得できた実額と法定表示フォールバックの乖離をログに残す（Checkout は実額を正とする） */
export function logDisplayPriceDrift(amount: number): void {
  if (amount !== DISPLAY_MONTHLY_PRICE_JPY) {
    console.error(
      `Stripe Price(${amount}) が DISPLAY_MONTHLY_PRICE_JPY(${DISPLAY_MONTHLY_PRICE_JPY}) と異なります`
    );
  }
}

/**
 * Stripeの最低請求額（JPY）。この金額を下回る請求はCheckout作成・決済が失敗しうるため、
 * アンカー直前に登録した場合の初回日割り額がこれを下回るかどうかの判定に用いる。
 */
export const STRIPE_MINIMUM_CHARGE_AMOUNT_JPY = 50;

/**
 * Stripe決済機能が有効かどうかを判定する。Vercel Hobbyプランの利用規約対応のための
 * 暫定停止フラグ（#115）。未設定または `"true"` 以外の値は無効として扱うフェイルクローズ。
 * コード自体は削除せず、Cloudflare Workersへのカットオーバー完了後に環境変数側で再有効化する
 * （詳細はCLAUDE.mdの「Stripeサブスク決済（月額課金）」節を参照）。
 *
 * `stripe-server.ts` ではなくここに置くのは、Stripe SDKへの依存を持たないため。
 * 認証済み全ページを包む `(authenticated)/layout.tsx` など、決済処理を行わない箇所からの
 * 参照でも、Stripe SDK一式をモジュールグラフに引き込まずに済む。
 */
export function isStripeEnabled(): boolean {
  return process.env.STRIPE_ENABLED === "true";
}

/** 決済機能停止中に各APIルートが返す503応答の共通メッセージ（3ルートでの重複を避ける） */
export const STRIPE_DISABLED_MESSAGE = "現在準備中です";
