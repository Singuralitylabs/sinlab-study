import { createHash } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  BILLING_ANCHOR_DAY_OF_MONTH,
  BILLING_ANCHOR_HOUR_UTC,
  STRIPE_MINIMUM_CHARGE_AMOUNT_JPY,
} from "@/app/constants/stripe";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

// Stripe SDKに依存しない呼び出し元（layout.tsx等）が、この判定のためだけにSDK一式を
// モジュールグラフへ引き込まずに済むよう、実体は app/constants/stripe.ts に置き再exportする。
// 既にこのファイルの他のexportを使っているAPIルート・ページからは変更なく利用できる。
export { isStripeEnabled } from "@/app/constants/stripe";

/** StripeがCheckout Sessionの`expires_at`に要求する最小許容値（作成時刻からの経過時間） */
const MIN_CHECKOUT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * `expires_at` 算出時の安全マージン。`now`（関数呼び出し時点の時刻）と、Stripeが実際に
 * Checkout Sessionを作成する時刻（`now` 取得後のPrice取得API呼び出し・ネットワーク往復を
 * 経て確定する）には数百ms〜数秒のずれが生じうる。`now + MIN_CHECKOUT_SESSION_LIFETIME_MS`
 * ちょうどを指定すると、このずれ分だけStripe側の最低30分要件を割り込みCheckout作成が
 * 失敗しうるため、余裕を持たせる。
 */
const CHECKOUT_SESSION_EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;

/**
 * Checkout Sessionに設定する有効期間。Stripe既定の24時間ではなく最小限（30分＋安全マージン）に
 * 固定する。放置された処理権をTTLで解放する設計（`CHECKOUT_CLAIM_TTL_MINUTES`）では、
 * TTL経過時点で古いセッションが必ず失効している必要があるため（詳細は
 * `createCheckoutSession()` の`expires_at`のコメントを参照）。
 */
const CHECKOUT_SESSION_LIFETIME_MS =
  MIN_CHECKOUT_SESSION_LIFETIME_MS + CHECKOUT_SESSION_EXPIRY_SAFETY_MARGIN_MS;

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
 * Checkout作成の処理権（claim）を確保している行だけが持つステータスの番兵値。
 * Stripeの`subscription.status`には存在しない値で、「Checkout Sessionを作ろうとしているが
 * まだ契約は成立していない」ことを表す。`stripe_subscriptions.user_id` のUNIQUE制約を
 * 排他制御に使うため、Stripe呼び出しの前にこの値でミラー行をINSERTする（#103）。
 */
export const CHECKOUT_PENDING_STATUS = "checkout_pending";

/**
 * 「現に契約が記録されていない」とみなせるステータス。終端状態に加えて、契約成立前の
 * 手続き中行（CHECKOUT_PENDING_STATUS）を含む。契約中バッジ・`/upgrade` の契約中表示・
 * リプレイ判定など「現行契約の有無」を見る箇所は、終端状態だけでなくこちらを使う
 * （手続き中行を契約中と誤表示しないため）。
 */
export const NON_CURRENT_SUBSCRIPTION_STATUSES = [
  ...TERMINAL_SUBSCRIPTION_STATUSES,
  CHECKOUT_PENDING_STATUS,
];

/**
 * claimを確保してからCheckout Sessionが実際に作成されるまでの猶予。
 * `claimCheckoutSlot()` の時刻（`claimedAt`）と、Stripeがセッションを作る時刻には、
 * Customer作成・DB書き込み・リトライ分のずれがある。TTLをこの分だけ上乗せすることで、
 * 「TTL経過時点で当該セッションは必ず失効している」という不等号を構造的に保証する。
 */
const CHECKOUT_CLAIM_GRACE_MS = 10 * 60 * 1000;

/**
 * Checkout作成の処理権が放置されたとみなすまでの時間。これを超えたclaimは他のリクエストが
 * 奪い直せる（`stripe_events` のclaim TTLと同じ救済）。
 *
 * セッションの状態をStripeに問い合わせられない場合の**フォールバック**であり、通常は
 * `claimCheckoutSlot()` が既存セッションの状態（open / expired / complete）を見て
 * 再利用・奪取・待機を判断するため、ここまで待たされることはない。
 * セッション有効期限より必ず長くなるよう、定数から導出する（逆転すると、まだ決済可能な
 * 古いセッションを残したまま次のCheckoutを作れてしまい二重契約の窓が再び開く）。
 */
