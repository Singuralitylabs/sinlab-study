import { formatDate } from "@/app/lib/format-date";

/**
 * Subscription period values used to decide cancellation-scheduled state and access end. Same shape
 * as the stripe_subscriptions mirror row (ISO strings); live state re-fetched from Stripe is mapped
 * into this shape via subscriptionMirrorFields() before judging.
 */
export type SubscriptionPeriodFields = {
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  current_period_end: string | null;
};

/**
 * Whether a cancellation is scheduled. In classic billing mode it's cancel_at_period_end; in
 * flexible billing mode (default for new subscriptions since Stripe API 2025-09-30.clover) a
 * Customer Portal cancellation sets cancel_at while cancel_at_period_end stays false, so check
 * both.
 */
export function isCancellationScheduled(
  fields: Pick<SubscriptionPeriodFields, "cancel_at_period_end" | "cancel_at">
): boolean {
  return fields.cancel_at_period_end || fields.cancel_at !== null;
}

/**
 * Last moment a cancellation-scheduled contract can be used: cancel_at first, else
 * current_period_end (classic period-end cancellation), else null.
 */
export function cancellationEndsAt(fields: SubscriptionPeriodFields): string | null {
  return fields.cancel_at ?? fields.current_period_end;
}

/**
 * Text appended to /upgrade's "contracted" message: the access end date if a cancellation is
 * scheduled, otherwise the next payment date. null when there's no date (no text appended).
 */
export function subscriptionPeriodLabel(fields: SubscriptionPeriodFields): string | null {
  if (isCancellationScheduled(fields)) {
    const endsAt = cancellationEndsAt(fields);
    return endsAt ? `${formatDate(endsAt)}をもって解約予定です` : null;
  }
  return fields.current_period_end
    ? `次回のお支払い: ${formatDate(fields.current_period_end)}`
    : null;
}
