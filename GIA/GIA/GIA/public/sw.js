/**
 * GIA Showroom service worker.
 *
 * Goal: turn the second (and every subsequent) visit into an instant load on every
 * device — even cheap phones on bad networks — without ever serving a stale build.
 *
 * Strategy:
 *   • All Vite-emitted assets live under /assets/<name>-<contenthash>.<ext>.
 *     Their URL changes every time the file changes, so we can keep them forever.
 *   • The HTML shell (`/`, `/index.html`) is fetched network-first with a cache fallback,
 *     so a fresh deploy is always picked up while still working offline.
 *   • Anything else (manifest, sw, fonts) just falls through to the network.
 *   • A new SW takes over immediately so users never get stuck on a stale shell.
 */
const CACHE_VERSION = "gia-cache-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith("/assets/")) return false;
  return /-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(url.pathname);
}

function isHtmlNavigation(request, url) {
  if (request.mode === "navigate") return true;
  if (url.origin !== self.location.origin) return false;
  return url.pathname === "/" || url.pathname.endsWith("/index.html");
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isHtmlNavigation(request, url)) {
    event.respondWith(networkFirst(request));
  }
});
