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
    await fetch("/api/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Sign-out continues even when push cleanup fails.
  }
}
