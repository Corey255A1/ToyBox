# 12 — Settings System

The Settings System provides a full-screen panel accessible from the main launcher header. It persists all preferences to IndexedDB via the storage layer and applies changes immediately without requiring a restart.

---

## Settings Panel Entry Point

The settings button lives in the launcher header bar, always visible from the main menu. Tapping it slides in the settings panel over the launcher.

```
[Launcher Header]
   🎮 ToyBox          ⚙️ Settings
                          │
                          ▼ (tap)
[Settings Panel — slides in from right]
   ← Back    ⚙️ Settings
   ─────────────────────────────
   🔊 Volume          [====●  ]
   🎵 Music           [  ON  ]
   🔔 Sound FX        [  ON  ]
   ─────────────────────────────
   🎮 Controller      [  ON  ]
   📳 Vibration       [ OFF  ]
   ─────────────────────────────
   👶 Age Filter      [  2–4 ▼]
   🌐 Language        [  EN  ▼]
   ─────────────────────────────
   🔒 Parental Lock   [Set PIN]
   ⏱  Screen Timer    [ OFF  ]
   ─────────────────────────────
   🗑️  Reset Scores   [RESET ]
   ℹ️  About          v1.0.0
```

---

## Architecture

```
Settings System
├── engine/settings.js            ← Settings manager module
│   ├── getAll()                  → Returns all current settings
│   ├── get(key)                  → Returns single setting value
│   ├── set(key, value)           → Persists to IndexedDB + fires change event
│   └── onChange(key, callback)   → Subscribe to setting changes
│
├── app.js                        ← Wires settings button + panel
│   ├── openSettingsPanel()
│   └── closeSettingsPanel()
│
└── styles.css                    ← Settings panel CSS
```

---

## Step 1 — Settings Definition & Defaults

All settings live in a single canonical schema. This is the source of truth for every setting's key, type, default value, and valid range.

```javascript
// engine/settings.js

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
```

---

## Step 2 — Settings Manager (`engine/settings.js`)

```javascript
// engine/settings.js

import { set, get } from './storage.js';

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
```

---

## Step 3 — Settings Panel HTML & CSS

### HTML Structure (injected by JS)

```javascript
// Injected into #app-shell when settings button is tapped
function buildSettingsPanel() {
  return `
    <div id="settings-panel" class="settings-panel" role="dialog"
         aria-label="Settings" aria-modal="true">

      <header class="settings-header">
        <button id="btn-settings-back" class="settings-back-btn"
                aria-label="Back to games">
          ← Back
        </button>
        <h1 class="settings-title">⚙️ Settings</h1>
      </header>

      <div class="settings-body">

        <!-- Audio Group -->
        <section class="settings-group" aria-labelledby="group-audio">
          <h2 class="settings-group-title" id="group-audio">Audio</h2>
          ${buildRangeRow('volume',       'Volume')}
          ${buildToggleRow('musicEnabled','Music')}
          ${buildToggleRow('sfxEnabled',  'Sound FX')}
        </section>

        <!-- Input Group -->
        <section class="settings-group" aria-labelledby="group-input">
          <h2 class="settings-group-title" id="group-input">Controls</h2>
          ${buildToggleRow('controllerEnabled', 'On-Screen Controller',
            'Show D-pad & buttons for compatible games')}
          ${buildToggleRow('vibrationEnabled',  'Vibration',
            'Haptic feedback on button presses')}
        </section>

        <!-- Content Group -->
        <section class="settings-group" aria-labelledby="group-content">
          <h2 class="settings-group-title" id="group-content">Content</h2>
          ${buildSelectRow('ageFilter', 'Age Filter')}
          ${buildSelectRow('language',  'Language')}
        </section>

        <!-- Parental Group -->
        <section class="settings-group" aria-labelledby="group-parental">
          <h2 class="settings-group-title" id="group-parental">Parental</h2>
          ${buildPinRow('parentalPin', 'Parental Lock PIN')}
          ${buildRangeRow('screenTimerMinutes', 'Screen Timer (mins)')}
        </section>

        <!-- Danger Zone -->
        <section class="settings-group settings-group--danger">
          <button id="btn-reset-scores" class="settings-danger-btn">
            🗑️ Reset All High Scores
          </button>
          <p class="settings-version">ToyBox v1.0.0</p>
        </section>

      </div>
    </div>
  `;
}
```

