/** Slide PDFs are served from a private bucket via signed URLs (#89). */
export const SLIDES_BUCKET = "slides";

/**
 * Signed URL lifetime (seconds). Issued server-side at page render; reloading after expiry
 * re-issues it. pdf.js
 * fetches the remaining chunks in the background right after display, so page turning doesn't fail
 * even if the
 * URL expires while viewing (#89).
 */
export const SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