export const CHECKOUT_CLAIM_TTL_MS = CHECKOUT_SESSION_LIFETIME_MS + CHECKOUT_CLAIM_GRACE_MS;

/**
 * 記録漏れのセッションを照会する際、作成時刻の下限に持たせる余裕（秒）。
 * 処理権の確保時刻（アプリのDB）とStripeがセッションを作成した時刻には時計のずれがあるため。
 */
const CLAIM_LOOKUP_SKEW_SEC = 120;

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
 * `customerId` には、`ensureCheckoutCustomer()` がユーザーごとに一意に確保・永続化した
 * Stripe Customerを必ず渡す。`customer_email` によるStripe側の暗黙のCustomer作成に頼ると、
 * Checkoutのたびに別Customerが作られ、保存済みカード・請求履歴の分裂に加えて、
 * ミラー行に載らないCustomerの契約（＝Portalから解約できない契約）を生むため。
 * 保存済みCustomerがStripe側に存在しない場合の作り直しは、DBへの保存を伴うため
 * 呼び出し元（`createCheckoutSessionForUser()`）が行う。
 */
export async function createCheckoutSession(
  userId: number,
  authId: string,
  customerId: string,
  now: Date = new Date()
): Promise<{ url: string; id: string }> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_PRICE_ID");
  }
  const appUrl = getAppUrl();
  const stripe = getStripeClient();
  // 日割り額が最低請求額を下回る場合に限り無償化する（「最低請求額の考慮」参照）。
  // Price取得の一時的な失敗（Stripe側の障害・レート制限等）でCheckout作成自体を
  // 失敗させないよう、判定に失敗した場合は安全側（日割りあり）にフォールバックする
  let belowMinimum = false;
  try {
    belowMinimum = await isProrationBelowMinimum(now);
  } catch (error) {
    console.error("最低請求額判定エラー:", error);
  }
  const prorationBehavior: Stripe.Checkout.SessionCreateParams.SubscriptionData.ProrationBehavior =
    belowMinimum ? "none" : "create_prorations";

  // 有効期限はStripe既定の24時間ではなく、最低許容値（30分）＋安全マージンに固定する。
  // 理由は2つある。
  // 1. 二重Checkoutの排他（claimCheckoutSlot）は、放置された手続き中行を
  //    CHECKOUT_CLAIM_TTL_MINUTES 経過後に解放して救済する。TTL経過時点で古いセッションが
  //    まだ決済可能だと、新旧2つのセッションが同時に成立しうる（本来防ぎたい二重契約の再現）。
  //    セッション有効期限をTTLより短く固定することで、この窓を閉じる
  // 2. 無償化（proration_behavior: "none"）の判定根拠は「アンカーまでの残り時間が短い」ことだが、
  //    セッションを無償ウィンドウ内に開始しつつアンカー通過後まで決済を遅らせて完了されると、
  //    Stripeがサブスク作成時点で次のアンカー（さらに1ヶ月先）を採用してしまい、意図せず
  //    約1ヶ月分が無償になりうる（このガード自体が排除しようとした抜け道の再現）。
  //    アンカーまで32分以上ある間は必ずアンカー前に失効するため、これも同時に防げる
  //    （アンカーまで32分未満の場合はStripeの最低30分要件により防げないが、無償ウィンドウ
  //    自体が数時間〜半日程度の中のさらに一部でしかなく実害は小さい。完全に排除するには
  //    「アンカー直前は新規Checkout作成を一時停止する」設計が必要でスコープ外）
  const expiresAtUnix = Math.floor((now.getTime() + CHECKOUT_SESSION_LIFETIME_MS) / 1000);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // コンビニ払い・銀行振込等の遅延通知系決済手段は使わずカードのみに限定する。
    // これらはcheckout.session.completed発火時点でsubscription.statusがincomplete
    // （未入金）のままになり得るため、Checkoutから戻った瞬間に利用開始できるという
    // 設計上の前提（会員化のタイミング）が崩れる
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: String(userId),
    customer: customerId,
    expires_at: expiresAtUnix,
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

  if (!session.url) {
    throw new Error("Stripe Checkoutセッションの作成に失敗しました");
  }

  return { url: session.url, id: session.id };
}

