const CACHE_NAME = "verifyor-pwa-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/admin-db.html",
  "/search-db.html",
  "/settings.html",
  "/styles.css",
  "/local-store.js",
  "/app.js",
  "/admin-db.js",
  "/search-db.js",
  "/settings.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

const ROUTE_FALLBACKS = {
  "/admin/db": "/admin-db.html",
  "/search/db": "/search-db.html",
  "/settings": "/settings.html"
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    const fallback = ROUTE_FALLBACKS[url.pathname] || "/index.html";
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((response) => response || caches.match(fallback)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