### CSS

```css
/* =============================================
   Settings Panel
   ============================================= */

.settings-panel {
  position: fixed;
  inset: 0;
  z-index: 7777;
  background: var(--color-bg-dark);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-panel.open {
  transform: translateX(0);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.settings-back-btn {
  background: rgba(255,255,255,0.08);
  border: none;
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: var(--font-size-md);
  font-weight: 700;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: background 0.15s ease;
}

.settings-back-btn:active { background: rgba(255,255,255,0.16); }

.settings-title {
  font-size: var(--font-size-lg);
  font-weight: 900;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* ── Group ───────────────────────────────────────────────────────────────── */
.settings-group {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.settings-group-title {
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* ── Setting Row ─────────────────────────────────────────────────────────── */
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm);
  border-bottom: 1px solid rgba(255,255,255,0.04);
  gap: var(--space-sm);
  min-height: 64px;
}

.settings-row:last-child { border-bottom: none; }

.settings-row__label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-row__label {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.settings-row__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

/* ── Toggle Switch ───────────────────────────────────────────────────────── */
.toggle-switch {
  position: relative;
  width: 56px;
  height: 30px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.15);
  border-radius: var(--radius-full);
  transition: background 0.25s ease;
  cursor: pointer;
}

.toggle-switch input:checked + .toggle-track {
  background: var(--color-accent-3);
}

.toggle-track::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  background: #fff;
  border-radius: 50%;
  top: 4px;
  left: 4px;
  transition: transform 0.25s ease;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.toggle-switch input:checked + .toggle-track::after {
  transform: translateX(26px);
}

/* ── Range Slider ────────────────────────────────────────────────────────── */
.settings-range {
  width: 160px;
  accent-color: var(--color-accent-1);
  cursor: pointer;
}

/* ── Select Dropdown ─────────────────────────────────────────────────────── */
.settings-select {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: var(--radius-btn);
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
}

/* ── Danger Zone ─────────────────────────────────────────────────────────── */
.settings-group--danger {
  border-color: rgba(233, 69, 96, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-sm);
  gap: var(--space-xs);
}

.settings-danger-btn {
  background: rgba(233,69,96,0.15);
  border: 1px solid rgba(233,69,96,0.4);
  color: var(--color-accent-1);
  font-family: var(--font-display);
  font-size: var(--font-size-md);
  font-weight: 700;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: background 0.15s ease;
}

.settings-danger-btn:active {
  background: rgba(233,69,96,0.3);
}

.settings-version {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

---

## Step 4 — Row Builder Helpers

```javascript
// In app.js or settings.js — UI component builders

function buildToggleRow(key, label, description = '') {
  const value = getSetting(key);
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="toggle">
      <div class="settings-row__label-group">
        <span class="settings-row__label">${label}</span>
        ${description ? `<span class="settings-row__desc">${description}</span>` : ''}
      </div>
      <label class="toggle-switch" aria-label="${label}">
        <input type="checkbox" id="setting-${key}" ${value ? 'checked' : ''}
               data-setting-key="${key}" />
        <span class="toggle-track"></span>
      </label>
    </div>
  `;
}

function buildRangeRow(key, label) {
  const schema = SETTINGS_SCHEMA[key];
  const value  = getSetting(key);
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="range">
      <span class="settings-row__label">${label}</span>
      <input type="range" class="settings-range" id="setting-${key}"
             min="${schema.min}" max="${schema.max}" step="${schema.step}"
             value="${value}" data-setting-key="${key}" />
    </div>
  `;
}

