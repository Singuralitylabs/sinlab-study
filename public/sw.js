/* Hashed /_next/static assets are cache-first. Icon URLs are unhashed placeholders, so they
 * are network-first; a cache-first hit would keep a replaced file on devices that already
 * loaded it. Navigations stay network-first so a demotion, rejection, or content lock is
 * never served from a stale authenticated HTML document. /offline is precached at install
 * because the navigate fallback only reads the cache. /api responses are not cached.
 * Bump STATIC_CACHE when offline HTML or caching rules change so activate drops old entries.
 * Push payloads are title/body/url only; the click opens a page through the same
 * network-first navigate handler. */
const STATIC_CACHE = "sinlab-static-v3";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isIcon(pathname) {
  return (
    pathname === "/icon.png" || pathname === "/apple-icon.png" || pathname.startsWith("/icons/")
  );
}

function isHashedBuildAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

function storeIfOk(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => storeIfOk(request, response))
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return Response.error();
      })
    );
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }
    return fetch(request).then((response) => storeIfOk(request, response));
  });
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
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isIcon(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isHashedBuildAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
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
          // focus alone leaves the existing tab on its current URL; navigate when supported.
          // Older clients without navigate cannot change the URL in-place, so open the target.
          // navigate() may resolve to null when the navigation is refused; fall back then too.
          return client.focus().then((focused) => {
            if (focused && "navigate" in focused) {
              // navigate() may reject (uncontrolled client) or resolve null; always open then.
              return focused
                .navigate(target)
                .then((navigated) => navigated ?? self.clients.openWindow(target))
                .catch(() => self.clients.openWindow(target));
            }
            return self.clients.openWindow(target);
          });
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
