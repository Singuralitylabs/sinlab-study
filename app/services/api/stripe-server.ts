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

// Kept in app/constants/stripe.ts so callers without the Stripe SDK (e.g. layout.tsx) do not pull
// the whole SDK into their module graph.
export { isStripeEnabled } from "@/app/constants/stripe";

const MIN_CHECKOUT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Headroom for the gap between `now` and the moment Stripe actually creates the session (Price
 * fetch + network round trip). Without it, expires_at can fall under Stripe's 30-minute minimum
 * and Checkout creation fails.
 */
const CHECKOUT_SESSION_EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;

/**
 * Fixed to the minimum instead of Stripe's 24h default: the claim TTL (CHECKOUT_CLAIM_TTL_MS)
 * releases abandoned claims, so any older session must already be expired by then. See expires_at
 * in createCheckoutSession().
 */
const CHECKOUT_SESSION_LIFETIME_MS =
  MIN_CHECKOUT_SESSION_LIFETIME_MS + CHECKOUT_SESSION_EXPIRY_SAFETY_MARGIN_MS;

let cachedClient: Stripe | null = null;

/**
 * Statuses treated as "no current subscription". stripe_subscriptions has one row per user (never
 * deleted, always upserted), so a row survives cancellation.
 * `paused` is included because Stripe pauses a trial subscription without a payment method when
 * the trial ends; excluding it would leave the user active/general without ever paying (the flip
 * side of ACTIVATABLE_SUBSCRIPTION_STATUSES including `trialing`).
 */
export const TERMINAL_SUBSCRIPTION_STATUSES = [
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused",
];

/**
 * Only these statuses may promote a user (checkout.session.completed webhook and success page). A
 * completed Checkout Session stays immutable on Stripe, so checking payment_status alone would
 * promote for free when a cancelled user revisits the success URL, and delayed payment methods
 * fire completed while still `incomplete`.
 */
export const ACTIVATABLE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

/**
 * Sentinel status for a row that holds the Checkout claim; not a real Stripe subscription.status.
 * The UNIQUE(user_id) constraint is the mutex, so this row is INSERTed before any Stripe call
 * (#103).
 */
export const CHECKOUT_PENDING_STATUS = "checkout_pending";

/**
 * Terminal statuses plus in-progress claim rows. Use this (not TERMINAL_SUBSCRIPTION_STATUSES)
 * wherever "has a current subscription" matters, so a pending claim is not shown as subscribed.
 */
export const NON_CURRENT_SUBSCRIPTION_STATUSES = [
  ...TERMINAL_SUBSCRIPTION_STATUSES,
  CHECKOUT_PENDING_STATUS,
];

/**
 * Slack between claimedAt and the actual Stripe session creation (Customer creation, DB writes,
 * retries). Added to the TTL so "session is expired by TTL" holds structurally.
 */
const CHECKOUT_CLAIM_GRACE_MS = 10 * 60 * 1000;

/**
 * After this, another request may take over the claim. Only a fallback for when the session state
 * cannot be fetched from Stripe; normally claimCheckoutSlot() inspects the session (open /
 * expired / complete).
 * Must stay longer than the session lifetime (derived from constants): if inverted, a
 * still-payable old session survives while a new Checkout is created, reopening the
 * double-subscription window.
 */
export const CHECKOUT_CLAIM_TTL_MS = CHECKOUT_SESSION_LIFETIME_MS + CHECKOUT_CLAIM_GRACE_MS;

/**
 * Lower-bound margin (seconds) for listing sessions, covering clock skew between the app DB and
 * Stripe.
 */
const CLAIM_LOOKUP_SKEW_SEC = 120;

/**
 * Includes `no_payment_required` (Price with a trial period): the webhook promotes on `trialing`,
 * so allowing only `paid` here would show a false "payment not confirmed" error for trials.
 */
export const PAID_CHECKOUT_PAYMENT_STATUSES: Stripe.Checkout.Session.PaymentStatus[] = [
  "paid",
  "no_payment_required",
];

