/** Query parameter on /login carrying where to go after signing in. */
export const POST_LOGIN_NEXT_PARAM = "next";

/**
 * Carries the destination across the OAuth round trip. A cookie (not a redirectTo query) keeps the
 * Supabase redirect URL allowlist at the single /auth/callback entry. SameSite=Lax, like the
 * consent cookie, so it is sent on the top-level GET back to /auth/callback.
 */
export const POST_LOGIN_NEXT_COOKIE_NAME = "sinlab-post-login-next";
export const POST_LOGIN_NEXT_COOKIE_MAX_AGE = 1800;

const MAX_NEXT_PATH_LENGTH = 512;
const PLACEHOLDER_ORIGIN = "https://sinlab.invalid";

/** Sending the user back to these would loop or sign them out. */
const BLOCKED_PREFIXES = ["/login", "/auth/", "/rejected", "/api/"];

/**
 * Same-origin relative path (path + query) or null. Anything that could leave the site is
 * rejected: absolute URLs, protocol-relative `//host`, `/\host` (browsers treat `\` as `/`),
 * control characters, and encodings that only become one of those after decoding.
 */
export function sanitizePostLoginPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_PATH_LENGTH) {
    return null;
  }
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  // Backslashes and control characters (incl. tab/newline, which URL parsing silently strips) have
  // no business in an internal path.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) {
    return null;
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decodedPath.startsWith("//") || decodedPath.includes("\\")) {
    return null;
  }
  const path = `${url.pathname}${url.search}`;
  if (path === "/") {
    return null;
  }
  const lowered = url.pathname.toLowerCase();
  if (BLOCKED_PREFIXES.some((prefix) => lowered === prefix || lowered.startsWith(prefix))) {
    return null;
  }
  return path;
}

/** `/login`, with the destination attached when there is a usable one. */
export function buildLoginPath(next: string | null | undefined, error?: string): string {
  const params = new URLSearchParams();
  if (error) {
    params.set("error", error);
  }
  const safeNext = sanitizePostLoginPath(next);
  if (safeNext) {
    params.set(POST_LOGIN_NEXT_PARAM, safeNext);
  }
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