/**
 * Checkout Sessionの作成・記録に失敗したことを表すエラー。
 *
 * `claimReleasable` は「Stripe側に有効なCheckout Sessionが残っていないと確定できるか」。
 * falseの場合、呼び出し元は処理権を**解放してはならない**。解放すると、記録されていない
 * 有効なセッションを残したまま次のCheckoutを作れてしまい二重契約になる（残った処理権は
 * `claimCheckoutSlot()` の復旧（Customerに紐づく有効セッションの再利用）またはTTLで解ける）。
 */
export class CheckoutCreationError extends Error {
  constructor(
    message: string,
    readonly claimReleasable: boolean,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "CheckoutCreationError";
  }
}

/**
 * Stripeが「そのリクエストを処理せずに拒否した」と確定できるか（4xx応答）。
 * 通信タイムアウト・5xx・不明なエラーでは、Stripe側でCheckout Sessionが作成されている
 * 可能性を排除できないため false を返す。
 */
function isDefinitelyNotCreated(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return false;
  }
  const status = error.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

/** Checkout作成が「保存済みCustomerがStripe側に存在しない」ことで失敗したか */
function isMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeError &&
    error.code === "resource_missing" &&
    error.param === "customer"
  );
}

/**
 * ユーザーに対応するStripe Customerを一意に確保する。既に確保済み（ミラー行に保存済み）なら
 * それを再利用し、無い場合のみ作成してミラー行へ保存する。
 *
 * Checkout Sessionに`customer_email`だけを渡す方式（Stripe側でCustomerが暗黙に作られる）だと、
 * 並行・連続してCheckoutを作成した際にユーザーごとのCustomerが分裂し、ミラー行に載らなかった
 * 側の契約が `/api/stripe/portal`（ミラーの`stripe_customer_id`しか見ない）から解約できなく
 * なる。作成前にCustomerを確定・永続化することでこれを防ぐ。
 *
 * 作成時のidempotency keyをユーザー単位で固定するのは、作成直後にDB保存へ到達できずに
 * リトライされた場合でも、Stripe側に同じCustomerを返させて孤児Customerを増やさないため
 * （Stripeのidempotency keyは24時間有効）。ただしStripeは「同じkeyで異なるパラメータ」を
 * エラー（idempotency_error）にするため、keyにはメールアドレスのハッシュも含める
 * （メール変更を挟んだリトライで24時間Checkoutできなくなるのを防ぐ）。
 *
 * @param claimedAt 呼び出し元が保持しているclaimの時刻。この値の行にだけ書き込むことで、
 * TTL経過でclaimを奪われていた場合に、別リクエストが確保したCustomerを上書きしない
 */
export async function ensureCheckoutCustomer(
  userId: number,
  authId: string,
  email: string | undefined,
  existingCustomerId: string | null,
  claimedAt: string
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }
  return await createAndSaveCustomer(
    userId,
    authId,
    email,
    claimedAt,
    customerIdempotencyKey(userId, email)
  );
}

/**
 * Customer作成のidempotency key。ユーザー単位で固定しつつ、パラメータ（メールアドレス）が
 * 変わったときはkeyも変える（Stripeは同一keyでのパラメータ不一致をエラーにするため）。
 */
function customerIdempotencyKey(userId: number, email: string | undefined): string {
  const emailHash = createHash("sha256")
    .update(email ?? "")
    .digest("hex")
    .slice(0, 16);
  return `checkout-customer-${userId}-${emailHash}`;
}

