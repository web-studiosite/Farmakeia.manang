// FARMAKEIA Service Worker — Offline Caching & PWA Engine
const CACHE_NAME = 'farmakeia-pwa-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.png'
];

// Install Event: Pre-cache critical application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Gracefully attempt caching each item without failing entire worker if one path differs
      await Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn(`[PWA SW] Could not pre-cache: ${url}`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up outdated caches and claim active clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-first for dynamic data & navigation, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore non-GET requests or chrome-extension schemes
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Skip caching Supabase and external real-time APIs to ensure fresh database queries
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/v1')) {
    return;
  }

  // HTML Navigation: Network-first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html') || await caches.match('/');
          return fallback || new Response('Offline - FARMAKEIA', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // Static Assets (Fonts, CSS, JS, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
