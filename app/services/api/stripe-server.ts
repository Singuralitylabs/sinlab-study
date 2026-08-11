import Stripe from "stripe";

let cachedClient: Stripe | null = null;

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
 */
export async function createCheckoutSession(
  userId: number,
  authId: string,
  email: string | undefined
): Promise<{ url: string }> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_PRICE_ID");
  }
  const appUrl = getAppUrl();
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: String(userId),
    ...(email ? { customer_email: email } : {}),
    metadata: { user_id: String(userId), auth_id: authId },
    subscription_data: {
      metadata: { user_id: String(userId), auth_id: authId },
    },
    success_url: `${appUrl}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/upgrade`,
  });

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
