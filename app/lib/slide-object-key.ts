import { parsePositiveInteger } from "@/app/lib/positive-integer";

/**
 * pdf_url stores only the object key inside the `slides` bucket (#89). Legacy public URLs were
 * normalized by
 * migration, but can still arrive right after release or as the admin form's initial value, so they
 * are
 * converted here by the same rules.
 * The Storage policy compares `pdf_url = storage.objects.name` for equality, so this normalization
 * must match
 * the migration (20260908000000_secure_slides_bucket.sql): regexp_replace(btrim(pdf_url, E'
 * \t\r\n'), ...),
 * i.e. trim space/tab/CR/LF, then strip the prefix.
 */
const LEGACY_PUBLIC_URL_PREFIX = /^(?:https?:\/\/[^/]+)?\/storage\/v1\/object\/public\/slides\//;

/**
 * Single source of the naming convention <course-slug>/slide-NN.pdf (NN zero-padded to 2+ digits);
 * the upload
 * API and the admin UI both use it. Change the convention only here.
 */
export const SLIDE_FOLDER_PATTERN = /^[a-z0-9-]+$/;
export const SLIDE_FILE_NAME_PATTERN = /^slide-(\d+)\.pdf$/;
const SLIDE_OBJECT_KEY_PATTERN = /^([a-z0-9-]+)\/slide-(\d+)\.pdf$/;

export function buildSlideObjectKey(folder: string, slideNumber: number): string {
  return `${folder}/slide-${String(slideNumber).padStart(2, "0")}.pdf`;
}

/**
 * Trim exactly what the migration's btrim(pdf_url, E' \t\r\n') removes; String.prototype.trim also
 * strips
 * full-width spaces, so don't use it.
 */
function trimLikeMigration(value: string): string {
  return value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/**
 * The admin API normalizes blank to null so no empty-string rows exist (#243); same rule as the
 * migration
 * 20260926000000_normalize_blank_slide_pdf_url.sql (btrim(...) = '').
 */
export function isBlankSlidePdfUrl(pdfUrl: string): boolean {
  return trimLikeMigration(pdfUrl) === "";
}

/**
 * Returns null for values not interpretable as an object in the slides bucket (external URLs,
 * empty, leading
 * '/', paths containing '..'); callers treat null as unsignable.
 */
export function toSlideObjectKey(pdfUrl: string | null | undefined): string | null {
  if (!pdfUrl) {
    return null;
  }

  const key = trimLikeMigration(pdfUrl).replace(LEGACY_PUBLIC_URL_PREFIX, "");
  if (
    key === "" ||
    key.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(key) ||
    key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }

  return key;
}

export function parseSlideObjectKey(
  pdfUrl: string | null | undefined
): { folder: string; slideNumber: number } | null {
  const key = toSlideObjectKey(pdfUrl);
  const match = key?.match(SLIDE_OBJECT_KEY_PATTERN);
  if (!match) {
    return null;
  }

  // Aligns with explicit-number parsing in upload-pdf (#144). No practical effect since the input
  // is (\d+),
  // but this was the last place off the parsePositiveInteger() baseline. The domain cap is an
  // acceptance rule
  // and is not applied to existing keys.
  const slideNumber = parsePositiveInteger(match[2]);
  if (slideNumber === null) {
    return null;
  }

  return { folder: match[1], slideNumber };
}
