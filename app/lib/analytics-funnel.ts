/**
 * First-time gates for funnel events. Kept pure so the "only the first row" rule
 * can be tested without the route or Stripe client.
 */

/** True when this completion is the user's first ever (ever_completed count is still 0). */
export function shouldTrackFirstCompletion(
  isCompleted: boolean,
  existingCompletedCount: number
): boolean {
  return isCompleted && existingCompletedCount === 0;
}

/** True when this insert creates the user's first submission. */
export function shouldTrackFirstSubmission(existingSubmissionCount: number): boolean {
  return existingSubmissionCount === 0;
}

/**
 * `activated` stays true when the webhook or the success page replays a user who is
 * already general. Only the call that changed the row is the first upgrade, the same
 * gate as the upgraded email (a later replay must not emit checkout_completed again).
 */
export function shouldTrackCheckoutCompleted(activated: boolean, changed: boolean): boolean {
  return activated && changed;
}

/** App-relative paths (/upgrade, /upgrade/success) are not Stripe Checkout URLs. */
export function isExternalCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}
