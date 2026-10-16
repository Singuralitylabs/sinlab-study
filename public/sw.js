/* Hashed /_next/static assets are cache-first. Icon URLs are unhashed placeholders, so they
 * are network-first; a cache-first hit would keep a replaced file on devices that already
 * loaded it. Navigations stay network-first so a demotion, rejection, or content lock is
 * never served from a stale authenticated HTML document. /offline is precached at install
 * because the navigate fallback only reads the cache. /api responses are not cached.
 * Bump STATIC_CACHE when offline HTML or caching rules change so activate drops old entries.
 * push / notificationclick are added in the push stage. */
const STATIC_CACHE = "sinlab-static-v2";
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
