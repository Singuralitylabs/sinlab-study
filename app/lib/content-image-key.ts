import { CONTENT_IMAGES_BUCKET } from "@/app/constants/storage";

/**
 * Object key under the content-images bucket: content-{contentId}/<randomId>.<ext>.
 * Random id avoids collisions when the same content uploads multiple images.
 */
export function buildContentImageObjectKey({
  contentId,
  extension,
  randomId,
}: {
  contentId: number;
  extension: string;
  randomId: string;
}): string {
  return `content-${contentId}/${randomId}.${extension}`;
}

/**
 * Markdown-ready reference using the storage placeholder (not a full URL), so the saved body stays
 * environment-independent. resolveMarkdownStorageUrls() expands it at display time.
 */
export function buildContentImageMarkdownRef(objectKey: string): string {
  return `{{SUPABASE_STORAGE_URL}}/${CONTENT_IMAGES_BUCKET}/${objectKey}`;
}

/** Inserts markdown image syntax at the caret (or appends when selection is unknown). */
export function insertMarkdownAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insertion: string
): { next: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
  return { next, caret: start + insertion.length };
}