/** Throws when STRIPE_SECRET_KEY is missing so every payment path fails before calling Stripe. */
export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe環境変数が設定されていません: STRIPE_SECRET_KEY");
  }
  // apiVersion is left to the SDK pin (Stripe.API_VERSION); setting it explicitly breaks types on
  // every SDK minor update (docs/specification.md 2.11).
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
 * user_id goes in both client_reference_id and metadata so webhooks can identify the user from
 * either.
 * `customerId` must come from ensureCheckoutCustomer(). Relying on `customer_email` makes Stripe
 * create a new Customer per Checkout, splitting cards/invoices and producing subscriptions absent
 * from the mirror (not cancellable via Portal). Re-creating a Customer that no longer exists on
 * Stripe persists to the DB, so the caller (createCheckoutSessionForUser()) does it.
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
  // On failure to determine proration, fall back to the safe side (prorate) so a transient Price
  // fetch error does not fail Checkout.
  let belowMinimum = false;
  try {
    belowMinimum = await isProrationBelowMinimum(now);
  } catch (error) {
    console.error("最低請求額判定エラー:", error);
  }
  const prorationBehavior: Stripe.Checkout.SessionCreateParams.SubscriptionData.ProrationBehavior =
    belowMinimum ? "none" : "create_prorations";

  // Fixed to the minimum lifetime instead of Stripe's 24h default, for two reasons.
  // 1. The claim TTL releases abandoned claims; if the old session were still payable at that
  //   point, old and new sessions could both complete (double subscription).
  // 2. Proration is waived (proration_behavior: "none") because the anchor is near. If a session
  //   opened in the free window were paid after the anchor passes, Stripe would pick the next
  //   anchor a month later and grant ~1 month free. Expiring before the anchor prevents this
  //   whenever the anchor is 32+ minutes away; closer than that Stripe's 30-minute minimum
  //   prevents it, but the free window is small so the exposure is accepted (fully closing it
  //   needs pausing new Checkouts near the anchor, out of scope).
  const expiresAtUnix = Math.floor((now.getTime() + CHECKOUT_SESSION_LIFETIME_MS) / 1000);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // Card only: delayed-notification methods (convenience store, bank transfer) can leave
    // subscription.status `incomplete` when checkout.session.completed fires, breaking the
    // assumption that membership starts on return from Checkout.
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: String(userId),
    customer: customerId,
    expires_at: expiresAtUnix,
    metadata: { user_id: String(userId), auth_id: authId },
    subscription_data: {
      metadata: { user_id: String(userId), auth_id: authId },
      // Billing day is fixed for all users. hour/minute/second must be explicit, otherwise the
      // subscription creation time is used and billing time varies per user.
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
 * `claimReleasable`: whether we can be sure no live Checkout Session remains on Stripe. If false
 * the caller must NOT release the claim; releasing would allow another Checkout while an
 * unrecorded live session exists (double subscription). A retained claim is resolved by
 * claimCheckoutSlot() recovery (reusing the Customer's live session) or by the TTL.
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
 * True only for a definite rejection (4xx). Timeouts, 5xx and unknown errors cannot rule out that
 * a session was created.
 */
function isDefinitelyNotCreated(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return false;
  }
  const status = error.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

function isMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeError &&
    error.code === "resource_missing" &&
    error.param === "customer"
  );
}

/**
 * Ensures exactly one Stripe Customer per user, reusing the one saved on the mirror row and
 * creating it only if missing.
 * Passing only `customer_email` to Checkout makes Stripe create Customers implicitly;
 * concurrent/repeated Checkouts then split them and the unmirrored one cannot be cancelled via
 * /api/stripe/portal (which only reads the mirrored stripe_customer_id). Fixing and persisting
 * the Customer before Checkout prevents that.
 * The idempotency key is per user so a retry after a failed DB save gets the same Customer
 * instead of an orphan (keys last 24h). It also includes an email hash because Stripe errors on
 * the same key with different params, which would block Checkout for 24h after an email change.
 * @param claimedAt claim time held by the caller; writing only to the row with this value avoids
 *   overwriting a Customer secured by another request after the claim was taken over.
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
  // Acquire the admin client before calling Stripe: creating a Customer we cannot persist would
  // orphan it.
  const supabase = await createAdminSupabaseClient();

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    { email, metadata: { user_id: String(userId), auth_id: authId } },
    { idempotencyKey }
  );

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
    // Claim was lost (e.g. TTL takeover). Proceeding without persisting the Customer would create
    // a subscription missing from the mirror (not cancellable via Portal), so abort.
    throw new Error("Checkout作成の処理権が失われました");
  }

  return customer.id;
}

/**
 * Runs from Customer setup through session creation for a user holding the claim. If the saved
 * Customer is gone on Stripe (e.g. deleted in the dashboard), recreate it and retry once,
 * otherwise the user could never reach Checkout. The recreation idempotency key includes the lost
 * Customer ID so the same loss returns the same Customer.
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
    // Only a 4xx proves no session was created; timeouts/5xx may have created one, so the claim
    // must not be released.
    throw new CheckoutCreationError(
      "Checkoutセッションの作成に失敗しました",
      isDefinitelyNotCreated(error),
      error
    );
  }

  // Without the recorded id the session cannot be tied to the claim, and replaying an old success
  // URL that releases the claim would leave two live sessions. Expire the fresh session so no
  // live session remains, then fail.
  const saved = await saveCheckoutSessionId(userId, claimedAt, session.id);
  if (!saved) {
    const expired = await expireCheckoutSession(session.id);
    throw new CheckoutCreationError("Checkoutセッションを記録できませんでした", expired);
  }

  return { url: session.url };
}

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

/** Returns false if the session was already complete or expired. */
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

