/*
 * MyKK Dashboard — Service Worker
 *
 * Provides offline support and instant loads for the single-file dashboard.
 *
 * Strategy:
 *   - App shell (same-origin: index.html, manifest, icons) is precached on
 *     install. Pages and same-origin scripts/styles use network-first so
 *     a normal refresh receives current UI, with cached fallback offline.
 *   - A short allowlist of static CDN hosts (fonts, Leaflet, Firebase SDK,
 *     jsPDF) is runtime-cached the same way so the app boots offline.
 *   - Everything else (weather API, map tiles, Supabase sync, favicons for
 *     bookmarks, etc.) is passed straight through to the network so dynamic
 *     data is never served stale.
 *
 * Bump CACHE_VERSION whenever the precached shell changes so old caches are
 * purged on activate.
 */

const CACHE_VERSION = 'personal-space-v8-suika-fullscreen';
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
    './games/',
    './games/index.html',
    './games/shared.css',
    './games/theme.js',
    './games/suika/',
    './games/suika/index.html',
    './games/suika/style.css',
    './games/suika/config.js',
    './games/suika/vendor/matter-0.20.0.min.js',
    './games/suika/vendor/supabase-2.49.4.js',
    './games/suika/src/main.js',
    './games/suika/src/game.js',
    './games/suika/src/scores.js',
    './games/suika/src/fullscreen.js',
    './games/suika/src/config/fruits.js',
    './games/suika/src/entities/Fruit.js',
    './games/suika/src/entities/FruitFactory.js',
    './games/suika/src/effects/Particles.js',
    ...['01-cherry', '02-strawberry', '03-grape', '04-dekopon', '05-lemon',
        '06-apple', '07-pear', '08-peach', '09-pineapple', '10-melon', '11-watermelon']
        .map(name => './games/suika/assets/images/' + name + '.png'),
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
            .then((cache) => cache.addAll(SHELL_ASSETS.map(path =>
                new Request(new URL(path, self.location.href), { cache: 'reload' })
            )))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => (key.startsWith('mykk-shell-') || key.startsWith('mykk-runtime-')) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
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

// Refresh UI immediately when online, retain the offline copy on network failure.
async function networkFirst(event) {
    const cache = await caches.open(SHELL_CACHE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch(event.request, { cache: 'no-cache', signal: controller.signal });
        if (response.ok) event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
        return response;
    } catch {
        return (await cache.match(event.request)) || Response.error();
    } finally {
        clearTimeout(timeout);
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only handle GET; never interfere with API writes, Firestore, etc.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (url.origin === self.location.origin &&
        (request.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname))) {
        event.respondWith(networkFirst(event));
        return;
    }

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
