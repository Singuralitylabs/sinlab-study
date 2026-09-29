/**
 * Converts the content-management API's `storageRemoved` (Storage deletion result of the slide PDF)
 * into a screen warning (#241). The API doesn't fail the DB operation on a Storage deletion
 * failure; it returns { success: true, storageRemoved: false } (spec 6.1). The DB operation
 * succeeded, so the screen stays in the success state and warns that the slide PDF remains in
 * Storage (same as ThemeForm's thumbnail deletion). No warning when storageRemoved is missing or
 * true.
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

export function isSlideStorageRemovalFailed(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { storageRemoved?: unknown }).storageRemoved === false
  );
}

export function getSlideStorageWarning(
  data: unknown,
  operation: SlideStorageOperation
): string | null {
  return isSlideStorageRemovalFailed(data) ? SLIDE_STORAGE_WARNINGS[operation] : null;
}
