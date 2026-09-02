import type Stripe from "stripe";
import { USER_MEMBERSHIP, USER_STATUS } from "@/app/constants/user";
import {
  ACTIVATABLE_SUBSCRIPTION_STATUSES,
  assertServiceRoleConfigured,
  getStripeClient,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
} from "@/app/services/api/stripe-server";
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
 * stripe_subscriptions を upsert したうえで、サブスクが現に有効（ACTIVATABLE_SUBSCRIPTION_STATUSES）
 * な場合のみ users を active/general に更新する。管理者が承認前に手動承認していた場合を含め、
 * 昇格時は常に上書きする（許容仕様）。却下（rejected）済みユーザーは昇格しない。
 *
 * サブスクの状態を見ずに常に昇格させると、Checkout Sessionが決済後もStripe側に不変オブジェクトとして
 * 残ることを利用して、解約後にsuccessページのURL（`session_id`）を再訪しただけで無償のまま
 * 再昇格できてしまう（リプレイ）。`ACTIVATABLE_SUBSCRIPTION_STATUSES` の判定で昇格自体は防げるが、
 * 加えて「別の（現行の）契約が既にある状態で、古いセッションのリプレイがミラー行を上書きしてしまう」
 * ことも防ぐ（下記の既存行チェック）。上書きを許すと、以後 syncSubscriptionStatus() が
 * `stripe_subscription_id` で現行契約を照合できなくなり、解約イベントを取りこぼす。
 *
 * Stripe APIからのライブ状態取得（`stripe.subscriptions.retrieve()`）は、ミラーupsertの
 * 直前（既存行チェックの後）に1回だけ行い、その結果をミラーupsertとusers更新の両方に使う。
 * こうすることで、取得時点から書き込み時点までの間隔（TOCTOUウィンドウ）を最小化する。
 * それでもミラーupsert〜users更新の間に解約Webhookが並行実行される競合は理論上残るが
 * （完全な排他制御にはDBトランザクション/RPCが必要でスコープ外）、取得を書き込み直前の
 * 1箇所に集約することで、古いスナップショットのままミラーだけ巻き戻る事態は避けられる。
 *
 * @returns activated: 実際に users を昇格したか。successページ側の表示分岐に使う。
 * currentPeriodEnd: 昇格時に確定した次回請求日（ISO文字列）。successページが
 * `stripe_subscriptions` を読み直さずに表示できるよう、ここで返す
 */
