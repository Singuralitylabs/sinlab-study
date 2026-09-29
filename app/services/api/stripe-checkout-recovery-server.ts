import Stripe from "stripe";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  extractUserId,
  reactivateUserFromMirror,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

/**
 * Self-recovery for the Checkout API (`POST /api/stripe/checkout`) (#250).
 * If both the webhook and the success page fail, the Checkout claim keeps holding a paid session
 * and 409 would continue forever. This resolves it with the same idempotent reflection as the
 * webhook. Lives in its own module because stripe-webhook-server.ts imports stripe-server.ts and
 * this needs both (avoids a circular import).
 */

/**
 * Window (minutes) for suppressing duplicate unrecoverable notices: the same state is notified
 * once per window.
 */
const RECOVERY_NOTICE_INTERVAL_MINUTES = 60;

/**
 * `stripe_events` type used to deduplicate unrecoverable notices (distinct from webhook event
 * types).
 */
const RECOVERY_NOTICE_TYPE = "app.checkout_recovery_notice";

export type CheckoutRecovery =
  | { kind: "activated"; sessionId: string }
  | { kind: "applied" }
  | { kind: "unrecoverable" }
  | { kind: "error" };

/**
 * Reflects paid sessions still held by the claim through the existing idempotent path. Reflection
 * writes the live subscription state to the mirror and releases the claim (promoting to member
 * when the subscription is valid). If not promoted (applied), the caller re-claims and branches
 * on the mirror's actual state.
 * Not reflected automatically (unrecoverable) and reported to operators; these states do not
 * change over time, so retrying gives the same result:
 * - multiple paid sessions (normally impossible with one claim): if the first reflection releases
 *   the claim and the second fails, a next Checkout could be created while the second valid
 *   subscription remains (double subscription)
 * - session user does not match the caller: it would write someone else's subscription
 * - session has no customer / subscription: reflection always fails
 * - Stripe returned a permanent error (4xx such as subscription missing)
 * @param heldClaimedAt claim time used for the decision, so this reflection cannot release a
 *   claim re-acquired by a concurrent request (see activateUserFromCheckoutSession()).
 * @returns activated: promoted to member / applied: reflected but not promoted / unrecoverable:
 *   not reflected automatically / error: transient failure (retried on the next request if the
 *   claim remains)
 */
export async function recoverCompletedCheckout(
  userId: number,
  sessions: Stripe.Checkout.Session[],
  heldClaimedAt: string
): Promise<CheckoutRecovery> {
  const sessionIds = sessions.map((session) => session.id);
  const unrecoverable = async (reason: string): Promise<CheckoutRecovery> => {
    console.error(`決済済みCheckoutを自動復旧できません（${reason}）:`, userId, sessionIds);
    await notifyUnrecoverable(userId, reason, sessionIds);
    return { kind: "unrecoverable" };
  };

  if (sessions.length !== 1) {
    return await unrecoverable("決済済みのセッションが複数あります");
  }
  const [session] = sessions;
  // Customers are unique per user, so normally these match.
  if (extractUserId(session.client_reference_id, session.metadata) !== userId) {
    return await unrecoverable("セッションのユーザーが一致しません");
  }
  if (!session.customer || !session.subscription) {
    return await unrecoverable("セッションにcustomer/subscription情報がありません");
  }

  try {
    const result = await activateUserFromCheckoutSession(session, {
      expectedClaimedAt: heldClaimedAt,
    });
    if (result.error) {
      console.error("決済済みCheckoutセッションの反映エラー:", result.error);
      return { kind: "error" };
    }
    return result.activated ? { kind: "activated", sessionId: session.id } : { kind: "applied" };
  } catch (error) {
    if (isPermanentStripeError(error)) {
      return await unrecoverable(`Stripeが処理を拒否しました（${error.statusCode}）`);
    }
    console.error("決済済みCheckoutセッションの反映エラー:", error);
    return { kind: "error" };
  }
}

/**
 * Repairs the inconsistency where the mirror records a subscription but the user is not promoted,
 * when a trial user's Checkout hits conflict (see reactivateUserFromMirror()). The caller can
 * still return 409 on failure, so exceptions are swallowed and false is returned.
 */
export async function reactivatePaidTrialUser(userId: number): Promise<boolean> {
  try {
    const { error, activated } = await reactivateUserFromMirror(userId);
    if (error) {
      console.error("契約済みユーザーの再昇格エラー:", error);
    }
    return activated;
  } catch (error) {
    console.error("契約済みユーザーの再昇格エラー:", error);
    return false;
  }
}

/**
 * Whether retrying cannot change the outcome (4xx). 409 (concurrency conflict) and 429 (rate
 * limit) are excluded since they can pass later; network errors and 5xx are treated as transient.
 */
function isPermanentStripeError(error: unknown): error is Stripe.errors.StripeError & {
  statusCode: number;
} {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return false;
  }
  const status = error.statusCode;
  return (
    typeof status === "number" && status >= 400 && status < 500 && status !== 409 && status !== 429
  );
}

/**
 * Notifies operators of an unrecoverable state. The same state repeats on every user click, so
 * notify once per RECOVERY_NOTICE_INTERVAL_MINUTES per user and session (prevents mashing or
 * scripts from flooding the ops channel). Deduplication uses the `stripe_events`
 * unique-constraint claim with a prefixed key that cannot collide with webhook event ids. If the
 * check itself fails, err on sending so no notice is lost.
 */
async function notifyUnrecoverable(
  userId: number,
  reason: string,
  sessionIds: string[]
): Promise<void> {
  let shouldNotify = true;
  try {
    const { claimed, error } = await claimEvent(
      `checkout_recovery_notice:${userId}:${sessionIds.join(",")}`,
      RECOVERY_NOTICE_TYPE,
      RECOVERY_NOTICE_INTERVAL_MINUTES
    );
    if (!error) {
      shouldNotify = claimed;
    }
  } catch (error) {
    console.error("自動復旧不可通知の重複判定エラー:", error);
  }
  if (shouldNotify) {
    await sendSlackCheckoutRecoveryNotification({ userId, reason, sessionIds });
  }
}
