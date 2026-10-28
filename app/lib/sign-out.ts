import { SIGN_OUT_PATH } from "@/app/constants/auth";
import { clearLocalPushSubscription } from "@/app/lib/clear-local-push-subscription";

/**
 * Shared sign-out for the side nav and /rejected. The push subscription is released first so a
 * shared device stops receiving this account's notifications; the session itself is revoked by
 * POST /auth/signout (no supabase-js in the browser bundle). The redirect is a full navigation
 * so every Server Component re-renders without the session.
 */
export async function signOutAndRedirect(): Promise<void> {
  await clearLocalPushSubscription();
  try {
    // "manual": the 303 to /login is not followed here; the navigation below does it.
    await fetch(SIGN_OUT_PATH, { method: "POST", credentials: "same-origin", redirect: "manual" });
  } catch (error) {
    // Offline: the server could not revoke the session, so /login will bounce an active session
    // back to /. Surfacing that beats pretending the sign-out happened.
    console.error("[sign-out] サインアウト要求に失敗しました:", error);
  }
  window.location.href = "/login";
}
