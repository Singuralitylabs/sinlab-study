export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}
