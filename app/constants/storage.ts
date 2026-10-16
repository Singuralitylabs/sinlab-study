/** Slide PDFs are served from a private bucket via signed URLs (#89). */
export const SLIDES_BUCKET = "slides";

/**
 * Signed URL lifetime (seconds). Issued server-side at page render; reloading after expiry
 * re-issues it. pdf.js fetches the remaining chunks in the background right after display, so page
 * turning doesn't fail even if the URL expires while viewing (#89).
 */
export const SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

/** Public bucket for Markdown images in text / slide articles (#376). */
export const CONTENT_IMAGES_BUCKET = "content-images";

/** Max upload size for content images (matches the Storage bucket limit). */
export const CONTENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const CONTENT_IMAGE_ALLOWED_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type ContentImageMimeType = keyof typeof CONTENT_IMAGE_ALLOWED_TYPES;
