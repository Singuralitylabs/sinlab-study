import type Stripe from "stripe";
import { isChargeableSubscriptionPrice } from "@/app/constants/stripe";
import { USER_MEMBERSHIP, USER_STATUS } from "@/app/constants/user";
import { cancellationEndsAt, isCancellationScheduled } from "@/app/lib/subscription-period";
import {
  ACTIVATABLE_SUBSCRIPTION_STATUSES,
  getStripeClient,
  NON_CURRENT_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
  toSubscriptionPrice,
} from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import {
  scheduleCancelScheduledEmail,
  scheduleSubscriptionEndedEmail,
  scheduleUpgradedEmail,
} from "@/app/services/notifications/user-emails";

/** Exported because both the webhook and the success page use it to identify the session's user. */
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
 * Monthly price (JPY, unit price x quantity) of the subscription re-fetched from Stripe. Returns
 * null when it is not a monthly JPY price (no line in the upgrade email) or when the subscription
 * / item carries a discount (coupon etc.), since it would differ from the real charge. A discount
 * attached directly to the Customer (`customer.discount`) is not in `subscription.discounts` and
 * is undetected, so list price shows (detecting needs an extra Customer fetch; Checkout promotion
 * codes attach to the subscription, so this only happens with manual Dashboard/API grants and is
 * accepted).
 */
function chargedMonthlyAmountJpy(subscription: Stripe.Subscription): number | null {
  const item = subscription.items.data[0];
  if (!item?.price) {
    return null;
  }
  if ((subscription.discounts?.length ?? 0) > 0 || (item.discounts?.length ?? 0) > 0) {
    return null;
  }
  const price = toSubscriptionPrice(item.price);
  if (!isChargeableSubscriptionPrice(price)) {
    return null;
  }
  return price.amount * (item.quantity ?? 1);
}

/**
 * Schedules the upgrade email. Every promotion path (Checkout completion, re-promotion from the
 * mirror) goes through this. reference_key is the subscription id, so multiple paths / retries
 * returning a promotion still send one email. Exceptions (including price calculation) are
 * swallowed so they never affect the promotion result (webhook response, success page).
 */
function scheduleUpgradedEmailFor(
  userId: number,
  subscription: Stripe.Subscription,
  currentPeriodEnd: string | null
): void {
  try {
    scheduleUpgradedEmail({
      userId,
      subscriptionId: subscription.id,
      monthlyAmountJpy: chargedMonthlyAmountJpy(subscription),
      currentPeriodEnd,
    });
  } catch (error) {
    console.error("[メール通知] 有料会員化メールの予約に失敗しました:", error);
  }
}

/**
 * Maps live subscription state re-fetched from Stripe onto mirror row columns. Every mirror write
 * path (Checkout completion, subscription update webhook, reactivation) uses it so paths do not
 * drift when a column is added.
 */
