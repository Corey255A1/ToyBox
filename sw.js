// sw.js

const CACHE_VERSION = 'toybox-v1';

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
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION) // Delete old versions
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // Take control of open tabs immediately
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For localhost/development, prefer network first to make developer experience smooth
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocalhost) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Strategy 1: Cache-Only for precached app shell files
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request));
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
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Network-First with fallback ───────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}