export async function createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
  const appUrl = getAppUrl();
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/upgrade`,
  });

  return { url: session.url };
}

export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return await stripe.checkout.sessions.retrieve(sessionId);
}

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPrice: { data: Stripe.Price; expiresAt: number } | null = null;

/**
 * Module-scope TTL cache: the Price rarely changes (edited by operators in the dashboard).
 * Per-instance on serverless but effective on warm instances. Shared by fetchSubscriptionPrice()
 * and isProrationBelowMinimum().
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
 * The anchor and proration math assume monthly billing; used to catch misconfigured Prices (e.g.
 * yearly) so callers fall back to the safe side.
 */
function isPlainMonthlyPrice(price: Stripe.Price): boolean {
  return price.recurring?.interval === "month" && (price.recurring.interval_count ?? 1) === 1;
}

/**
 * unit_amount is treated as JPY yen (zero-decimal currency); multi-currency is out of scope (same
 * assumption as the Slack payment-failure notice).
 * Returns `amount: null` when the Price is not monthly so the caller rejects Checkout (avoids "/
 * month" display diverging from the real interval).
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

function anchorAt(year: number, monthIndex: number): Date {
  return new Date(
    Date.UTC(year, monthIndex, BILLING_ANCHOR_DAY_OF_MONTH, BILLING_ANCHOR_HOUR_UTC, 0, 0)
  );
}

/**
 * `nextAnchor - previousAnchor` is one full-price cycle for the first charge; computed from dates
 * so month length and leap years are handled like Stripe's proration.
 */
function getBillingAnchorWindow(now: Date): { previousAnchor: Date; nextAnchor: Date } {
  const anchorThisMonth = anchorAt(now.getUTCFullYear(), now.getUTCMonth());
  const nextAnchor =
    now < anchorThisMonth ? anchorThisMonth : anchorAt(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const previousAnchor = anchorAt(nextAnchor.getUTCFullYear(), nextAnchor.getUTCMonth() - 1);
  return { previousAnchor, nextAnchor };
}

/**
 * True only for a signup right before the anchor, where the caller switches to
 * `proration_behavior: "none"`. The free window is inversely proportional to the monthly price
 * (~12.4h at JPY 3000), unlike blanket "none" which would allow nearly a month free, so it is not
 * an exploitable gap.
 * For unexpected Prices (non-JPY, no amount, not monthly per isPlainMonthlyPrice()) it returns
 * false (prorate) so Stripe errors surface the misconfiguration.
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

/** Uses the regular client: RLS returns only the user's own row (or any row for admin). */
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
 * Result of claimCheckoutSlot().
 * - claimed: claim acquired (new, released, or taken over from an expired session)
 * - reusable: a live Checkout Session exists; reuse its URL
 * - blocked: the claim holds a completed session that was never reflected (webhook and success
 *   page both failed). The caller must apply `completedSessions` via
 *   activateUserFromCheckoutSession() and then claim again (#250). `heldClaimedAt` is the raw DB
 *   value and is passed as `expectedClaimedAt` so a claim re-acquired by a concurrent request is
 *   not released. Applying is not done here because stripe-webhook-server.ts imports this file
 *   (avoids a circular import).
 * - conflict: already subscribed, or another attempt is in progress
 */
export type CheckoutSlotClaim =
  | { outcome: "claimed"; claimedAt: string; stripeCustomerId: string | null }
  | { outcome: "reusable"; url: string }
  | { outcome: "blocked"; completedSessions: Stripe.Checkout.Session[]; heldClaimedAt: string }
  | { outcome: "conflict" }
  | { outcome: "error"; message: string };

type ClaimCondition =
  | { kind: "released" } // released (checkout_claimed_at IS NULL)
  | { kind: "stale"; before: string } // abandoned beyond the TTL
  | { kind: "held"; claimedAt: string }; // the claim seen earlier is still in place

/**
 * Atomically acquires the per-user Checkout claim (#103). Call BEFORE creating a Stripe Session.
 * The UNIQUE(user_id) constraint is the mutex; INSERTing a checkout_pending row is the claim
 * (same pattern as stripe_events). A plain SELECT would let concurrent requests slip through
 * while no mirror row exists before payment completes, creating two sessions.
 * If a row exists, only a row with no current subscription (NON_CURRENT_SUBSCRIPTION_STATUSES)
 * and a takeable claim is taken via a conditional UPDATE; the condition check and write are one
 * statement, so under concurrency exactly one wins (PostgreSQL re-evaluates the condition after
 * taking the row lock).
 * When a live claim exists, branch on its Checkout Session state:
 * - open: return the same URL, so a user who abandoned the flow is neither locked out until the
 *   TTL nor given two sessions
 * - expired: take over exactly the claim we read (CAS)
 * - complete (paid, awaiting reflection): never take over, which would create a second
 *   subscription on top of a paid one. Complete is immutable and never resolved by the TTL, so
 *   return `blocked` and let the caller reflect it and release the claim
 * Only when Stripe cannot be queried (no session id recorded, API outage) fall back to TTL
 * recovery.
 * @returns claimed.stripeCustomerId is the Customer already saved on the row (null for new users)
 */
export async function claimCheckoutSlot(
  userId: number,
  now: Date = new Date()
): Promise<CheckoutSlotClaim> {
  const supabase = await createAdminSupabaseClient();
  const claimedAt = now.toISOString();

  // No row yet: the INSERT itself is the claim (new Customer, so stripeCustomerId is null).
  const { error: insertError } = await supabase.from("stripe_subscriptions").insert({
    user_id: userId,
    status: CHECKOUT_PENDING_STATUS,
    checkout_claimed_at: claimedAt,
  });

  if (!insertError) {
    return { outcome: "claimed", claimedAt, stripeCustomerId: null };
  }
  // Anything other than a unique violation (23505) is a real DB error.
  if (insertError.code !== "23505") {
    console.error("Checkout処理権のclaimエラー:", insertError.message);
    return { outcome: "error", message: insertError.message };
  }

  // Row exists. First try taking a released claim; a user with only a cancelled row normally
  // re-subscribes through this path.
  const released = await takeCheckoutSlot(supabase, userId, claimedAt, { kind: "released" });
  if (released.outcome !== "conflict") {
    return released;
  }

  // Not taken: either subscribed or another attempt is in progress; decide from the existing row.
  const { data: existing, error: fetchError } = await supabase
    .from("stripe_subscriptions")
    .select(
      "status, checkout_claimed_at, checkout_session_id, stripe_customer_id, stripe_subscription_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("Checkout処理権の状態取得エラー:", fetchError.message);
    return { outcome: "error", message: fetchError.message };
  }
  // An active subscription (neither terminal nor pending) must not be re-subscribed.
  if (!existing || !NON_CURRENT_SUBSCRIPTION_STATUSES.includes(existing.status)) {
    return { outcome: "conflict" };
  }

  const heldClaimedAt = existing.checkout_claimed_at;
  if (heldClaimedAt) {
    const resolution = await resolveHeldSession(
      existing.checkout_session_id,
      existing.stripe_customer_id,
      heldClaimedAt,
      existing.stripe_subscription_id
    );
    if (resolution.kind === "reusable") {
      return { outcome: "reusable", url: resolution.url };
    }
    if (resolution.kind === "blocked") {
      return {
        outcome: "blocked",
        completedSessions: resolution.completedSessions,
        heldClaimedAt,
      };
    }
    if (resolution.kind === "pending") {
      return { outcome: "conflict" };
    }
    if (resolution.kind === "finished") {
      // Confirmed no live session, so take over without waiting for the TTL.
      return await takeCheckoutSlot(supabase, userId, claimedAt, {
        kind: "held",
        claimedAt: heldClaimedAt,
      });
    }
  }

  // State could not be confirmed (Stripe unresponsive, no Customer): fall back to TTL recovery.
  const staleBefore = new Date(now.getTime() - CHECKOUT_CLAIM_TTL_MS).toISOString();
  return await takeCheckoutSlot(supabase, userId, claimedAt, {
    kind: "stale",
    before: staleBefore,
  });
}

/**
 * Determines the state of the Checkout Session held by a live claim.
 * - reusable: a payable session exists (send the user to the same URL)
 * - blocked: paid and awaiting reflection (must not be taken over); returns the paid sessions to
 *   reflect
 * - pending: a paid session coexists with a still-payable one that could not be expired (neither
 *   reflect nor take over; make the user wait)
 * - finished: confirmed no live session (may take over)
 * - unknown: Stripe could not be queried (defer to TTL)
 * Without a recorded session id (e.g. aborted before recording), list the Customer's sessions
 * created since the claim to catch unrecorded live sessions without waiting for the TTL.
 * All paid sessions are returned because the lookup path can find several; returning only one
 * would hide the case where it is cancelled and another is live, so the claim could be released
 * and a second subscription created.
 * Sessions whose subscription is already in the mirror (`mirroredSubscriptionId`) are not counted
 * as paid: the lookup includes sessions created before the claim (CLAIM_LOOKUP_SKEW_SEC), so the
 * previous subscription's session can appear. Counting it would re-reflect an already reflected
 * session and release the in-progress claim, or count as "multiple" and block automatic recovery
 * permanently.
 */
async function resolveHeldSession(
  sessionId: string | null,
  customerId: string | null,
  claimedAt: string,
  mirroredSubscriptionId: string | null
): Promise<
  | { kind: "reusable"; url: string }
  | { kind: "blocked"; completedSessions: Stripe.Checkout.Session[] }
  | { kind: "pending" }
  | { kind: "finished" }
  | { kind: "unknown" }
> {
  const sessions = sessionId
    ? await retrieveClaimedSession(sessionId)
    : await listSessionsSinceClaim(customerId, claimedAt);

  if (sessions === null) {
    return { kind: "unknown" };
  }
  const completedSessions = sessions.filter(
    (session) =>
      session.status === "complete" &&
      (mirroredSubscriptionId === null || subscriptionIdOf(session) !== mirroredSubscriptionId)
  );
  if (completedSessions.length > 0) {
    // Sending the user to a payable session while a paid one exists risks double payment. Expire
    // them first; if any cannot be expired (e.g. paid meanwhile), make the user wait.
    const openSessions = sessions.filter((session) => session.status === "open");
    const expired = await Promise.all(
      openSessions.map((openSession) => expireCheckoutSession(openSession.id))
    );
    if (expired.includes(false)) {
      return { kind: "pending" };
    }
    return { kind: "blocked", completedSessions };
  }
  const openSession = sessions.find((session) => session.status === "open" && session.url);
  if (openSession?.url) {
    return { kind: "reusable", url: openSession.url };
  }
  return { kind: "finished" };
}

function subscriptionIdOf(session: Stripe.Checkout.Session): string | null {
  return typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription?.id ?? null);
}

/** Returns null when it cannot be fetched (defer to TTL). */
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
 * Lower bound is the claim time so sessions completed for past subscriptions are not picked up
 * (which would wrongly block re-subscription).
 */
async function listSessionsSinceClaim(
  customerId: string | null,
  claimedAt: string
): Promise<Stripe.Checkout.Session[] | null> {
  if (!customerId) {
    // No Customer means no session was created, but that is not certain, so defer to TTL.
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
 * Conditional UPDATE body of claimCheckoutSlot(); targets only rows with no current subscription
 * (NON_CURRENT_SUBSCRIPTION_STATUSES).
 * Subscription traces (`stripe_subscription_id`, cancel-at-period-end, period end) are kept:
 * `paused` / `unpaid` can recover on Stripe, and without the id syncSubscriptionStatus() cannot
 * match the later customer.subscription.updated, leaving a paid user demoted. A new subscription
 * overwrites them via the activateUserFromCheckoutSession() upsert.
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
      // The old (expired) session becomes irrelevant once taken over.
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
 * Records the session id on the claim row so the next request can ask Stripe whether that attempt
 * is still live. Returns whether it was recorded (returning the URL without it would make an
 * in-progress attempt indistinguishable from a stale session).
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
  // 0 rows: the claim was taken from us; this session cannot be tied to our claim.
  return (saved?.length ?? 0) > 0;
}

/**
 * Releases the claim from claimCheckoutSlot(); call when no session could be created (otherwise
 * the user cannot upgrade until the TTL expires).
 * The row is kept and only checkout_claimed_at is set to NULL: deleting the saved Customer would
 * make the next Checkout create an orphaning new one.
 * Matching on checkout_claimed_at avoids releasing a newer claim that another request took after
 * our TTL expired (same reason as releaseEventClaim()). A millisecond-precision match identifies
 * our own claim, so status is not in the condition (a concurrent webhook may have rewritten it).
 */
export async function releaseCheckoutSlot(
  userId: number,
  claimedAt: string
): Promise<{ error: string | null }> {
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
