const EXACT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
]);

function isAllowedPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (EXACT_PUSH_HOSTS.has(host)) {
    return true;
  }
  // Apple Push and WNS use regional subdomains.
  return host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
}

/**
 * True only for https endpoints on known browser push services. Rejects http, IP literals, and
 * other hosts so a crafted subscription cannot make the digest cron POST to an internal URL.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length === 0 || endpoint.length > 4096) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }
  return isAllowedPushHost(url.hostname);
}
