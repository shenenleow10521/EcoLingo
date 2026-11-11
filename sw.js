// EcoLingo service worker: network-first app shell with offline lessons and quizzes.
const VERSION = "ecolingo-v4";
const CORE = ["./", "index.html", "app.html", "landing.css", "landing.js", "workspace.css",
  "assets/rainforest.webp", "config.js", "manifest.webmanifest", "icons/icon.svg",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ecolingo-") && key !== VERSION).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (["code", "error", "error_code", "error_description"].some((key) => url.searchParams.has(key))) return;
    const cacheKey = request.mode === "navigate" ? url.origin + url.pathname : request;
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(cacheKey, response.clone()).catch(() => {});
        return response;
      } catch {
        const cached = await cache.match(cacheKey);
        return cached || Response.error();
      }
    }));
    return;
  }

  if (/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(url.hostname)) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === "opaque") await cache.put(request, response.clone()).catch(() => {});
      return response;
    }));
  }
});
