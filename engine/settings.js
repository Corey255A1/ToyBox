// engine/settings.js

import { set, get } from './storage.js';

export const SETTINGS_SCHEMA = {
  // ── Audio ──────────────────────────────────────────────────────────────────
  volume: {
    type:    'range',
    default: 1.0,
    min:     0,
    max:     1,
    step:    0.05,
    label:   '🔊 Volume',
    group:   'audio',
  },
  musicEnabled: {
    type:    'toggle',
    default: true,
    label:   '🎵 Music',
    group:   'audio',
  },
  sfxEnabled: {
    type:    'toggle',
    default: true,
    label:   '🔔 Sound FX',
    group:   'audio',
  },

  // ── Input ──────────────────────────────────────────────────────────────────
  controllerEnabled: {
    type:    'toggle',
    default: true,
    label:   '🎮 On-Screen Controller',
    group:   'input',
    description: 'Show D-pad & buttons for games that support it',
  },
  vibrationEnabled: {
    type:    'toggle',
    default: false,
    label:   '📳 Vibration',
    group:   'input',
    description: 'Haptic feedback on button presses',
  },

  // ── Content ───────────────────────────────────────────────────────────────
  ageFilter: {
    type:    'select',
    default: 'all',
    options: [
      { value: 'all',  label: 'All ages' },
      { value: '2-4',  label: '2–4 years' },
      { value: '4-6',  label: '4–6 years' },
      { value: '6-8',  label: '6–8 years' },
    ],
    label:   '👶 Age Filter',
    group:   'content',
  },
  language: {
    type:    'select',
    default: 'en',
    options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
    ],
    label:   '🌐 Language',
    group:   'content',
  },

  // ── Parental ──────────────────────────────────────────────────────────────
  parentalPin: {
    type:    'pin',
    default: null,  // null = no PIN set
    label:   '🔒 Parental Lock',
    group:   'parental',
    description: 'Require PIN to access settings',
    sensitive: true, // Never log or display this value
  },
  screenTimerMinutes: {
    type:    'range',
    default: 0,       // 0 = off
    min:     0,
    max:     60,
    step:    5,
    label:   '⏱ Screen Timer',
    group:   'parental',
    description: 'Automatically lock after N minutes (0 = off)',
  },
};

// In-memory cache of current settings
const cache = {};
const listeners = new Map(); // key → Set of callbacks

/**
 * Load all settings from IndexedDB into the in-memory cache.
 * Called once at app startup.
 */
export async function initSettings() {
  for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
    const stored = await get('settings', key);
    cache[key] = stored ?? schema.default;
  }
}

/**
 * Get the current value of a setting.
 * @param {string} key
 * @returns {*} Current value (or schema default if not yet set)
 */
export function getSetting(key) {
  if (!(key in cache)) {
    return SETTINGS_SCHEMA[key]?.default ?? null;
  }
  return cache[key];
}

/**
 * Get all settings as a flat key→value object.
 */
export function getAllSettings() {
  return { ...cache };
}

/**
 * Persist a setting change to IndexedDB and notify listeners.
 * @param {string} key
 * @param {*}      value
 */
export async function setSetting(key, value) {
  const schema = SETTINGS_SCHEMA[key];
  if (!schema) {
    console.warn(`[ToyBox/Settings] Unknown setting key: "${key}"`);
    return;
  }

  // Validate range types
  if (schema.type === 'range') {
    value = Math.max(schema.min, Math.min(schema.max, value));
  }

  cache[key] = value;
  await set('settings', value, key);

  // Notify all listeners for this key
  const callbacks = listeners.get(key) ?? new Set();
  for (const cb of callbacks) {
    cb(value);
  }

  // Notify wildcard listeners (for re-rendering the whole settings UI)
  const wildcard = listeners.get('*') ?? new Set();
  for (const cb of wildcard) {
    cb(key, value);
  }
}

/**
 * Subscribe to changes for a specific setting (or '*' for all changes).
 * @param {string}   key
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function onSettingChange(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);

  // Return unsubscribe function
  return () => listeners.get(key)?.delete(callback);
}

/**
 * Reset a single setting to its schema default.
 */
export async function resetSetting(key) {
  const schema = SETTINGS_SCHEMA[key];
  if (!schema) return;
  await setSetting(key, schema.default);
}

/**
 * Reset all settings to defaults.
 */
export async function resetAllSettings() {
  for (const key of Object.keys(SETTINGS_SCHEMA)) {
    await resetSetting(key);
  }
}

// Screen Timer management
let screenTimerInterval = null;
let screenTimerStart    = null;

export function startScreenTimer(onExpired, onWarning) {
  const minutes = getSetting('screenTimerMinutes');
  if (!minutes || minutes === 0) return; // Timer disabled

  screenTimerStart = Date.now();
  const durationMs = minutes * 60 * 1000;
  let warningFired = false;

  if (screenTimerInterval) clearInterval(screenTimerInterval);

  screenTimerInterval = setInterval(() => {
    const elapsed = Date.now() - screenTimerStart;

    // Warning at 80% of session
    if (elapsed >= durationMs * 0.8 && elapsed < durationMs && !warningFired) {
      warningFired = true;
      const remainingMins = Math.round((durationMs - elapsed) / 1000 / 60);
      if (onWarning) onWarning(remainingMins);
    }

    if (elapsed >= durationMs) {
      clearInterval(screenTimerInterval);
      screenTimerInterval = null;
      onExpired();
    }
  }, 5000); // Check every 5 seconds for responsive timer
}

export function stopScreenTimer() {
  if (screenTimerInterval) {
    clearInterval(screenTimerInterval);
    screenTimerInterval = null;
  }
}
