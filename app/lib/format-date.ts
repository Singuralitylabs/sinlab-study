const JST = "Asia/Tokyo";

/**
 * All screens and emails format dates in JST explicitly. Without `timeZone`, server components
 * (Vercel runs in UTC) show values 9 hours behind, and client components render different strings
 * on SSR (UTC) and in the browser (JST), causing hydration mismatches.
 *
 * Shared by /upgrade's next billing/cancellation date and the paid-membership /
 * cancellation-scheduled emails, so the screen and emails use the same notation (JST date).
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: JST });
}

/** JST date with zero-padded month/day (e.g. 2026/10/05). */
export function formatDatePadded(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** JST date and time with seconds (e.g. 2026/10/11 8:00:00). */
export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString("ja-JP", { timeZone: JST });
}

/** JST zero-padded date and time to the minute (e.g. 2026/10/05 08:00). */
export function formatDateTimeMinute(isoString: string | Date): string {
  return new Date(isoString).toLocaleString("ja-JP", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "<JST date and time>（<editor>）" for settings/template rows. `noEditorLabel`: what a NULL
 * updated_by means for the row (seeded value, or a deleted user).
 */
export function formatUpdatedWithEditor(
  updatedAt: string,
  updatedBy: number | null,
  editorNames: Record<number, string>,
  noEditorLabel = "不明"
): string {
  const who = updatedBy !== null ? (editorNames[updatedBy] ?? "不明") : noEditorLabel;
  return `${formatDateTime(updatedAt)}（${who}）`;
}
