/** 月額サブスクの請求日（毎月この日に決済する） */
export const BILLING_ANCHOR_DAY_OF_MONTH = 27;
/** 請求時刻（UTC基準。0 = JST 9:00） */
export const BILLING_ANCHOR_HOUR_UTC = 0;

/**
 * Stripeの最低請求額（JPY）。この金額を下回る請求はCheckout作成・決済が失敗しうるため、
 * アンカー直前に登録した場合の初回日割り額がこれを下回るかどうかの判定に用いる。
 */
export const STRIPE_MINIMUM_CHARGE_AMOUNT_JPY = 50;
