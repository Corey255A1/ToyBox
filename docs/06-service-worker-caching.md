# 06 — Service Worker & Storage

ToyBox is an **offline-first** application. This document covers:
1. The Service Worker caching strategy
2. The IndexedDB schema and wrapper API
3. How games are stored and retrieved for offline play

---

## Overview

```
Storage Architecture
│
├── Service Worker (sw.js)
│   ├── Precache (on install)
│   │   ├── /index.html
│   │   ├── /styles.css
│   │   ├── /app.js
│   │   ├── /lib/pixi.min.js
│   │   ├── /engine/*.js
│   │   ├── /games/manifest.json
│   │   └── /games/*.js  (bundled games)
│   │
│   └── Runtime Cache (on fetch)
│       ├── /assets/sprites/*.png  → Cache-First
│       ├── /assets/audio/*        → Cache-First
│       └── Everything else        → Network-First with cache fallback
│
└── IndexedDB  (engine/storage.js)
    ├── Store: 'settings'       → user preferences, volume, etc.
    ├── Store: 'game_saves'     → per-game save data keyed by game ID
    ├── Store: 'high_scores'    → top scores per game
    └── Store: 'sideloaded'     → user-added game JS strings + metadata
```

---

## Part 1 — Service Worker (`sw.js`)

### Install Strategy — Precache

On `install`, the Service Worker downloads and caches all critical app files. The app will refuse to activate until all precache items are fetched successfully.

```javascript
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
  '/games/manifest.json',
  '/games/memory_match.js',
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
```

### Activate Strategy — Cache Cleanup

On `activate`, old cache versions are deleted so stale files don't serve after an update:

```javascript
// sw.js

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION) // Delete old versions
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // Take control of all open tabs immediately
  );
});
```

### Fetch Strategy — Tiered Response

Different resources use different caching strategies:

```javascript
// sw.js

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

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
```

### Cache Versioning & Update Flow

When a new version of ToyBox is deployed:
1. Change `CACHE_VERSION` to `'toybox-v2'`
2. Browser downloads the new `sw.js`
3. New SW installs → precaches all updated files under `toybox-v2`
4. Old SW deactivates → old `toybox-v1` cache deleted
5. Users automatically get the new version on next visit

> **To force an update in development:** Open Chrome DevTools → Application → Service Workers → click "Update" or check "Update on reload".

---

## Part 2 — IndexedDB Schema (`engine/storage.js`)

IndexedDB is used for all **dynamic, persistent data** that cannot be hardcoded into the SW precache.

### Database Setup

```javascript
// engine/storage.js

const DB_NAME    = 'toybox-db';
const DB_VERSION = 1;

let db = null;

export async function openDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Called only when the database is first created (or version changes)
    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Store: User settings (volume, parental controls, etc.)
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings');
      }

      // Store: Per-game save data
      // Key path: 'gameId' — e.g. { gameId: 'memory-match', data: {...} }
      if (!database.objectStoreNames.contains('game_saves')) {
        database.createObjectStore('game_saves', { keyPath: 'gameId' });
      }

      // Store: High scores per game
      if (!database.objectStoreNames.contains('high_scores')) {
        const store = database.createObjectStore('high_scores', { keyPath: 'gameId' });
        store.createIndex('score', 'score', { unique: false });
      }

      // Store: Sideloaded game scripts
      // Key path: 'id' — the game's unique slug
      if (!database.objectStoreNames.contains('sideloaded')) {
        database.createObjectStore('sideloaded', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
```

### Generic CRUD Wrapper

A Promise-based wrapper makes all IndexedDB operations clean and async:

```javascript
// engine/storage.js

/**
 * Write a value to an object store.
 * @param {string} storeName - The object store name
 * @param {*}      value     - Value to store (must include keyPath field if applicable)
 * @param {*}      [key]     - Key for stores without keyPath (e.g., 'settings')
 */
export async function set(storeName, value, key = undefined) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx      = database.transaction(storeName, 'readwrite');
    const store   = tx.objectStore(storeName);
    const request = key !== undefined ? store.put(value, key) : store.put(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

/**
 * Read a value from an object store by key.
 */
export async function get(storeName, key) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = store.get(key);

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Delete a record from an object store.
 */
export async function del(storeName, key) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.delete(key);

    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Get all records from a store.
 */
export async function getAll(storeName) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
```

---

## Part 3 — Settings Store

```javascript
// engine/storage.js — Settings helpers

export const settings = {
  async get(key, defaultValue = null) {
    const val = await storage.get('settings', key);
    return val ?? defaultValue;
  },
  async set(key, value) {
    return storage.set('settings', value, key);
  },
};

// Usage
await settings.set('volume', 0.7);
const vol = await settings.get('volume', 1.0); // Returns 1.0 if not set
```

---

## Part 4 — Game Save & High Score Store

```javascript
// engine/storage.js — Game data helpers

export const gameSaves = {
  async save(gameId, data) {
    return storage.set('game_saves', { gameId, data, savedAt: Date.now() });
  },
  async load(gameId) {
    const record = await storage.get('game_saves', gameId);
    return record?.data ?? null;
  },
  async clear(gameId) {
    return storage.del('game_saves', gameId);
  },
};

export const highScores = {
  async save(gameId, score, playerName = 'Player') {
    const existing = await storage.get('high_scores', gameId);
    if (!existing || score > existing.score) {
      return storage.set('high_scores', { gameId, score, playerName, date: Date.now() });
    }
  },
  async get(gameId) {
    return storage.get('high_scores', gameId);
  },
};
```

---

## Part 5 — Sideloaded Game Store

Sideloading allows users (or developers) to install new games without rebuilding the app. A sideloaded game is stored as a raw JavaScript string in IndexedDB.

```javascript
// engine/storage.js — Sideloaded game helpers

export const sideloaded = {
  /**
   * Store a game's JS source string in IndexedDB.
   * @param {Object} manifest - Game metadata (id, title, description, etc.)
   * @param {string} scriptSource - The raw JS module source string
   */
  async install(manifest, scriptSource) {
    return storage.set('sideloaded', {
      ...manifest,
      scriptSource,
      installedAt: Date.now(),
    });
  },

  async getAll() {
    return storage.getAll('sideloaded');
  },

  async get(gameId) {
    return storage.get('sideloaded', gameId);
  },

  async uninstall(gameId) {
    return storage.del('sideloaded', gameId);
  },
};
```

The Game Loader uses this store when a game's `scriptPath` is not found in the SW cache. See [07 — Game Loader](./07-game-loader.md) for how scripts are evaluated.

---

## Checklist

- [ ] `sw.js` precaches all critical app files on `install`
- [ ] Activate handler deletes old cache versions
- [ ] Fetch handler uses Cache-Only for app shell, Cache-First for assets
- [ ] SW `CACHE_VERSION` is incremented when app files change
- [ ] `engine/storage.js` opens IndexedDB with `onupgradeneeded` creating all 4 stores
- [ ] `set()`, `get()`, `del()`, `getAll()` return Promises (never callbacks)
- [ ] `settings`, `gameSaves`, `highScores`, `sideloaded` helper namespaces implemented
- [ ] Tested offline: disable network in DevTools and reload — app must still work

---

**Previous:** [05 — Engine Abstractions](./05-engine-abstractions.md) | **Next:** [07 — Game Loader →](./07-game-loader.md)
