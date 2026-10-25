/**
 * video_url holds either a YouTube URL (legacy, still served by YouTubeEmbed) or a bare Cloudflare
 * Stream video UID (#488). Anything else is rejected so an arbitrary external URL can never reach
 * an iframe. Stream UIDs are 32 lowercase hex chars; the same rule is used by the admin API, the
 * admin form and the page that picks the player.
 */
const STREAM_UID_PATTERN = /^[0-9a-f]{32}$/;

// Allow a trailing slash while capturing only the ID (so `.../embed/abc123/` doesn't yield
// //hqdefault).
const YOUTUBE_URL_PATTERN =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#/]+)/;

export type VideoSource = { kind: "youtube"; videoId: string } | { kind: "stream"; uid: string };

export function extractYouTubeVideoId(url: string): string | null {
  return url.match(YOUTUBE_URL_PATTERN)?.[1] ?? null;
}

export function toStreamVideoUid(value: string | null | undefined): string | null {
  const uid = value?.trim().toLowerCase();
  return uid && STREAM_UID_PATTERN.test(uid) ? uid : null;
}

/** Stream UID wins; otherwise a YouTube URL; null for anything else (callers treat as invalid). */
export function parseVideoSource(value: string | null | undefined): VideoSource | null {
  if (!value) {
    return null;
  }
  const uid = toStreamVideoUid(value);
  if (uid) {
    return { kind: "stream", uid };
  }
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  const videoId = extractYouTubeVideoId(trimmed);
  return videoId ? { kind: "youtube", videoId } : null;
}