async function createAndSaveCustomer(
  userId: number,
  authId: string,
  email: string | undefined,
  claimedAt: string,
  idempotencyKey: string
): Promise<string> {
  // 保存できない環境でCustomerだけ作ると孤児化するため、Stripeを呼ぶ前に検証する
  assertServiceRoleConfigured();

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    { email, metadata: { user_id: String(userId), auth_id: authId } },
    { idempotencyKey }
  );

  const supabase = await createAdminSupabaseClient();
  const { data: saved, error } = await supabase
    .from("stripe_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", userId)
    .eq("checkout_claimed_at", claimedAt)
    .select("id");

  if (error) {
    console.error("Stripe Customer保存エラー:", error.message);
    throw new Error("Stripe Customerの保存に失敗しました");
  }
  if ((saved?.length ?? 0) === 0) {
    // TTL経過でclaimを奪われた等。Customerを保存できないままCheckoutへ進むと、
    // ミラーに載らない契約（Portalから解約できない契約）を生むため中断する
    throw new Error("Checkout作成の処理権が失われました");
  }

  return customer.id;
}

/**
 * Checkout作成の処理権を確保済みのユーザーに対して、Customerの確保からCheckout Session作成
 * までを行う。保存済みCustomerが（ダッシュボードでの削除等により）Stripe側に存在しない場合は、
 * Customerを作り直して保存したうえで1度だけ再試行する（そうしないと当該ユーザーが恒久的に
 * Checkoutへ進めなくなるため）。作り直し時のidempotency keyには失われたCustomer IDを含め、
 * 「同じ喪失に対しては同じCustomerを返す」冪等性を保つ。
 */
export async function createCheckoutSessionForUser(
  userId: number,
  authId: string,
  email: string | undefined,
  existingCustomerId: string | null,
  claimedAt: string,
  now: Date = new Date()
): Promise<{ url: string }> {
  const customerId = await ensureCheckoutCustomer(
    userId,
    authId,
    email,
    existingCustomerId,
    claimedAt
  );

  let session: { url: string; id: string };
  try {
    session = await createSessionWithCustomerRecovery(
      userId,
      authId,
      email,
      customerId,
      claimedAt,
      now
    );
  } catch (error) {
    // Stripeが4xxで拒否した場合のみ「セッションは作られていない」と確定できる。
    // 通信タイムアウト・5xxでは作成済みの可能性が残るため、処理権を解放させない
    throw new CheckoutCreationError(
      "Checkoutセッションの作成に失敗しました",
      isDefinitelyNotCreated(error),
      error
    );
  }

  // 記録できないと、このセッションと進行中の処理権を紐付けられなくなり、古い成功ページURLの
  // リプレイで処理権が解除された場合に「有効なセッションが2つ」の窓が開く。作ったばかりの
  // セッションを失効させ、有効なセッションを残さない状態にしてから失敗させる
  const saved = await saveCheckoutSessionId(userId, claimedAt, session.id);
  if (!saved) {
    const expired = await expireCheckoutSession(session.id);
    throw new CheckoutCreationError("Checkoutセッションを記録できませんでした", expired);
  }

  return { url: session.url };
}

/**
 * Checkout Sessionを作成する。保存済みCustomerが（ダッシュボードでの削除等により）Stripe側に
 * 存在しない場合は、Customerを作り直して保存したうえで1度だけ再試行する（そうしないと当該
 * ユーザーが恒久的にCheckoutへ進めなくなるため）。
 */
async function createSessionWithCustomerRecovery(
  userId: number,
  authId: string,
  email: string | undefined,
  customerId: string,
  claimedAt: string,
  now: Date
): Promise<{ url: string; id: string }> {
  try {
    return await createCheckoutSession(userId, authId, customerId, now);
  } catch (error) {
    if (!isMissingCustomerError(error)) {
      throw error;
    }
    const replacementId = await createAndSaveCustomer(
      userId,
      authId,
      email,
      claimedAt,
      `${customerIdempotencyKey(userId, email)}-replace-${customerId}`
    );
    return await createCheckoutSession(userId, authId, replacementId, now);
  }
}

