import { formatDate } from "@/app/lib/format-date";

/**
 * 解約予約の判定・利用期限の算出に使う、サブスクの期間まわりの値。
 * `stripe_subscriptions` のミラー行（日時は ISO 文字列）と同じ形で、Stripe から取り直した
 * ライブ状態も `subscriptionMirrorFields()` でこの形に写してから判定する。
 */
export type SubscriptionPeriodFields = {
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  current_period_end: string | null;
};

/**
 * 解約が予約されているか（終了する予定か）。classic billing mode の解約は
 * `cancel_at_period_end`、flexible billing mode（Stripe API 2025-09-30.clover 以降の新規サブスクの
 * 既定）の Customer Portal での解約は `cancel_at` に終了日時が入り `cancel_at_period_end` は
 * false のままになるため、両方を見る。
 */
export function isCancellationScheduled(
  fields: Pick<SubscriptionPeriodFields, "cancel_at_period_end" | "cancel_at">
): boolean {
  return fields.cancel_at_period_end || fields.cancel_at !== null;
}

/**
 * 解約予約中の契約を利用できる最終日時。`cancel_at` を優先し、無ければ（classic billing mode の
 * 期間末解約）`current_period_end`。どちらも無ければ null。
 */
export function cancellationEndsAt(fields: SubscriptionPeriodFields): string | null {
  return fields.cancel_at ?? fields.current_period_end;
}

/**
 * `/upgrade` の「ご契約中です（…）」に添える文言。解約予約中なら利用期限、そうでなければ
 * 次回のお支払い日を示す。日付が無い場合は null（文言を添えない）。
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
