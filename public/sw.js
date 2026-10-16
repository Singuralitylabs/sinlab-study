/* Cache only hashed build assets and icons. Navigations stay network-first so a demotion,
 * rejection, or content lock is never served from a stale authenticated HTML document.
 * /api responses are not cached. Push payloads are title/body/url only; the click opens a
 * page through the same network-first navigate handler. */
const STATIC_CACHE = "sinlab-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (!isStaticAsset(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

function notificationPath(data) {
  const url = data && typeof data.url === "string" ? data.url : "/";
  if (!url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }
  return url;
}

self.addEventListener("push", (event) => {
  const payload = { title: "Sinlab Study", body: "", url: "/" };
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && data.title) {
      payload.title = data.title;
    }
    if (data && typeof data.body === "string") {
      payload.body = data.body;
    }
    payload.url = notificationPath(data);
  } catch {
    // A bad payload still shows a generic notice. Nothing else is cached.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(notificationPath(event.notification.data), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
