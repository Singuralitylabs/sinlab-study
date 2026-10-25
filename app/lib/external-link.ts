// Announcement bodies are also converted to email, where only absolute http(s) links survive, so
// operators write own-site links as absolute URLs. Treat the app's own origin as internal or those
// links would open a needless new tab. NEXT_PUBLIC_ vars are inlined, so this works client-side too.
export function isExternalHref(
  href: string | undefined,
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL
): href is string {
  if (href === undefined || !/^https?:\/\//i.test(href.trim())) {
    return false;
  }
  if (!appUrl) {
    return true;
  }
  try {
    return new URL(href.trim()).origin !== new URL(appUrl).origin;
  } catch {
    return true;
  }
}