export async function activateUserFromCheckoutSession(session: Stripe.Checkout.Session): Promise<{
  error: string | null;
  activated: boolean;
  currentPeriodEnd: string | null;
}> {
  const userId = extractUserId(session.client_reference_id, session.metadata);
  if (userId === null) {
    return {
      error: "Checkoutセッションからユーザーを特定できませんでした",
      activated: false,
      currentPeriodEnd: null,
    };
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (!customerId || !subscriptionId) {
    return {
      error: "Checkoutセッションにcustomer/subscription情報がありません",
      activated: false,
      currentPeriodEnd: null,
    };
  }

  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  // 「既存行の確認 → ミラー更新」は複数ステートメントに分かれるため、確認から書き込みまでの
  // 間に別リクエストが処理権を確保しうる（古い成功ページURLの処理が、後発の有効な処理権を
  // 消してしまう競合）。書き込み条件に「確認した時点の所有状態」を載せ（CAS）、変わって
  // いた場合は読み直して判断からやり直す
  let mirrored: MirrorWriteResult = { kind: "conflict" };
  for (let attempt = 0; attempt < MIRROR_WRITE_MAX_ATTEMPTS; attempt++) {
    mirrored = await writeCheckoutMirror(supabase, userId, session, customerId, subscriptionId);
    if (mirrored.kind !== "conflict") {
      break;
    }
  }

  if (mirrored.kind === "error") {
    return { error: mirrored.message, activated: false, currentPeriodEnd: null };
  }
  if (mirrored.kind === "skipped") {
    return { error: null, activated: false, currentPeriodEnd: null };
  }
  if (mirrored.kind === "conflict") {
    // 競合が解消しなかった。Webhookは500を返して再送に委ね、successページはエラー表示にする
    const message = "他の処理と競合したためミラー行を更新できませんでした";
    console.error("stripe_subscriptions更新エラー:", message);
    return { error: message, activated: false, currentPeriodEnd: null };
  }

  const { subscription, currentPeriodEnd } = mirrored;

  if (!ACTIVATABLE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return { error: null, activated: false, currentPeriodEnd: null };
  }

  const { data: updatedUsers, error: userError } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.ACTIVE,
      membership_type: USER_MEMBERSHIP.GENERAL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .neq("status", USER_STATUS.REJECTED)
    .select("id");

  if (userError) {
    console.error("ユーザー昇格エラー:", userError.message);
    return { error: userError.message, activated: false, currentPeriodEnd: null };
  }

  const activated = (updatedUsers?.length ?? 0) > 0;
  return { error: null, activated, currentPeriodEnd: activated ? currentPeriodEnd : null };
}

/** ミラー更新の再試行回数。1回目で競合した場合に、読み直して判断からやり直す */
const MIRROR_WRITE_MAX_ATTEMPTS = 3;

type MirrorWriteResult =
  | { kind: "written"; subscription: Stripe.Subscription; currentPeriodEnd: string | null }
  | { kind: "skipped" } // 書いてはいけない状況（進行中の別セッション・古いリプレイ）
  | { kind: "conflict" } // 確認から書き込みまでの間に行が変わった（読み直して再試行）
  | { kind: "error"; message: string };

/**
 * 既存行を確認し、書いてよい場合に限りミラー行を更新する（1回分の試行）。
 *
 * 書き込みは「確認した時点の所有状態（`checkout_claimed_at` / `stripe_subscription_id`）が
 * そのまま残っていること」を条件にした条件付きUPDATE（行が無い場合はINSERT）で行う。
 * 条件に合致しなければ0行更新となり `conflict` を返す。
 */
async function writeCheckoutMirror(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  userId: number,
  session: Stripe.Checkout.Session,
  customerId: string,
  subscriptionId: string
): Promise<MirrorWriteResult> {
  const { data: existingRow, error: existingFetchError } = await supabase
    .from("stripe_subscriptions")
    .select("stripe_subscription_id, status, checkout_claimed_at, checkout_session_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingFetchError) {
    console.error("stripe_subscriptions取得エラー:", existingFetchError.message);
    return { kind: "error", message: existingFetchError.message };
  }

  // 進行中のCheckout（有効な処理権）が、**別の**セッションの処理で壊されないようにする。
  // このガードが無いと、処理権を保持したまま古い成功ページURLを再訪しただけで
  // `checkout_claimed_at` が解除され、まだ決済可能なセッションを残したまま次のCheckoutを
  // 作れてしまう（#103の再発）。セッションidは、URLを返す前に必ず記録している
  const heldSessionId =
    existingRow?.checkout_claimed_at != null ? existingRow.checkout_session_id : null;
  if (heldSessionId !== null && heldSessionId !== session.id) {
    return { kind: "skipped" };
  }

  // 既に別の契約が現行（終端状態でも手続き中でもない）として記録されている場合、古いセッションの
  // リプレイでミラー行を上書きしない（現行契約のWebhook照合が壊れるため）。
  // subscriptionId（session由来の生の文字列）で比較するため、Stripe APIの呼び出しは不要。
  // Checkout作成の処理権を確保しただけの行（CHECKOUT_PENDING_STATUS）はまだ契約を表さないため
  // 対象外とする（対象にすると、今まさに完了したCheckoutの昇格自体がスキップされてしまう）
  const isStaleReplay =
    existingRow != null &&
    existingRow.stripe_subscription_id !== subscriptionId &&
    !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(existingRow.status);
  if (isStaleReplay) {
    return { kind: "skipped" };
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentPeriodEnd = toIsoOrNull(subscription.items.data[0]?.current_period_end);
  const mirror = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: currentPeriodEnd,
    // 実ステータスを書けた時点でCheckout作成の処理権は役目を終える（正常な解除）
    checkout_claimed_at: null,
    checkout_session_id: null,
    updated_at: new Date().toISOString(),
  };

  if (!existingRow) {
    const { error: insertError } = await supabase
      .from("stripe_subscriptions")
      .insert({ user_id: userId, ...mirror });
    if (!insertError) {
      return { kind: "written", subscription, currentPeriodEnd };
    }
    // 一意制約違反＝確認後に行が作られた（処理権の確保など）。読み直して判断し直す
    if (insertError.code === "23505") {
      return { kind: "conflict" };
    }
    console.error("stripe_subscriptions更新エラー:", insertError.message);
    return { kind: "error", message: insertError.message };
  }

  const base = supabase.from("stripe_subscriptions").update(mirror).eq("user_id", userId);
  const withClaimCas =
    existingRow.checkout_claimed_at === null
      ? base.is("checkout_claimed_at", null)
      : base.eq("checkout_claimed_at", existingRow.checkout_claimed_at);
  const withCas =
    existingRow.stripe_subscription_id === null
      ? withClaimCas.is("stripe_subscription_id", null)
      : withClaimCas.eq("stripe_subscription_id", existingRow.stripe_subscription_id);

  const { data: updated, error: updateError } = await withCas.select("id");

  if (updateError) {
    console.error("stripe_subscriptions更新エラー:", updateError.message);
    return { kind: "error", message: updateError.message };
  }
  if ((updated?.length ?? 0) === 0) {
    return { kind: "conflict" };
  }
  return { kind: "written", subscription, currentPeriodEnd };
}

/**
 * customer.subscription.updated / customer.subscription.deleted で呼ばれる、
 * stripe_subscriptions のミラー更新。終端状態（TERMINAL_SUBSCRIPTION_STATUSES:
 * canceled/unpaid/incomplete_expired/paused）へ遷移した場合のみ降格する
 * （past_due は猶予期間のため降格しない）。
 *
 * Webhookイベントは到着順が保証されないため、イベントに埋め込まれたsubscriptionの
 * スナップショットをそのまま信用せず、Stripe APIから最新状態を取り直してから書き込む。
 * 例えば canceled 処理後に古い active/past_due のイベントが遅延して届いても、
 * 再取得した時点のライブ状態（canceled）を書くため、ミラーが古い状態へ巻き戻らない。
 *
 * stripe_subscription_id で該当行を特定する。checkout.session.completed 未処理のうちに
 * updated/deleted が届いた場合（順序逆転）は対象行が無いため何もしない
 * （後続で checkout.session.completed が処理されれば最新状態で upsert される）。
 * この存在チェックはStripe APIの再取得より先に行う。当サービスと無関係な
 * サブスクのイベントでも毎回Stripe APIを叩くと、無駄な呼び出しやAPI障害時の
 * 不要な500・再送を招くため。
 */
export async function syncSubscriptionStatus(
  subscriptionFromEvent: Stripe.Subscription
): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("stripe_subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionFromEvent.id)
    .maybeSingle();

  if (fetchError) {
    console.error("stripe_subscriptions取得エラー:", fetchError.message);
    return { error: fetchError.message };
  }
  if (!existing) {
    return { error: null };
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionFromEvent.id);

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

  if (TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
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

/** claimが放置されたとみなすまでの時間（分）。この時間を超えたclaimは再claim可能にする */
const EVENT_CLAIM_TTL_MINUTES = 10;

/**
 * Webhookイベントの処理権を原子的に確保する。`stripe_events.id`（PK）への素のINSERTを
 * 「claim」として使う（upsertではなく通常のINSERTのため、同一event.idの並行リクエストは
 * DBの一意制約により片方だけが成功する＝真に排他的）。
 *
 * ハンドラ実行**前**に呼ぶ。claim できた場合のみハンドラを実行し、失敗時は
 * releaseEventClaim() でclaimを解放してStripeの自動リトライが再度ハンドラへ
 * 到達できるようにする（claimを解放しないまま成功扱いにすると、リトライが
 * 「処理済み」と誤判定され永久にスキップされる）。
 *
 * **TTLによる救済**: サーバーレス関数のタイムアウト・強制終了等でclaim後に
 * releaseEventClaim() へ到達できなかった場合、claim行が残り続けて以後の再送が
 * 永久にスキップされてしまう。これを防ぐため、一意制約違反時は既存claimが
 * `EVENT_CLAIM_TTL_MINUTES` を超えて放置されていないかを確認し、放置されていれば
 * claimを奪い直す（`processed_at` を更新できた場合のみ claimed: true）。
 * ハンドラは冪等（upsert/条件付きUPDATE）に設計されているため、まれに完了済みの
 * イベントを再claim・再実行しても実害は小さい（Slack通知の重複程度）。
 *
 * @returns processedAt: このclaimで設定した`processed_at`。releaseEventClaim()に
 * そのまま渡すことで、自分が確保したclaimだけを解放する（後述）
 */
export async function claimEvent(
  eventId: string,
  type: string
): Promise<{ claimed: boolean; processedAt: string | null; error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const processedAt = new Date().toISOString();
  const { error } = await supabase
    .from("stripe_events")
    .insert({ id: eventId, type, processed_at: processedAt });

  if (!error) {
    return { claimed: true, processedAt, error: null };
  }

  // 一意制約違反（PostgreSQLエラーコード23505）以外はDBエラーとして呼び出し元に伝播する
  if (error.code !== "23505") {
    console.error("stripe_events claim エラー:", error.message);
    return { claimed: false, processedAt: null, error: error.message };
  }

  // 既にclaim済み。TTLを超えて放置されている場合のみ再claimを許可する
  const staleBefore = new Date(Date.now() - EVENT_CLAIM_TTL_MINUTES * 60 * 1000).toISOString();
  const reclaimedAt = new Date().toISOString();
  const { data: reclaimed, error: reclaimError } = await supabase
    .from("stripe_events")
    .update({ processed_at: reclaimedAt })
    .eq("id", eventId)
    .lt("processed_at", staleBefore)
    .select("id");

  if (reclaimError) {
    console.error("stripe_events 再claim エラー:", reclaimError.message);
    return { claimed: false, processedAt: null, error: reclaimError.message };
  }

  const claimed = (reclaimed?.length ?? 0) > 0;
  return { claimed, processedAt: claimed ? reclaimedAt : null, error: null };
}

/**
 * claimEvent() で確保したイベントの処理権を解放する。ハンドラが失敗した場合にのみ呼ぶこと。
 * 行を削除することで、Stripeの自動リトライ時に claimEvent() が再度成功できるようにする。
 *
 * DELETEの条件に `processed_at` の一致を含めるのは、TTL経過後に自分のclaimが既に
 * 別プロセスによって再claimされている場合に、その新しいclaimまで誤って削除して
 * しまうのを防ぐため（無条件DELETEだと、旧claim保持者が遅れて解放処理に到達した際に
 * 新しいclaimを消してしまい、3つ目のリクエストが再claimできてしまう理論上の競合が生じる）。
 */
export async function releaseEventClaim(
  eventId: string,
  processedAt: string
): Promise<{ error: string | null }> {
  assertServiceRoleConfigured();
  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("stripe_events")
    .delete()
    .eq("id", eventId)
    .eq("processed_at", processedAt);

  if (error) {
    console.error("stripe_events claim解放エラー:", error.message);
    return { error: error.message };
  }

  return { error: null };
}
