import type Stripe from "stripe";
import { USER_MEMBERSHIP, USER_STATUS } from "@/app/constants/user";
import { assertServiceRoleConfigured, getStripeClient } from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

/**
 * CheckoutセッションからユーザーIDを特定する。Webhookとsuccessページの両方から
 * session特定に使うため公開している。
 */
export function extractUserId(
  clientReferenceId: string | null,
  metadata: Stripe.Metadata | null | undefined
): number | null {
  const raw = clientReferenceId ?? metadata?.user_id ?? null;
  if (!raw) {
    return null;
  }
  const userId = Number(raw);
  return Number.isInteger(userId) ? userId : null;
}

function toIsoOrNull(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

/**
 * checkout.session.completed のWebhook、および successページの両方から呼ばれる冪等な昇格処理。
 * stripe_subscriptions を upsert したうえで users を active/general に更新する。
 * 管理者が承認前に手動承認していた場合も含め、常に上書きする（許容仕様）。
 */
export async function activateUserFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ error: string | null }> {
  const userId = extractUserId(session.client_reference_id, session.metadata);
  if (userId === null) {
    return { error: "Checkoutセッションからユーザーを特定できませんでした" };
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (!customerId || !subscriptionId) {
    return { error: "Checkoutセッションにcustomer/subscription情報がありません" };
  }

  assertServiceRoleConfigured();
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const supabase = await createAdminSupabaseClient();

  const { error: subscriptionError } = await supabase.from("stripe_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: toIsoOrNull(subscription.items.data[0]?.current_period_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (subscriptionError) {
    console.error("stripe_subscriptions更新エラー:", subscriptionError.message);
    return { error: subscriptionError.message };
  }

  const { error: userError } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.ACTIVE,
      membership_type: USER_MEMBERSHIP.GENERAL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (userError) {
    console.error("ユーザー昇格エラー:", userError.message);
    return { error: userError.message };
  }

  return { error: null };
}

/**
 * customer.subscription.updated / customer.subscription.deleted で呼ばれる、
 * stripe_subscriptions のミラー更新。canceled/unpaid へ遷移した場合のみ降格する
 * （past_due は猶予期間のため降格しない）。
 *
 * stripe_subscription_id で該当行を特定する。checkout.session.completed 未処理のうちに
 * updated/deleted が届いた場合（順序逆転）は対象行が無いため何もしない
 * （後続で checkout.session.completed が処理されれば最新状態で upsert される）。
 */
export async function syncSubscriptionStatus(
  subscription: Stripe.Subscription
): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("stripe_subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (fetchError) {
    console.error("stripe_subscriptions取得エラー:", fetchError.message);
    return { error: fetchError.message };
  }
  if (!existing) {
    return { error: null };
  }

  const { error: updateError } = await supabase
    .from("stripe_subscriptions")
    .update({
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: toIsoOrNull(subscription.items.data[0]?.current_period_end),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (updateError) {
    console.error("stripe_subscriptions更新エラー:", updateError.message);
    return { error: updateError.message };
  }

  if (subscription.status === "canceled" || subscription.status === "unpaid") {
    return await revertUserToTrial(existing.user_id);
  }

  return { error: null };
}

/**
 * ユーザーをお試しユーザーに戻す。membership_type='general' の場合のみ実行するガードを
 * UPDATE自体に折り込む（コミュニティ会員・手動承認済みユーザーを誤って巻き込まない）。
 */
export async function revertUserToTrial(userId: number): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.PENDING,
      membership_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("membership_type", USER_MEMBERSHIP.GENERAL);

  if (error) {
    console.error("ユーザー降格エラー:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Webhookイベントが処理済みかを確認する（読み取りのみ）。
 * ハンドラ実行前に呼び、処理済みイベントの再送をスキップするために使う。
 * 記録（recordEventProcessed）はハンドラ成功後に行うため、ハンドラが失敗して
 * 500を返した場合はここで処理済み扱いにならず、Stripeの自動リトライで再度ハンドラに到達できる。
 */
export async function isEventProcessed(
  eventId: string
): Promise<{ processed: boolean; error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error("stripe_events確認エラー:", error.message);
    return { processed: false, error: error.message };
  }

  return { processed: data !== null, error: null };
}

/**
 * Webhookイベントを処理済みとして記録する。ハンドラ成功後にのみ呼ぶこと。
 * event.id の重複INSERTは ON CONFLICT DO NOTHING 相当（upsert + ignoreDuplicates）で
 * 安全にスキップする（isEventProcessed とのごく短い競合ウィンドウで二重配信された場合の保険）。
 */
export async function recordEventProcessed(
  eventId: string,
  type: string
): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("stripe_events")
    .upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error("stripe_events記録エラー:", error.message);
    return { error: error.message };
  }

  return { error: null };
}
