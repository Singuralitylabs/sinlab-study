/** Public key the browser needs to subscribe. Empty means the feature stays off. */
export function webPushPublicKey(): string | null {
  const value = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return value ? value : null;
}

/**
 * Subscribe and send both require every value. A public key alone would store endpoints that
 * can never be delivered, so the whole feature stays off until the private key and mailto
 * subject are set too.
 */
export function isWebPushConfigured(): boolean {
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  return Boolean(webPushPublicKey() && privateKey && subject.startsWith("mailto:"));
}
