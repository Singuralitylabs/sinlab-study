import type { PostgrestError } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  BILLING_ANCHOR_HOUR_UTC,
  STRIPE_MINIMUM_CHARGE_AMOUNT_JPY,
} from "@/app/constants/stripe";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

let cachedClient: Stripe | null = null;

/**
 * サブスクリプションが「終端状態」とみなせるステータス。
 * `stripe_subscriptions` は1ユーザー1行固定（DELETEなし・常にupsert）で更新されるため、
 * 一度契約したユーザーの行は解約後も残り続ける。これらのステータスの行は
 * 「現在は契約していない」とみなし、再契約の許可・管理画面でのバッジ表示から除外する。
 *
 * `paused` を含めるのは、Price側でトライアル期間を設定した場合に、支払い方法未登録の
 * ままトライアルが終了するとStripeがサブスクを`paused`へ遷移させるため。これを終端状態から
 * 除外すると、一度も支払わないまま`active`/`general`のまま留まり続けてしまう
 * （`ACTIVATABLE_SUBSCRIPTION_STATUSES`に`trialing`を含めていることの裏返し）。
 */
export const TERMINAL_SUBSCRIPTION_STATUSES = [
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused",
];

/**
 * サブスクリプションが「現に有効」とみなせるステータス。
 * checkout.session.completed のWebhook・successページからの会員昇格は、このステータスの
 * ときのみ行う。Checkout Sessionは決済後もStripe側に不変オブジェクトとして残るため、
 * `payment_status === 'paid'` だけを見ると、解約後にsuccessページのURLを再訪しただけで
 * 無償のまま昇格してしまう（サブスクの現在状態を見ないため）。同様に、コンビニ払い等の
 * 遅延通知系決済手段では未入金（`incomplete`）でも checkout.session.completed が発火するため、
 * このガードが無いと未入金のまま昇格してしまう。
 */
export const ACTIVATABLE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

/**
 * successページで「決済確認済み」とみなすCheckout Sessionの`payment_status`。
 * 通常は`paid`だが、Price側でトライアル期間が設定されている場合は決済が発生せず
 * `no_payment_required`になる（Webhook側は`ACTIVATABLE_SUBSCRIPTION_STATUSES`に
 * `trialing`を含めており昇格させるため、successページ側だけ`paid`限定にすると
 * トライアル時に「決済情報を確認できませんでした」という誤ったエラー表示になってしまう）。
 */
export const PAID_CHECKOUT_PAYMENT_STATUSES: Stripe.Checkout.Session.PaymentStatus[] = [
  "paid",
  "no_payment_required",
];

/**
 * Stripeクライアントを取得する。STRIPE_SECRET_KEY 未設定時はthrowする
 * （Webhook・Checkout・Portalいずれの経路でも、決済系の呼び出し前に必ず失敗させるため）。
 */
export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_SECRET_KEY");
  }
  cachedClient = new Stripe(secretKey);
  return cachedClient;
}

function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("Stripe環境変数が設定されていません: NEXT_PUBLIC_APP_URL");
  }
  return appUrl;
}

/**
 * 月額サブスクリプションのCheckoutセッションを作成する。
 * client_reference_id と metadata の双方に user_id を含めることで、
 * Webhookイベント側でどちらが取れても本人特定できるようにする。
 *
 * `existingCustomerId` が渡された場合（解約済み等で過去にCustomerが作成済みの場合）は
 * それを再利用する。渡さないと毎回新規Customerが作成され、保存済みカード・請求履歴ごと
 * 旧Customerが孤児化し、Customer Portalからも参照できなくなるため。
 * Stripe APIの仕様上 `customer` と `customer_email` は併用できないため、
 * 再利用時は `customer_email` を渡さない（既存Customerに登録済みのメールが使われる）。
 * 保存済みCustomerがStripe側で見つからない場合（`resource_missing`）は、新規Customerでの
 * 作成にフォールバックする（そうしないと該当ユーザーが恒久的にCheckoutへ進めなくなるため）。
 */
