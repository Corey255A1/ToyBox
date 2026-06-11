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
      if (!database.objectStoreNames.contains('game_saves')) {
        database.createObjectStore('game_saves', { keyPath: 'gameId' });
      }

      // Store: High scores per game
      if (!database.objectStoreNames.contains('high_scores')) {
        const store = database.createObjectStore('high_scores', { keyPath: 'gameId' });
        store.createIndex('score', 'score', { unique: false });
      }

      // Store: Sideloaded game scripts
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

// Named exports namespace matching the specification helper namespaces
export const settings = {
  async get(key, defaultValue = null) {
    const val = await get('settings', key);
    return val ?? defaultValue;
  },
  async set(key, value) {
    return set('settings', value, key);
  },
};

export const gameSaves = {
  async save(gameId, data) {
    return set('game_saves', { gameId, data, savedAt: Date.now() });
  },
  async load(gameId) {
    const record = await get('game_saves', gameId);
    return record?.data ?? null;
  },
  async clear(gameId) {
    return del('game_saves', gameId);
  },
};

export const highScores = {
  async save(gameId, score, playerName = 'Player') {
    const existing = await get('high_scores', gameId);
    if (!existing || score > existing.score) {
      return set('high_scores', { gameId, score, playerName, date: Date.now() });
    }
  },
  async get(gameId) {
    return get('high_scores', gameId);
  },
};

export const sideloaded = {
  async install(manifest, scriptSource) {
    return set('sideloaded', {
      ...manifest,
      scriptSource,
      installedAt: Date.now(),
    });
  },
  async getAll() {
    return getAll('sideloaded');
  },
  async get(gameId) {
    return get('sideloaded', gameId);
  },
  async uninstall(gameId) {
    return del('sideloaded', gameId);
  },
};
