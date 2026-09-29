/**
 * Shared by /upgrade's next billing/cancellation date and the paid-membership /
 * cancellation-scheduled emails, so
 * the screen and emails use the same notation (JST date).
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}