export async function createCheckoutSession(
  userId: number,
  authId: string,
  email: string | undefined,
  existingCustomerId: string | null = null,
  now: Date = new Date()
): Promise<{ url: string }> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_PRICE_ID");
  }
  const appUrl = getAppUrl();
  const stripe = getStripeClient();
  // 日割り額が最低請求額を下回る場合に限り無償化する（「最低請求額の考慮」参照）。
  // customerIdの有無に依存しないため、リトライも含め1回だけ判定すればよい
  const prorationBehavior: Stripe.Checkout.SessionCreateParams.SubscriptionData.ProrationBehavior =
    (await isProrationBelowMinimum(now)) ? "none" : "create_prorations";

  const buildParams = (customerId: string | null): Stripe.Checkout.SessionCreateParams => ({
    mode: "subscription",
    // コンビニ払い・銀行振込等の遅延通知系決済手段は使わずカードのみに限定する。
    // これらはcheckout.session.completed発火時点でsubscription.statusがincomplete
    // （未入金）のままになり得るため、Checkoutから戻った瞬間に利用開始できるという
    // 設計上の前提（会員化のタイミング）が崩れる
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: String(userId),
    ...(customerId ? { customer: customerId } : email ? { customer_email: email } : {}),
    metadata: { user_id: String(userId), auth_id: authId },
    subscription_data: {
      metadata: { user_id: String(userId), auth_id: authId },
      // 決済日を全ユーザー一律で毎月27日（UTC 0:00 = JST 9:00）に固定する。
      // hour/minute/secondを省略するとサブスク作成時刻がそのまま使われ、
      // ユーザーごとに請求時刻がバラつくため明示する
      billing_cycle_anchor_config: {
        day_of_month: BILLING_ANCHOR_DAY_OF_MONTH,
        hour: BILLING_ANCHOR_HOUR_UTC,
        minute: 0,
        second: 0,
      },
      proration_behavior: prorationBehavior,
    },
    success_url: `${appUrl}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/upgrade`,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(buildParams(existingCustomerId));
  } catch (error) {
    // 保存済みCustomerがStripe側で削除済み等で存在しない場合、再利用を諦めて
    // 新規Customerでの作成にフォールバックする（そうしないと、当該ユーザーは
    // 恒久的にCheckoutへ進めなくなってしまう）
    const isMissingCustomer =
      existingCustomerId &&
      error instanceof Stripe.errors.StripeError &&
      error.code === "resource_missing" &&
      error.param === "customer";
    if (!isMissingCustomer) {
      throw error;
    }
    session = await stripe.checkout.sessions.create(buildParams(null));
  }

  if (!session.url) {
    throw new Error("Stripe Checkoutセッションの作成に失敗しました");
  }

  return { url: session.url };
}

