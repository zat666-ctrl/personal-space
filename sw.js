/*
 * MyKK Dashboard — Service Worker
 *
 * Provides offline support and instant loads for the single-file dashboard.
 *
 * Strategy:
 *   - App shell (same-origin: index.html, manifest, icons) is precached on
 *     install and served stale-while-revalidate — the cached copy renders
 *     instantly while a fresh copy is fetched in the background for next time.
 *   - A short allowlist of static CDN hosts (fonts, Leaflet, Firebase SDK,
 *     jsPDF) is runtime-cached the same way so the app boots offline.
 *   - Everything else (weather API, map tiles, Supabase sync, favicons for
 *     bookmarks, etc.) is passed straight through to the network so dynamic
 *     data is never served stale.
 *
 * Bump CACHE_VERSION whenever the precached shell changes so old caches are
 * purged on activate.
 */

const CACHE_VERSION = 'personal-space-v5';
const SHELL_CACHE = 'mykk-shell-' + CACHE_VERSION;
const RUNTIME_CACHE = 'mykk-runtime-' + CACHE_VERSION;

// Same-origin files that make up the app shell.
const SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './favicon.svg',
    './favicon.png',
    './personal-space.css',
    './personal-space.js',
];

// Cross-origin hosts whose static assets are safe to cache for offline boot.
const STATIC_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com',            // Leaflet
    'cdn.jsdelivr.net',     // Supabase SDK and dashboard icons
    'cdnjs.cloudflare.com', // jsPDF and friends
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Serve from cache immediately, refresh the cache in the background.
function staleWhileRevalidate(event, cacheName) {
    return caches.open(cacheName).then((cache) =>
        cache.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    // Only cache complete, successful responses.
                    if (response && (response.ok || response.type === 'opaque')) {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only handle GET; never interfere with API writes, Firestore, etc.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Navigations and same-origin shell assets.
    if (request.mode === 'navigate' || url.origin === self.location.origin) {
        event.respondWith(
            staleWhileRevalidate(event, SHELL_CACHE).then((resp) =>
                resp || staleWhileRevalidate(event, RUNTIME_CACHE)
            )
        );
        return;
    }

    // Allowlisted static CDN assets.
    if (STATIC_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
        return;
    }

    // Everything else: straight to the network (dynamic / privacy-sensitive).
});