function subscriptionMirrorFields(subscription: Stripe.Subscription) {
  return {
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    // With flexible billing mode a scheduled cancellation only shows up in cancel_at (see
    // isCancellationScheduled()).
    cancel_at: toIsoOrNull(subscription.cancel_at),
    current_period_end: toIsoOrNull(subscription.items.data[0]?.current_period_end),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Idempotent promotion called from both the checkout.session.completed webhook and the success
 * page. Upserts stripe_subscriptions, then sets users to active/general only when the
 * subscription is currently valid (ACTIVATABLE_SUBSCRIPTION_STATUSES). Overwrites on promotion,
 * including admin-approved users (accepted; no update if already general). Rejected users are
 * never promoted.
 * A completed Checkout Session stays immutable on Stripe, so promoting without checking
 * subscription state would let a cancelled user re-promote for free by revisiting the success URL
 * (session_id) (replay). The status check stops the promotion; the existing-row check below also
 * stops a replay of an old session from overwriting the mirror of a different, current
 * subscription, which would make syncSubscriptionStatus() unable to match the current
 * subscription by stripe_subscription_id and miss its cancellation.
 * The live state fetch (stripe.subscriptions.retrieve()) happens once, right before the mirror
 * upsert (after the existing-row check), and feeds both the upsert and the users update. This
 * minimizes the TOCTOU window. A cancellation webhook racing between the mirror upsert and the
 * users update remains theoretically possible (full exclusion needs a DB transaction/RPC, out of
 * scope), but a single fetch just before writing avoids rolling the mirror back from a stale
 * snapshot.
 * @param options.expectedClaimedAt claim time observed by the caller. If given, write only while
 *   the mirror row's `checkout_claimed_at` still equals it (otherwise do nothing, like
 *   `skipped`). This keeps the Checkout API's self-recovery (#250) from releasing a claim just
 *   re-acquired by a concurrent request (before the session id is recorded, so the guard below
 *   does not apply). Webhook and success page omit it.
 * @returns activated: whether users was actually promoted (drives the success page branch).
 *   currentPeriodEnd: next billing date (ISO string) settled at promotion so the success page
 *   need not re-read stripe_subscriptions.
 */
export async function activateUserFromCheckoutSession(
  session: Stripe.Checkout.Session,
  options: { expectedClaimedAt?: string } = {}
): Promise<{
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

  const supabase = await createAdminSupabaseClient();

  // "Check existing row -> update mirror" spans several statements, so another request may
  // acquire the claim in between (an old success-page URL clearing a newer valid claim). The
  // write is conditioned on the ownership state observed at check time (CAS); if it changed,
  // re-read and decide again.
  let mirrored: MirrorWriteResult = { kind: "conflict" };
  for (let attempt = 0; attempt < MIRROR_WRITE_MAX_ATTEMPTS; attempt++) {
    mirrored = await writeCheckoutMirror(
      supabase,
      userId,
      session,
      customerId,
      subscriptionId,
      options.expectedClaimedAt
    );
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
    // Conflict never resolved. The webhook returns 500 so Stripe retries; the success page shows
    // an error.
    const message = "他の処理と競合したためミラー行を更新できませんでした";
    console.error("stripe_subscriptions更新エラー:", message);
    return { error: message, activated: false, currentPeriodEnd: null };
  }

  const { subscription, currentPeriodEnd } = mirrored;

  if (!ACTIVATABLE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return { error: null, activated: false, currentPeriodEnd: null };
  }

  const promoted = await promoteUserToGeneral(supabase, userId);
  if (promoted.error) {
    return { error: promoted.error, activated: false, currentPeriodEnd: null };
  }
  if (promoted.changed) {
    // The webhook and the success page can promote concurrently; the send-log UNIQUE
    // (subscription id) keeps it to one email.
    scheduleUpgradedEmailFor(userId, subscription, currentPeriodEnd);
  }
  return {
    error: null,
    activated: promoted.activated,
    currentPeriodEnd: promoted.activated ? currentPeriodEnd : null,
  };
}

/**
 * Promotes to active / general; rejected users are never promoted. Callers must first confirm
 * from live state re-fetched from Stripe that the subscription is currently valid
 * (ACTIVATABLE_SUBSCRIPTION_STATUSES).
 * The UPDATE targets only rows not yet general. When already promoted (success-page revisit,
 * webhook retry) nothing is updated and only `activated` is returned from the current state.
 * @returns activated: whether the user is general after the call (drives the success page).
 *   changed: whether this call actually promoted. The upgrade email is scheduled only when true,
 *   so revisits / retries of an already promoted user do not send emails at unrelated times; an
 *   admin having manually approved the user as general also gives changed false, so it is not
 *   sent as if already announced by the approval email.
 */
async function promoteUserToGeneral(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  userId: number
): Promise<{ error: string | null; activated: boolean; changed: boolean }> {
  const { data: updatedUsers, error: userError } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.ACTIVE,
      membership_type: USER_MEMBERSHIP.GENERAL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .neq("status", USER_STATUS.REJECTED)
    .or(
      `status.neq.${USER_STATUS.ACTIVE},membership_type.is.null,membership_type.neq.${USER_MEMBERSHIP.GENERAL}`
    )
    .select("id");

  if (userError) {
    console.error("ユーザー昇格エラー:", userError.message);
    return { error: userError.message, activated: false, changed: false };
  }
  if ((updatedUsers?.length ?? 0) > 0) {
    return { error: null, activated: true, changed: true };
  }

  // No update: already general, or rejected / missing.
  const { data: current, error: fetchError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("status", USER_STATUS.ACTIVE)
    .eq("membership_type", USER_MEMBERSHIP.GENERAL)
    .maybeSingle();

  if (fetchError) {
    console.error("ユーザー取得エラー:", fetchError.message);
    return { error: fetchError.message, activated: false, changed: false };
  }
  return { error: null, activated: current !== null, changed: false };
}

/**
 * Repairs (#250) a mirror row that records a subscription while the user is not promoted. It
 * arises when the mirror write (including claim release) succeeded but the users update failed,
 * or when the subscription became active on Stripe after being reflected as e.g. `incomplete` and
 * the webhook never arrived; with no success-page URL at hand, the Checkout API would keep
 * answering 409 as subscribed.
 * Call only when the Checkout API from a trial user hits conflict (the admin UI cannot move a
 * paid member back to trial, and trial demotion only follows a terminal state, so this
 * combination is only an inconsistency). Never trust the mirror values: promote only if the live
 * state re-fetched from Stripe is valid. Rows holding a claim (in progress) are excluded.
 */
export async function reactivateUserFromMirror(
  userId: number
): Promise<{ error: string | null; activated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data: row, error: fetchError } = await supabase
    .from("stripe_subscriptions")
    .select("stripe_subscription_id, status, checkout_claimed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("stripe_subscriptions取得エラー:", fetchError.message);
    return { error: fetchError.message, activated: false };
  }
  // Target rows record a subscription (neither terminal nor pending). Do not trust the mirror
  // status itself: with a lost webhook it may stay `incomplete` / `past_due` while Stripe says
  // paid `active`.
  if (
    !row?.stripe_subscription_id ||
    row.checkout_claimed_at !== null ||
    NON_CURRENT_SUBSCRIPTION_STATUSES.includes(row.status)
  ) {
    return { error: null, activated: false };
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  const mirrorFields = subscriptionMirrorFields(subscription);

  // Write live state only if the row is unchanged since the read (same subscription, same status,
  // no claim). Without the status condition, a concurrent cancellation webhook's `canceled`
  // written after our fetch would be overwritten by a stale `active` snapshot and promote the
  // user.
  const { data: updated, error: updateError } = await supabase
    .from("stripe_subscriptions")
    .update(mirrorFields)
    .eq("user_id", userId)
    .eq("stripe_subscription_id", subscription.id)
    .eq("status", row.status)
    .is("checkout_claimed_at", null)
    .select("id");

  if (updateError) {
    console.error("stripe_subscriptions更新エラー:", updateError.message);
    return { error: updateError.message, activated: false };
  }
  if ((updated?.length ?? 0) === 0) {
    return { error: null, activated: false };
  }
  if (!ACTIVATABLE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return { error: null, activated: false };
  }

  const promoted = await promoteUserToGeneral(supabase, userId);
  if (promoted.changed) {
    // A subscription not promoted by the first reflection (activateUserFromCheckoutSession) can
    // become a paid member here for the first time. If already sent, the send-log UNIQUE
    // (subscription id) suppresses it.
    scheduleUpgradedEmailFor(userId, subscription, mirrorFields.current_period_end);
  }
  return { error: promoted.error, activated: promoted.activated };
}

/** Retry count for the mirror update: on conflict re-read and decide again. */
const MIRROR_WRITE_MAX_ATTEMPTS = 3;

type MirrorWriteResult =
  | { kind: "written"; subscription: Stripe.Subscription; currentPeriodEnd: string | null }
  | { kind: "skipped" } // a situation where writing is forbidden (another session in progress, stale replay)
  | { kind: "conflict" } // row changed between check and write (re-read and retry)
  | { kind: "error"; message: string };

/**
 * One attempt: check the existing row and update the mirror only if allowed.
 * The write is a conditional UPDATE (INSERT if no row) that requires the ownership state observed
 * at check time (`checkout_claimed_at` / `stripe_subscription_id`) to be unchanged. If not, 0
 * rows update and `conflict` is returned.
 */
async function writeCheckoutMirror(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  userId: number,
  session: Stripe.Checkout.Session,
  customerId: string,
  subscriptionId: string,
  expectedClaimedAt: string | undefined
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

  // Do not write if the claim the caller observed has already been replaced (another request
  // re-claimed). The CAS below conditions on the checkout_claimed_at read here, so a change after
  // the read yields conflict and a re-read returns to this check. expectedClaimedAt is the
  // caller's raw DB value of the same column, so string comparison suffices (no formatting
  // variance).
  if (
    expectedClaimedAt !== undefined &&
    (existingRow?.checkout_claimed_at ?? null) !== expectedClaimedAt
  ) {
    return { kind: "skipped" };
  }

  // Protect an in-progress Checkout (live claim) from being broken by processing of a different
  // session. Without this guard, revisiting an old success URL while holding a claim would clear
  // `checkout_claimed_at` and let a next Checkout be created while a payable session remains
  // (regression of #103). The session id is always recorded before the URL is returned.
  const heldSessionId =
    existingRow?.checkout_claimed_at != null ? existingRow.checkout_session_id : null;
  if (heldSessionId !== null && heldSessionId !== session.id) {
    return { kind: "skipped" };
  }

  // If a different subscription is already current (neither terminal nor pending), an old
  // session's replay must not overwrite the mirror row (it would break webhook matching for the
  // current subscription). Compared via subscriptionId (raw string from the session), so no
  // Stripe API call is needed. A row that only holds a Checkout claim (CHECKOUT_PENDING_STATUS)
  // does not represent a subscription yet and is excluded (including it would skip the promotion
  // of the Checkout that just completed).
  const isStaleReplay =
    existingRow != null &&
    existingRow.stripe_subscription_id !== subscriptionId &&
    !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(existingRow.status);
  if (isStaleReplay) {
    return { kind: "skipped" };
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const liveFields = subscriptionMirrorFields(subscription);
  const currentPeriodEnd = liveFields.current_period_end;
  const mirror = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    ...liveFields,
    // Once the real status is written, the Checkout claim has served its purpose (normal
    // release).
    checkout_claimed_at: null,
    checkout_session_id: null,
  };

  if (!existingRow) {
    const { error: insertError } = await supabase
      .from("stripe_subscriptions")
      .insert({ user_id: userId, ...mirror });
    if (!insertError) {
      return { kind: "written", subscription, currentPeriodEnd };
    }
    // Unique violation: a row was created after the check (e.g. a claim). Re-read and decide
    // again.
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
 * Mirror update for customer.subscription.updated / .deleted. Demotes only on a transition to a
 * terminal status (TERMINAL_SUBSCRIPTION_STATUSES: canceled/unpaid/incomplete_expired/paused);
 * past_due is a grace period and does not demote.
 * Webhook delivery order is not guaranteed, so do not trust the subscription snapshot embedded in
 * the event: re-fetch the latest state from the Stripe API before writing. E.g. a delayed stale
 * active/past_due event after canceled handling still writes the live state (canceled), so the
 * mirror is not rolled back.
 * The row is located by stripe_subscription_id. If updated/deleted arrives before
 * checkout.session.completed is processed (reordering) there is no row and nothing happens (a
 * later checkout.session.completed upserts the latest state). This existence check comes BEFORE
 * the Stripe re-fetch: hitting the Stripe API for every event of subscriptions unrelated to this
 * service would waste calls and cause needless 500s / retries during Stripe outages.
 */
export async function syncSubscriptionStatus(
  subscriptionFromEvent: Stripe.Subscription
): Promise<{ error: string | null }> {
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
  const mirrorFields = subscriptionMirrorFields(subscription);

  const { error: updateError } = await supabase
    .from("stripe_subscriptions")
    .update(mirrorFields)
    .eq("stripe_subscription_id", subscription.id);

  if (updateError) {
    console.error("stripe_subscriptions更新エラー:", updateError.message);
    return { error: updateError.message };
  }

  if (TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    const reverted = await revertUserToTrial(existing.user_id);
    if (reverted.error === null && reverted.reverted) {
      scheduleSubscriptionEndedEmail({ userId: existing.user_id, subscriptionId: subscription.id });
    }
    return { error: reverted.error };
  }

  // Accepts a scheduled cancellation. Do not decide by comparing with the mirror (false -> true
  // transition): other paths also write live state to the mirror (Checkout completion,
  // re-promotion), and if they write first the transition is consumed and the email is lost.
  // Schedule every time the live state re-fetched from Stripe shows a scheduled cancellation and
  // let the send-log UNIQUE (subscription id) dedupe to one email (delayed / reordered event
  // snapshots are not read, so a stale event arriving after the cancellation was withdrawn does
  // not fire).
  if (isCancellationScheduled(mirrorFields)) {
    scheduleCancelScheduledEmail({
      userId: existing.user_id,
      subscriptionId: subscription.id,
      periodEnd: cancellationEndsAt(mirrorFields),
    });
  }

  return { error: null };
}

/**
 * Reverts the user to trial. The guard (only when membership_type='general') is folded into the
 * UPDATE so community members and manually approved users are not caught by mistake.
 * @returns reverted: whether a row was actually updated. false when the guard blocked it (already
 *   demoted, not general); used to decide not to send the membership-ended email.
 */
export async function revertUserToTrial(
  userId: number
): Promise<{ error: string | null; reverted: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .update({
      status: USER_STATUS.TRIAL,
      membership_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("membership_type", USER_MEMBERSHIP.GENERAL)
    .select("id");

  if (error) {
    console.error("ユーザー降格エラー:", error.message);
    return { error: error.message, reverted: false };
  }

  return { error: null, reverted: (data?.length ?? 0) > 0 };
}

/** After this many minutes an abandoned claim can be re-claimed. */
const EVENT_CLAIM_TTL_MINUTES = 10;

/**
 * Atomically acquires the processing right for a webhook event. A plain INSERT into
 * stripe_events.id (PK) is the claim: it is an INSERT, not an upsert, so of concurrent requests
 * for the same event.id the DB unique constraint lets only one succeed (truly exclusive).
 * Call BEFORE running the handler. Run the handler only if claimed; on failure call
 * releaseEventClaim() so Stripe's automatic retry can reach the handler again (returning success
 * without releasing would make the retry look "already processed" and skip it forever).
 * TTL recovery: if a serverless timeout or kill prevents reaching releaseEventClaim(), the claim
 * row would remain and skip all retries forever. On unique violation, check whether the existing
 * claim was abandoned beyond EVENT_CLAIM_TTL_MINUTES and take it over if so (claimed: true only
 * when `processed_at` could be updated). Handlers are idempotent (upsert / conditional UPDATE),
 * so re-running an already completed event is low impact (at worst a duplicate Slack notice).
 * @param ttlMinutes time before re-claim is allowed. For non-webhook uses (deduplicating the
 *   "Checkout cannot auto-recover" notice) where something should run once per period (default is
 *   the webhook TTL).
 * @returns processedAt: the `processed_at` set by this claim; pass it as-is to
 *   releaseEventClaim() so only your own claim is released.
 */
export async function claimEvent(
  eventId: string,
  type: string,
  ttlMinutes: number = EVENT_CLAIM_TTL_MINUTES
): Promise<{ claimed: boolean; processedAt: string | null; error: string | null }> {
  const supabase = await createAdminSupabaseClient();

  const processedAt = new Date().toISOString();
  const { error } = await supabase
    .from("stripe_events")
    .insert({ id: eventId, type, processed_at: processedAt });

  if (!error) {
    return { claimed: true, processedAt, error: null };
  }

  // Anything other than a unique violation (23505) is a real DB error.
  if (error.code !== "23505") {
    console.error("stripe_events claim エラー:", error.message);
    return { claimed: false, processedAt: null, error: error.message };
  }

  // Already claimed. Allow re-claim only if abandoned beyond the TTL.
  const staleBefore = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();
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
 * Releases the claim from claimEvent(); call only when the handler failed. Deleting the row lets
 * claimEvent() succeed on Stripe's automatic retry.
 * The DELETE matches `processed_at` so it cannot delete a newer claim if ours was already
 * re-claimed by another process after the TTL (an unconditional DELETE by a late old holder would
 * remove the new claim and let a third request re-claim).
 */
export async function releaseEventClaim(
  eventId: string,
  processedAt: string
): Promise<{ error: string | null }> {
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
