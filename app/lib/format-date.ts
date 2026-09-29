/**
 * ISO文字列の日時を日本時間の日付（例: `2026/10/1`）で表示する。`/upgrade` の次回請求日・
 * 解約予定日と、有料会員化・解約予約メールの日付で共有し、画面とメールで表記をそろえる。
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}
