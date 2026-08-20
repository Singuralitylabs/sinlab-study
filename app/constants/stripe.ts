/** 月額サブスクの請求日（毎月この日に決済する） */
export const BILLING_ANCHOR_DAY_OF_MONTH = 27;
/** 請求時刻（UTC基準。0 = JST 9:00） */
export const BILLING_ANCHOR_HOUR_UTC = 0;

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
