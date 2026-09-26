/**
 * コンテンツ管理APIの `storageRemoved`（スライドPDFの Storage 削除結果）を画面の警告文へ変換する
 * （issue #241）。
 *
 * API は Storage の削除失敗では DB 操作を失敗させず、`{ success: true, storageRemoved: false }`
 * を返す（機能設計書 6.1）。DB 側の操作は成立しているため画面は成功扱いのまま、
 * スライドPDFが Storage に残っている旨を警告する（`ThemeForm` のサムネイル削除と同じ扱い）。
 * `storageRemoved` が無い・`true` の応答では警告しない。
 */

export type SlideStorageOperation = "delete" | "update" | "bulkDelete";

const SLIDE_STORAGE_WARNINGS: Record<SlideStorageOperation, string> = {
  delete:
    "削除しましたが、紐づくスライドPDFの削除に失敗したため、ストレージ上にファイルが残っている可能性があります",
  update:
    "コンテンツを更新しましたが、差し替え前のスライドPDFの削除に失敗したため、ストレージ上にファイルが残っている可能性があります",
  bulkDelete:
    "コンテンツを削除しましたが、一部のスライドPDFの削除に失敗したため、ストレージ上にファイルが残っている可能性があります",
};

/** API レスポンスの JSON が Storage 削除の失敗（`storageRemoved: false`）を示しているか */
export function isSlideStorageRemovalFailed(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { storageRemoved?: unknown }).storageRemoved === false
  );
}

/** Storage 削除に失敗していれば警告文を、そうでなければ null を返す */
export function getSlideStorageWarning(
  data: unknown,
  operation: SlideStorageOperation
): string | null {
  return isSlideStorageRemovalFailed(data) ? SLIDE_STORAGE_WARNINGS[operation] : null;
}