function buildSelectRow(key, label) {
  const schema  = SETTINGS_SCHEMA[key];
  const current = getSetting(key);
  const options = schema.options
    .map(o => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`)
    .join('');
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="select">
      <span class="settings-row__label">${label}</span>
      <select class="settings-select" id="setting-${key}"
              data-setting-key="${key}">${options}</select>
    </div>
  `;
}

function buildPinRow(key, label) {
  const hasPin = getSetting(key) !== null;
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="pin">
      <div class="settings-row__label-group">
        <span class="settings-row__label">${label}</span>
        <span class="settings-row__desc">${hasPin ? 'PIN is set' : 'No PIN — settings are unlocked'}</span>
      </div>
      <button class="settings-back-btn" id="setting-${key}-btn">
        ${hasPin ? 'Change' : 'Set PIN'}
      </button>
    </div>
  `;
}
```

---

## Step 5 — Wiring the Settings Panel in `app.js`

```javascript
// app.js — Settings panel lifecycle

import { initSettings, getSetting, setSetting, onSettingChange, SETTINGS_SCHEMA }
  from './engine/settings.js';
import { setVolume } from './engine/audio.js';

let settingsPanelEl = null;

// ── Open / Close ──────────────────────────────────────────────────────────────
function openSettingsPanel() {
  // Inject panel HTML
  settingsPanelEl = document.createElement('div');
  settingsPanelEl.innerHTML = buildSettingsPanel();
  document.body.appendChild(settingsPanelEl.firstElementChild);

  // Animate in (next frame so CSS transition fires)
  requestAnimationFrame(() => {
    document.getElementById('settings-panel').classList.add('open');
  });

  // Wire events
  wireSettingsEvents();
}

function closeSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  panel.classList.remove('open');
  panel.addEventListener('transitionend', () => panel.remove(), { once: true });
}

// ── Event Delegation ──────────────────────────────────────────────────────────
function wireSettingsEvents() {
  const panel = document.getElementById('settings-panel');

  // Back button
  document.getElementById('btn-settings-back').addEventListener('pointerdown', closeSettingsPanel);

  // Delegate all input changes to a single handler
  panel.addEventListener('change', async (e) => {
    const key  = e.target.dataset.settingKey;
    const type = e.target.dataset.settingType ?? e.target.closest('[data-setting-type]')?.dataset.settingType;

    if (!key) return;

    let value;
    if (e.target.type === 'checkbox') value = e.target.checked;
    else if (e.target.type === 'range') value = parseFloat(e.target.value);
    else value = e.target.value;

    await setSetting(key, value);
  });

  // Reset scores button
  document.getElementById('btn-reset-scores')?.addEventListener('pointerdown', async () => {
    if (confirm('Reset all high scores? This cannot be undone.')) {
      const { getAll, del } = await import('./engine/storage.js');
      const scores = await getAll('high_scores');
      for (const score of scores) {
        await del('high_scores', score.gameId);
      }
    }
  });
}

// ── React to Setting Changes (live effect) ────────────────────────────────────
onSettingChange('volume', (val) => setVolume(val));
onSettingChange('sfxEnabled', (val) => { /* mute/unmute SFX channel */ });
onSettingChange('musicEnabled', (val) => { /* mute/unmute music channel */ });
onSettingChange('ageFilter', (val) => refreshLauncherGrid());
```

---

## Step 6 — Parental PIN Flow

A PIN protects settings from child access. The PIN entry flow uses a simple 4-digit number pad:

```javascript
// Shown when settings button is tapped and a PIN is set
function showPinEntry(onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.innerHTML = `
    <div class="pin-dialog" role="dialog" aria-label="Enter PIN">
      <h2>🔒 Enter PIN</h2>
      <div class="pin-dots" id="pin-dots">
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
      </div>
      <div class="pin-numpad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => `
          <button class="pin-key" data-digit="${n}">${n}</button>
        `).join('')}
      </div>
      <button class="settings-back-btn" id="btn-pin-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  let entered = '';

  overlay.addEventListener('pointerdown', (e) => {
    const digit = e.target.closest('.pin-key')?.dataset.digit;
    if (digit === undefined) return;

    if (digit === '⌫') {
      entered = entered.slice(0, -1);
    } else if (entered.length < 4) {
      entered += digit;
    }

    // Update dots
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < entered.length);
    });

    // Check PIN when 4 digits entered
    if (entered.length === 4) {
      const storedPin = getSetting('parentalPin');
      if (entered === storedPin) {
        overlay.remove();
        onSuccess();
      } else {
        // Wrong PIN — shake and reset
        document.querySelector('.pin-dots').classList.add('shake');
        setTimeout(() => {
          entered = '';
          document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
          document.querySelector('.pin-dots').classList.remove('shake');
        }, 600);
      }
    }
  });

  document.getElementById('btn-pin-cancel').addEventListener('pointerdown', () => {
    overlay.remove();
  });
}
```

---

## Step 7 — Settings Applied Throughout the System

| Setting | Where Applied |
|---------|--------------|
| `volume` | `audio.setVolume()` called on change |
| `sfxEnabled` | Audio system skips `play()` when false |
| `musicEnabled` | Background music `play()` skipped when false |
| `controllerEnabled` | Controller overlay shows/hides in game view |
| `vibrationEnabled` | `navigator.vibrate()` called on controller press |
| `ageFilter` | Launcher grid filters `games.manifest.json` by `ageRange` |
| `language` | Game titles/descriptions shown in selected language |
| `parentalPin` | Checked before opening settings panel |
| `screenTimerMinutes` | Timer starts when game launches; emits warning at 80% |

---

## Step 8 — Screen Timer Implementation

```javascript
// engine/settings.js — screen timer

let screenTimerInterval = null;
let screenTimerStart    = null;

export function startScreenTimer(onExpired) {
  const minutes = getSetting('screenTimerMinutes');
  if (!minutes || minutes === 0) return; // Timer disabled

  screenTimerStart = Date.now();
  const durationMs = minutes * 60 * 1000;

  screenTimerInterval = setInterval(() => {
    const elapsed = Date.now() - screenTimerStart;

    // Warning at 80% of session
    if (elapsed >= durationMs * 0.8 && elapsed < durationMs) {
      showTimerWarning(Math.round((durationMs - elapsed) / 1000 / 60));
    }

    if (elapsed >= durationMs) {
      clearInterval(screenTimerInterval);
      onExpired();
    }
  }, 10_000); // Check every 10 seconds
}

export function stopScreenTimer() {
  if (screenTimerInterval) {
    clearInterval(screenTimerInterval);
    screenTimerInterval = null;
  }
}
```

---

## Checklist

- [ ] `engine/settings.js` created with `SETTINGS_SCHEMA`, `getSetting`, `setSetting`, `onSettingChange`
- [ ] `initSettings()` called during `app.js` bootstrap before rendering launcher
- [ ] Settings panel opens via `⚙️` button in launcher header
- [ ] Panel slides in from right with CSS transition
- [ ] Toggle switches persist immediately to IndexedDB
- [ ] Range sliders persist on `change` (not `input`) to avoid excessive writes
- [ ] Volume slider calls `audio.setVolume()` in real-time on `input` event
- [ ] Back button closes panel with reverse transition
- [ ] Parental PIN flow shown before opening settings when PIN is set
- [ ] Age filter updates the launcher game grid immediately on change
- [ ] Screen timer starts on game launch and ends with a lockout overlay
- [ ] Reset Scores button shows confirmation dialog before clearing

---

**Previous:** [11 — Roadmap](./11-roadmap.md) | **Next:** [13 — Game Preview System →](./13-game-preview-system.md)
