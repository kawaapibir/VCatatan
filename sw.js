/* =========================================================
   ASCEND — Service Worker
   Strategy:
     - App shell (this app's own files + the Dexie CDN script):
       stale-while-revalidate → instant load from cache, refreshed
       silently in the background.
     - Dynamic data requests (anything to *.supabase.co or a
       future /api/ path, once Cloud Sync is enabled): network-first
       → always try the network so data is fresh, fall back to the
       last cached response when offline.
   ========================================================= */
const SHELL_CACHE = 'ascend-shell-v4';
const RUNTIME_CACHE = 'ascend-runtime-v4';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/4.2.0/dexie.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => console.warn('SW: gagal caching', asset, err))
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isDynamicDataRequest(url) {
  return url.hostname.endsWith('supabase.co') || url.pathname.includes('/api/');
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isDynamicDataRequest(url)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
