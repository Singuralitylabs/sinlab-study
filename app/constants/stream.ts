/**
 * Playback token lifetimes for Cloudflare Stream (#488). The token is minted at page render and the
 * player cannot refresh it, so the member lifetime must outlast one sitting (a 25-minute video
 * paused for hours). The unauthenticated /demo gets a shorter one: its tokens are reachable by
 * anyone.
 */
export const STREAM_TOKEN_EXPIRES_IN_SECONDS = 6 * 60 * 60;
export const STREAM_DEMO_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;

/** Allowed clock skew for `nbf` so a token is not rejected by an edge whose clock is slightly behind. */
export const STREAM_TOKEN_NOT_BEFORE_SKEW_SECONDS = 60;

export const STREAM_THUMBNAIL_HEIGHT_PX = 360;