/** Checkout Sessionを失効させる。失効できたかを返す（既に完了・失効済みの場合はfalse） */
async function expireCheckoutSession(sessionId: string): Promise<boolean> {
  try {
    const stripe = getStripeClient();
    await stripe.checkout.sessions.expire(sessionId);
    return true;
  } catch (error) {
    console.error("Checkoutセッション失効エラー:", error);
    return false;
  }
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
 * Priceが「1ヶ月間隔の定期課金」であるかを判定する。`BILLING_ANCHOR_DAY_OF_MONTH` を
 * 用いたアンカー計算・日割り額の概算は月次課金を前提としているため、年額プラン等の
 * 誤設定を検知して呼び出し側で安全側に倒すために使う（`fetchSubscriptionPrice()` と
 * `isProrationBelowMinimum()` の双方で共有する）。
 */
function isPlainMonthlyPrice(price: Stripe.Price): boolean {
  return price.recurring?.interval === "month" && (price.recurring.interval_count ?? 1) === 1;
}

/**
 * 月額（1ヶ月間隔）サブスクリプションのPrice情報を取得する（/upgrade ページでの料金表示用）。
 * `unit_amount` はJPY（ゼロdecimal通貨）を前提にそのまま円額として扱う
 * （複数通貨対応はスコープ外。Slack支払い失敗通知の金額表示と同じ前提）。
 * 設定されたPriceが1ヶ月間隔でない場合は `amount: null` を返し、呼び出し側で
 * Checkout を拒否する（「/ 月」表示と実際の請求間隔の食い違いを避けるため）。
 */
export async function fetchSubscriptionPrice(): Promise<{
  amount: number | null;
  currency: string;
}> {
  const price = await getCachedPrice();

  return {
    amount: isPlainMonthlyPrice(price) ? price.unit_amount : null,
    currency: price.currency,
  };
}

/** 指定した年・月（0始まり月インデックス）における請求アンカー時刻（UTC）を構築する */
function anchorAt(year: number, monthIndex: number): Date {
  return new Date(
    Date.UTC(year, monthIndex, BILLING_ANCHOR_DAY_OF_MONTH, BILLING_ANCHOR_HOUR_UTC, 0, 0)
  );
}

/**
 * 次回・前回の請求アンカー時刻（毎月 `BILLING_ANCHOR_DAY_OF_MONTH` 日
 * `BILLING_ANCHOR_HOUR_UTC` 時・UTC）を、`now` を基準に算出する。
 * `nextAnchor - previousAnchor` が初回課金の「満額換算での1周期」の長さになる
 * （Stripeの日割り計算と同様、月の長さ・うるう年を自動的に考慮できる）。
 */
function getBillingAnchorWindow(now: Date): { previousAnchor: Date; nextAnchor: Date } {
  const anchorThisMonth = anchorAt(now.getUTCFullYear(), now.getUTCMonth());
  const nextAnchor =
    now < anchorThisMonth ? anchorThisMonth : anchorAt(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const previousAnchor = anchorAt(nextAnchor.getUTCFullYear(), nextAnchor.getUTCMonth() - 1);
  return { previousAnchor, nextAnchor };
}

/**
 * `now` に登録した場合、初回の日割り請求額がStripeの最低請求額（JPY ¥50）を
 * 下回るかどうかを判定する。アンカー直前の登録に限り `true` を返し、呼び出し側は
 * `proration_behavior: "none"` に切り替える（「最低請求額の考慮」参照）。
 *
 * 無償化されるウィンドウの長さは月額に反比例する（月額¥3000なら約12.4時間、
 * 月額が低いほど広がる）。最大でも1ヶ月弱を無償利用できる全面 `"none"` 採用時とは
 * 規模が異なるため抜け道にはならない、という判断のもとで採用している。
 *
 * JPY以外・金額未設定・1ヶ月間隔でないPrice（`isPlainMonthlyPrice()` が偽）など
 * 想定外のPrice設定の場合は判定できないため `false`（＝日割りあり）を返し、
 * 安全側の挙動（Stripe側のエラーで気付ける）に倒す。アンカー窓（月次）を前提にした
 * 概算のため、`fetchSubscriptionPrice()` と同じ月次判定を課している。
 */
export async function isProrationBelowMinimum(now: Date = new Date()): Promise<boolean> {
  const price = await getCachedPrice();
  if (price.currency.toLowerCase() !== "jpy" || price.unit_amount === null) {
    return false;
  }
  if (!isPlainMonthlyPrice(price)) {
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
 * `claimCheckoutSlot()` の結果。
 * - claimed: 処理権を確保できた（新規・解放済み・失効セッションの奪取）
 * - reusable: 有効なCheckout Sessionが既にあるため、そのURLを再利用する
 * - conflict: 契約中、または決済完了済みで反映待ち
 */
export type CheckoutSlotClaim =
  | { outcome: "claimed"; claimedAt: string; stripeCustomerId: string | null }
  | { outcome: "reusable"; url: string }
  | { outcome: "conflict" }
  | { outcome: "error"; message: string };

/** 奪ってよいclaimの状態。`takeCheckoutSlot()` の条件付きUPDATEに載せる */
type ClaimCondition =
  | { kind: "released" } // 解放済み（checkout_claimed_at IS NULL）
  | { kind: "stale"; before: string } // TTLを超えて放置された
  | { kind: "held"; claimedAt: string }; // 参照した時点のclaimがそのまま残っている

/**
 * Checkout作成の処理権をユーザー単位で原子的に確保する（#103）。**Stripe Session を作る前に**
 * 呼ぶこと。
 *
 * `stripe_subscriptions.user_id` のUNIQUE制約を排他制御に使い、「決済手続き中」を表す行
 * （status = CHECKOUT_PENDING_STATUS）のINSERTをclaimとする（`stripe_events` のclaimと同じ
 * パターン）。素のSELECTで既存行の有無を見るだけでは、決済完了までミラー行が存在しない
 * 時間帯に並行リクエストがすり抜け、2つのCheckout Sessionが作られてしまう。
 *
 * 既に行がある場合は、契約が記録されておらず（NON_CURRENT_SUBSCRIPTION_STATUSES）かつ
 * 奪ってよいclaimの行だけを条件付きUPDATEで奪う。UPDATEの条件判定と書き込みは同一
 * ステートメント内で行われるため、並行実行時は1つだけが1行を更新できる（PostgreSQLが
 * 行ロック取得後に条件を再評価するため、SELECT→UPDATEのようなレースにならない）。
 *
 * 有効なclaimが残っている場合は、その claim が持つCheckout Sessionの状態で分岐する。
 * - open（まだ決済できる）: 新しいセッションを作らず同じURLを返す。これにより、手続きを
 *   中断したユーザーがTTLまで締め出されることも、2つのセッションが並存することもない
 * - expired（失効済み）: 参照した claim をそのまま奪う（CAS）
 * - complete（決済済みで反映待ち）: 奪わない。奪うと決済済みの契約の上にもう1件作れてしまう
 * Stripeへ問い合わせられない場合（セッション未記録・API障害）のみ、TTLによる救済に委ねる。
 *
 * @returns claimed の `stripeCustomerId` は既存行に保存済みのCustomer（再利用対象。
 * 新規ユーザーはnull）
 */
export async function claimCheckoutSlot(
  userId: number,
  now: Date = new Date()
): Promise<CheckoutSlotClaim> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();
  const claimedAt = now.toISOString();

  // 行が無ければINSERT自体がclaimになる（新規Customerのため stripeCustomerId は必ずnull）
  const { error: insertError } = await supabase.from("stripe_subscriptions").insert({
    user_id: userId,
    status: CHECKOUT_PENDING_STATUS,
    checkout_claimed_at: claimedAt,
  });

  if (!insertError) {
    return { outcome: "claimed", claimedAt, stripeCustomerId: null };
  }
  // 一意制約違反（PostgreSQLエラーコード23505）以外はDBエラーとして呼び出し元に伝播する
  if (insertError.code !== "23505") {
    console.error("Checkout処理権のclaimエラー:", insertError.message);
    return { outcome: "error", message: insertError.message };
  }

  // 既に行がある。まず「claim解放済み（checkout_claimed_at IS NULL）」の行を奪う。
  // 解約済みの行が残っているだけのユーザーの再契約は、通常こちらの経路になる
  const released = await takeCheckoutSlot(supabase, userId, claimedAt, { kind: "released" });
  if (released.outcome !== "conflict") {
    return released;
  }

  // 奪えなかった＝契約中か、他の手続きが進行中。どちらかを既存行から判定する
  const { data: existing, error: fetchError } = await supabase
    .from("stripe_subscriptions")
    .select("status, checkout_claimed_at, checkout_session_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("Checkout処理権の状態取得エラー:", fetchError.message);
    return { outcome: "error", message: fetchError.message };
  }
  // 契約中（終端状態でも手続き中でもない）は再契約させない
  if (!existing || !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(existing.status)) {
    return { outcome: "conflict" };
  }

  const heldClaimedAt = existing.checkout_claimed_at;
  if (heldClaimedAt) {
    const resolution = await resolveHeldSession(
      existing.checkout_session_id,
      existing.stripe_customer_id,
      heldClaimedAt
    );
    if (resolution.kind === "reusable") {
      return { outcome: "reusable", url: resolution.url };
    }
    if (resolution.kind === "blocked") {
      return { outcome: "conflict" };
    }
    if (resolution.kind === "finished") {
      // 有効なセッションが無いと確認できたので、TTLを待たずに奪う
      return await takeCheckoutSlot(supabase, userId, claimedAt, {
        kind: "held",
        claimedAt: heldClaimedAt,
      });
    }
  }

  // 状態を確認できない場合（Stripeが応答しない・Customerも未確保）のみ、TTLによる救済に委ねる
  const staleBefore = new Date(now.getTime() - CHECKOUT_CLAIM_TTL_MS).toISOString();
  return await takeCheckoutSlot(supabase, userId, claimedAt, {
    kind: "stale",
    before: staleBefore,
  });
}

/**
 * 有効な処理権が保持しているCheckout Sessionの状況を判定する。
 * - reusable: まだ決済できるセッションがある（同じURLへ案内する）
 * - blocked: 決済済みで反映待ち（奪ってはいけない）
 * - finished: 有効なセッションが無いと確認できた（奪ってよい）
 * - unknown: Stripeへ確認できなかった（TTLに委ねる）
 *
 * セッションidが記録されていない場合（記録前に中断した場合など）は、Customerに紐づく
 * 「処理権の確保以降に作られたセッション」を照会して同じ判定を行う。記録漏れのまま
 * 有効なセッションが残っているケースを、TTLを待たずに拾い上げるため。
 */
async function resolveHeldSession(
  sessionId: string | null,
  customerId: string | null,
  claimedAt: string
): Promise<
  | { kind: "reusable"; url: string }
  | { kind: "blocked" }
  | { kind: "finished" }
  | { kind: "unknown" }
> {
  const sessions = sessionId
    ? await retrieveClaimedSession(sessionId)
    : await listSessionsSinceClaim(customerId, claimedAt);

  if (sessions === null) {
    return { kind: "unknown" };
  }
  const openSession = sessions.find((session) => session.status === "open" && session.url);
  if (openSession?.url) {
    return { kind: "reusable", url: openSession.url };
  }
  if (sessions.some((session) => session.status === "complete")) {
    return { kind: "blocked" };
  }
  return { kind: "finished" };
}

/** claimが保持しているCheckout Sessionを取得する。取得できない場合はnull（TTL判定に委ねる） */
async function retrieveClaimedSession(
  sessionId: string
): Promise<Stripe.Checkout.Session[] | null> {
  try {
    return [await retrieveCheckoutSession(sessionId)];
  } catch (error) {
    console.error("手続き中Checkoutセッションの取得エラー:", error);
    return null;
  }
}

/**
 * 処理権の確保以降に当該Customerで作られたCheckout Sessionを列挙する。
 * 作成時刻の下限を処理権の確保時刻に置くことで、過去の契約で完了したセッションを
 * 拾わないようにする（拾うと再契約が不当にブロックされる）。
 */
async function listSessionsSinceClaim(
  customerId: string | null,
  claimedAt: string
): Promise<Stripe.Checkout.Session[] | null> {
  if (!customerId) {
    // Customerすら確保できていない＝セッションは作られていないが、確証は持てないためTTLに委ねる
    return null;
  }
  try {
    const stripe = getStripeClient();
    const createdAfter = Math.floor(new Date(claimedAt).getTime() / 1000) - CLAIM_LOOKUP_SKEW_SEC;
    const list = await stripe.checkout.sessions.list({
      customer: customerId,
      created: { gte: createdAfter },
      limit: 10,
    });
    return list.data;
  } catch (error) {
    console.error("手続き中Checkoutセッションの照会エラー:", error);
    return null;
  }
}

/**
 * `claimCheckoutSlot()` の条件付きUPDATE本体。契約が記録されていない行
 * （NON_CURRENT_SUBSCRIPTION_STATUSES）だけを対象とする。
 *
 * 契約の痕跡（`stripe_subscription_id` ・解約予定・期間末）は消さない。`paused` / `unpaid` は
 * Stripe側で復帰しうる状態であり、`stripe_subscription_id` を消すと復帰時の
 * `customer.subscription.updated` を `syncSubscriptionStatus()` が照合できず取りこぼすため
 * （決済されているのにアプリ上は降格したまま、という不整合になる）。新しい契約が成立すれば
 * `activateUserFromCheckoutSession()` のupsertが上書きする。
 */
async function takeCheckoutSlot(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  userId: number,
  claimedAt: string,
  condition: ClaimCondition
): Promise<CheckoutSlotClaim> {
  const query = supabase
    .from("stripe_subscriptions")
    .update({
      status: CHECKOUT_PENDING_STATUS,
      checkout_claimed_at: claimedAt,
      // 奪った時点で旧セッション（失効済み）は無関係になる
      checkout_session_id: null,
    })
    .eq("user_id", userId)
    .in("status", NON_CURRENT_SUBSCRIPTION_STATUSES);

  const scoped =
    condition.kind === "released"
      ? query.is("checkout_claimed_at", null)
      : condition.kind === "stale"
        ? query.lt("checkout_claimed_at", condition.before)
        : query.eq("checkout_claimed_at", condition.claimedAt);

  const { data: claimed, error } = await scoped.select("stripe_customer_id");

  if (error) {
    console.error("Checkout処理権のclaimエラー:", error.message);
    return { outcome: "error", message: error.message };
  }
  const row = claimed?.[0];
  if (!row) {
    return { outcome: "conflict" };
  }
  return { outcome: "claimed", claimedAt, stripeCustomerId: row.stripe_customer_id };
}

/**
 * claimが確保したCheckout Sessionのidをミラー行へ記録する。次のリクエストが「その手続きが
 * まだ有効か」をStripeへ確認できるようにするためのもので、記録できたかを返す
 * （記録できないままURLを返すと、進行中の手続きと古いセッションを区別できなくなる）。
 */
async function saveCheckoutSessionId(
  userId: number,
  claimedAt: string,
  sessionId: string
): Promise<boolean> {
  const supabase = await createAdminSupabaseClient();
  const { data: saved, error } = await supabase
    .from("stripe_subscriptions")
    .update({ checkout_session_id: sessionId })
    .eq("user_id", userId)
    .eq("checkout_claimed_at", claimedAt)
    .select("id");

  if (error) {
    console.error("Checkoutセッションid保存エラー:", error.message);
    return false;
  }
  // 0行＝claimを奪われている。このセッションは自分の処理権に紐付けられない
  return (saved?.length ?? 0) > 0;
}

/**
 * `claimCheckoutSlot()` で確保した処理権を解放する。Checkout Sessionを作れなかった場合に呼ぶ
 * （解放しないと、当該ユーザーはTTLが切れるまでアップグレードできなくなる）。
 *
 * 行自体は削除せず `checkout_claimed_at` をNULLにするに留める。確保済みのStripe Customerを
 * 消すと、次回のCheckoutで別Customerが作られ孤児化するため。
 *
 * `checkout_claimed_at` の一致を条件に含めるのは、TTL経過後に自分のclaimが既に別リクエストへ
 * 渡っている場合に、その新しいclaimまで解放してしまうのを防ぐため（`releaseEventClaim()` と
 * 同じ理由）。ミリ秒精度の確保時刻が一致する行＝自分のclaimであるため、statusは条件に
 * 含めない（並行するWebhookがstatusを書き換えていても、自分のclaimは解放できる）。
 */
export async function releaseCheckoutSlot(
  userId: number,
  claimedAt: string
): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("stripe_subscriptions")
    .update({ checkout_claimed_at: null, checkout_session_id: null })
    .eq("user_id", userId)
    .eq("checkout_claimed_at", claimedAt);

  if (error) {
    console.error("Checkout処理権の解放エラー:", error.message);
    return { error: error.message };
  }

  return { error: null };
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
