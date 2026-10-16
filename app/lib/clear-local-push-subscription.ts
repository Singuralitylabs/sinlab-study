import { CLEAR_LOCAL_PUSH_FETCH_TIMEOUT_MS } from "@/app/constants/notifications";

/**
 * Best-effort browser + server cleanup before sign-out. A shared device must not keep delivering
 * the previous account's notifications after logout; failures must not block sign-out.
 */
export async function clearLocalPushSubscription(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    if (!endpoint) {
      return;
    }
    // Bound the DELETE so an offline / hung API cannot stall logout after unsubscribe.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLEAR_LOCAL_PUSH_FETCH_TIMEOUT_MS);
    try {
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Sign-out continues even when push cleanup fails.
  }
}
