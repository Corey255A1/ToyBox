// sw.js

const CACHE_NAME = 'toybox-v3.3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/lib/pixi.min.js',
  '/engine/engine.js',
  '/engine/loader.js',
  '/engine/audio.js',
  '/engine/input.js',
  '/engine/storage.js',
  '/engine/settings.js',
  '/engine/controller.js',
  '/engine/previewer.js',
  '/games/manifest.json',
  '/games/memory_match.js',
  '/games/bubble_pop.js',
  '/games/digital_coloring.js',
  '/games/peek_a_boo.js',
  '/games/scratcher.js',
  '/games/ball_launch.js',
  '/games/sound_board.js',
  '/games/shape_sorter.js',
  '/games/flashlight.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Fetch each URL with cache: 'reload' to bypass the browser HTTP cache
        const promises = PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          }
        });
        await Promise.all(promises);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // Take control of open tabs immediately
  );
});

// ── Local Network Detection ──────────────────────────────────────────────────
function isLocal(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  );
}

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For local development/debugging (localhost or local network IP),
  // prefer network first to make developer experience smooth.
  if (isLocal(url.hostname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Strategy 1: Stale-While-Revalidate for precached app shell files and games.
  // This allows updates to be downloaded in the background while keeping startup instant and offline-capable.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Strategy 2: Cache-First for static assets (sprites, audio)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Strategy 3: Network-First with cache fallback for everything else
  event.respondWith(networkFirst(event.request));
});

// ── Cache-First ───────────────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  // Not cached — fetch and store
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Network-First with fallback ───────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const url = new URL(request.url);
    const options = {};
    console.log(`[SW] Fetching ${url.pathname} from network...`);
    
    // For local network / development, bypass browser HTTP cache on GET requests
    if (isLocal(url.hostname) && request.method === 'GET') {
      options.cache = 'reload';
    }

    const response = await fetch(request, options);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

// ── Stale-While-Revalidate ───────────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Force cache: 'reload' to ensure background updates bypass the browser HTTP cache
  const fetchPromise = fetch(request, { cache: 'reload' }).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  return cachedResponse || fetchPromise;
}