/** Stripe Customer Portalセッションを作成する（お支払い情報の管理・解約） */
export async function createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
  const appUrl = getAppUrl();
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/upgrade`,
  });

  return { url: session.url };
}

/** Checkoutセッションをsession_idで取得する（successページでの決済確認用） */
export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return await stripe.checkout.sessions.retrieve(sessionId);
}

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPrice: { data: Stripe.Price; expiresAt: number } | null = null;

/**
 * サブスクリプション用Priceを取得する（生の `Stripe.Price` を返す）。
 * Priceはほぼ不変（変更は運用者がダッシュボードで行う稀な操作）のため、呼び出しのたびに
 * Stripe APIを呼ぶのを避けるモジュールスコープのTTLキャッシュを持つ（`getStripeClient()`の
 * `cachedClient`と同じパターン）。サーバーレス環境ではインスタンスごとのキャッシュになるが、
 * ウォームインスタンスの再利用時には有効。`fetchSubscriptionPrice()` と
 * `isProrationBelowMinimum()` の双方から利用する共通キャッシュ。
 */
async function getCachedPrice(): Promise<Stripe.Price> {
  if (cachedPrice && cachedPrice.expiresAt > Date.now()) {
    return cachedPrice.data;
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_PRICE_ID");
  }
  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(priceId);

  cachedPrice = { data: price, expiresAt: Date.now() + PRICE_CACHE_TTL_MS };
  return price;
}

/**
 * 月額（1ヶ月間隔）サブスクリプションのPrice情報を取得する（/upgrade ページでの料金表示用）。
 * `unit_amount` はJPY（ゼロdecimal通貨）を前提にそのまま円額として扱う
 * （複数通貨対応はスコープ外。Slack支払い失敗通知の金額表示と同じ前提）。
 * 設定されたPriceが1ヶ月間隔でない場合は `amount: null` を返し、呼び出し側で料金非表示にする
 * （「/ 月」表示と実際の請求間隔の食い違いを避けるため）。
 */
export async function fetchSubscriptionPrice(): Promise<{
  amount: number | null;
  currency: string;
}> {
  const price = await getCachedPrice();
  const isPlainMonthly =
    price.recurring?.interval === "month" && (price.recurring.interval_count ?? 1) === 1;

  return {
    amount: isPlainMonthly ? price.unit_amount : null,
    currency: price.currency,
  };
}

/**
 * 次回・前回の請求アンカー時刻（毎月 `BILLING_ANCHOR_DAY_OF_MONTH` 日
 * `BILLING_ANCHOR_HOUR_UTC` 時・UTC）を、`now` を基準に算出する。
 * `nextAnchor - previousAnchor` が初回課金の「満額換算での1周期」の長さになる
 * （Stripeの日割り計算と同様、月の長さ・うるう年を自動的に考慮できる）。
 */
function getBillingAnchorWindow(now: Date): { previousAnchor: Date; nextAnchor: Date } {
  const anchorInMonth = (monthOffset: number) =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + monthOffset,
        BILLING_ANCHOR_DAY_OF_MONTH,
        BILLING_ANCHOR_HOUR_UTC,
        0,
        0
      )
    );

  const anchorThisMonth = anchorInMonth(0);
  const nextAnchor = now < anchorThisMonth ? anchorThisMonth : anchorInMonth(1);
  const previousAnchor = new Date(
    Date.UTC(
      nextAnchor.getUTCFullYear(),
      nextAnchor.getUTCMonth() - 1,
      BILLING_ANCHOR_DAY_OF_MONTH,
      BILLING_ANCHOR_HOUR_UTC,
      0,
      0
    )
  );
  return { previousAnchor, nextAnchor };
}

/**
 * `now` に登録した場合、初回の日割り請求額がStripeの最低請求額（JPY ¥50）を
 * 下回るかどうかを判定する。アンカー直前（27日 8:xx〜9:xx JST頃）の登録に限り
 * `true` を返し、呼び出し側は `proration_behavior: "none"` に切り替える
 * （「最低請求額の考慮」参照。無償になるのは長くても数時間分のため抜け道にはならない）。
 *
 * JPY以外・金額未設定など想定外のPrice設定の場合は判定できないため `false`
 * （＝日割りあり）を返し、安全側の挙動（Stripe側のエラーで気付ける）に倒す。
 */
export async function isProrationBelowMinimum(now: Date = new Date()): Promise<boolean> {
  const price = await getCachedPrice();
  if (price.currency.toLowerCase() !== "jpy" || price.unit_amount === null) {
    return false;
  }

  const { previousAnchor, nextAnchor } = getBillingAnchorWindow(now);
  const remainingMs = nextAnchor.getTime() - now.getTime();
  const fullPeriodMs = nextAnchor.getTime() - previousAnchor.getTime();
  const proratedAmount = Math.round((price.unit_amount * remainingMs) / fullPeriodMs);

  return proratedAmount < STRIPE_MINIMUM_CHARGE_AMOUNT_JPY;
}

/**
 * ユーザー自身のサブスクリプション状態を取得する（/upgrade ページの表示用）。
 * RLSにより本人 or admin の行のみ取得できる通常クライアントを使う。
 */
export async function fetchStripeSubscriptionByUserId(userId: number): Promise<{
  data: {
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  } | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("stripe_subscriptions")
    .select("status, cancel_at_period_end, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("サブスクリプション取得エラー:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Service Roleキーの設定を明示的に検証する。
 * createAdminSupabaseClient() は未設定時にCookieクライアントへ静かにフォールバックするため、
 * Cookieの無いWebhook文脈では黙って失敗しRLSに阻まれる。Stripe系の書き込み前に必ず呼ぶ。
 */
export function assertServiceRoleConfigured(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Stripe関連の書き込みにはService Roleキーが必須です"
    );
  }
}
