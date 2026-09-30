/**
 * Request header names passing user info from proxy.ts downstream (Server Components /
 * getServerAuth). To prevent spoofing, proxy.ts always strips these from incoming requests and sets
 * them again only after auth and the DB lookup succeed.
 */
export const AUTH_HEADERS = {
  AUTH_ID: "x-sinlab-auth-id",
  USER_ID: "x-sinlab-user-id",
  USER_STATUS: "x-sinlab-user-status",
  USER_ROLE: "x-sinlab-user-role",
} as const;

export const AUTH_HEADER_NAMES: readonly string[] = Object.values(AUTH_HEADERS);

/**
 * Short-lived cookie showing consent to the terms/privacy policy at first sign-up.
 * GoogleLoginButton sets it right before signInWithOAuth; the first-registration branch of
 * app/auth/callback/route.ts requires it. SameSite=Lax so it is sent on the top-level GET
 * navigation across the OAuth round trip (Google -> Supabase -> /auth/callback).
 */
export const TERMS_CONSENT_COOKIE_NAME = "sinlab-terms-consent";

/** Cookie value; must match the callback's presence check. */
export const TERMS_CONSENT_COOKIE_VALUE = "1";

/**
 * Cookie lifetime (seconds): 30 min so slow OAuth round trips (Google account selection, 2FA) don't
 * expire it. The callback deletes it on every path and it only gates the INSERT (consent is
 * recorded in terms_accepted_at).
 */
export const TERMS_CONSENT_COOKIE_MAX_AGE = 1800;

export const TERMS_REQUIRED_ERROR_CODE = "terms_required";
