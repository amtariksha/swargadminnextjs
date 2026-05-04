// Minimal service worker — exists primarily to satisfy the "installable PWA"
// criterion in Chrome / Edge / Safari iOS so drivers can "Add to Home Screen"
// the admin panel. We do NOT cache anything aggressively because the app is
// data-heavy and we want fresh content on every page load.
//
// If we ever need offline support, swap to next-pwa or Workbox.

const CACHE_NAME = 'swarg-admin-v1';

self.addEventListener('install', (event) => {
    // Activate immediately on first install — no waiting on existing tabs.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Take control of all clients (open tabs) immediately and clean up old
    // caches from a previous version of this SW.
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});

// Network-first for navigation requests so deploys propagate immediately.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.mode !== 'navigate') return;
    event.respondWith(
        (async () => {
            try {
                return await fetch(request);
            } catch {
                // Offline fallback: serve the root document if cached, else fail.
                const cache = await caches.open(CACHE_NAME);
                const cached = await cache.match('/');
                return cached || Response.error();
            }
        })()
    );
});
