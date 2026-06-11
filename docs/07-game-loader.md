# 07 — Game Loader

The Game Loader (`engine/loader.js`) is responsible for fetching, evaluating, and booting game modules. It supports three game sources:

1. **Bundled games** — static JS files served by the Service Worker
2. **Sideloaded games** — JS strings stored in IndexedDB
3. **Remote games** — fetched from a URL (developer/test mode only)

---

## Architecture Overview

```
loadGame(gameManifestEntry)
│
├── 1. Determine game source
│   ├── Check SW cache for scriptPath → bundled game
│   ├── Check IndexedDB sideloaded store → sideloaded game
│   └── Fall through to fetch (remote/dev mode)
│
├── 2. Get JS source string
│
├── 3. Evaluate module via Blob URL
│   └── const blob = new Blob([source], { type: 'application/javascript' })
│       const url = URL.createObjectURL(blob)
│       const module = await import(url)
│       URL.revokeObjectURL(url)
│
├── 4. Validate module contract
│   └── Check that init, update, onEvent exist
│
├── 5. Preload declared assets
│   └── engine.preloadGameAssets(module.default.config.assets)
│
├── 6. Initialize PixiJS runtime
│   └── initRuntime(canvas)
│
├── 7. Apply game config
│   └── Set background color, interactionMode
│
├── 8. Call game.init(engine)
│
└── 9. Start Ticker loop
    └── startGameLoop(module.default)
```

---

## Step 1 — The `loadGame` Function

```javascript
// engine/loader.js

import { initRuntime, startGameLoop, preloadGameAssets, stopGameLoop }
  from './engine.js';
import { sideloaded } from './storage.js';
import { configureInput } from './input.js';
import { preloadAudio } from './audio.js';

let currentGameId   = null;
let currentGameModule = null;

/**
 * Load and boot a game from a manifest entry.
 *
 * @param {Object}   gameEntry          - Entry from games/manifest.json
 * @param {Object}   [options]
 * @param {Function} [options.onReady]  - Callback fired after game.init() completes
 */
export async function loadGame(gameEntry, options = {}) {
  try {
    // 1. Fetch the game source
    const source = await resolveGameSource(gameEntry);

    // 2. Evaluate the module
    const gameModule = await evaluateModule(source);

    // 3. Validate the contract
    validateGameModule(gameModule, gameEntry.id);

    // 4. Cache references
    currentGameId     = gameEntry.id;
    currentGameModule = gameModule;

    const config = gameModule.config ?? {};

    // 5. Preload declared assets
    await preloadGameAssets(config.assets ?? []);
    await preloadAudio(config.audio ?? []);

    // 6. Initialize (or reuse) the PixiJS runtime
    const canvas = document.getElementById('game-canvas');
    const app    = await initRuntime(canvas);

    // 7. Apply game config to the runtime
    applyGameConfig(config, app);

    // 8. Configure input mode
    configureInput(config.interactionMode ?? 'tap');

    // 9. Build the initial engine object and call init()
    const engine = buildInitialEngineObject(app);
    await gameModule.init(engine);

    // 10. Notify host that game is ready (host will show canvas)
    options.onReady?.();

    // 11. Start the frame loop
    startGameLoop(gameModule);

  } catch (err) {
    console.error(`[ToyBox] Failed to load game "${gameEntry.id}":`, err);
    throw err; // Re-throw so the host can handle it
  }
}

/**
 * Stop the current game and clean up all state.
 */
export function exitGame() {
  if (currentGameModule?.onDestroy) {
    currentGameModule.onDestroy();
  }
  stopGameLoop();
  currentGameId     = null;
  currentGameModule = null;
}
```

---

## Step 2 — Resolving the Game Source

```javascript
// engine/loader.js

/**
 * Get the JS source string for a game, from SW cache, IndexedDB, or network.
 *
 * @param {Object} gameEntry - Game manifest entry
 * @returns {Promise<string>} Raw JavaScript module source
 */
async function resolveGameSource(gameEntry) {
  // ── Source 1: Bundled (Service Worker cache) ─────────────────────────────
  // Try fetching the scriptPath — SW will intercept with Cache-Only
  try {
    const response = await fetch(`/${gameEntry.scriptPath}`);
    if (response.ok) {
      return response.text();
    }
  } catch {
    // Network or cache miss — fall through to next source
  }

  // ── Source 2: Sideloaded (IndexedDB) ─────────────────────────────────────
  const sideloadedGame = await sideloaded.get(gameEntry.id);
  if (sideloadedGame?.scriptSource) {
    console.log(`[ToyBox] Loading sideloaded game: ${gameEntry.id}`);
    return sideloadedGame.scriptSource;
  }

  // ── Source 3: Remote fetch (dev/test mode only) ───────────────────────────
  if (gameEntry.remoteUrl) {
    console.warn(`[ToyBox] Fetching remote game (no offline support): ${gameEntry.remoteUrl}`);
    const response = await fetch(gameEntry.remoteUrl);
    if (!response.ok) throw new Error(`Remote fetch failed: ${response.status}`);
    return response.text();
  }

  throw new Error(`[ToyBox] No source found for game: ${gameEntry.id}`);
}
```

---

## Step 3 — Blob URL Dynamic Module Evaluation

This is the core mechanism for converting a JS source string into a live ES Module. The trick is to wrap the string in a Blob with the correct MIME type, generate an object URL, `import()` it, then revoke the URL to free memory.

```javascript
// engine/loader.js

/**
 * Convert a raw JavaScript string into a live ES Module by using a Blob URL.
 *
 * Why Blob URL instead of eval()?
 *   - eval() can't import other modules
 *   - Blob URLs create a proper module scope with import support
 *   - Source maps can reference Blob URLs in DevTools
 *   - No CSP issues (no 'unsafe-eval' required if CSP allows blob:)
 *
 * @param {string} source - Raw ES Module JavaScript text
 * @returns {Promise<Object>} The evaluated module's default export
 */
async function evaluateModule(source) {
  // Wrap in a Blob with the correct MIME type for ES Modules
  const blob    = new Blob([source], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    // Dynamic import evaluates the module
    const module = await import(blobUrl);

    // Return the default export (the game object literal)
    if (!module.default) {
      throw new Error('Game module must have a default export.');
    }
    return module.default;
  } finally {
    // Always revoke the Blob URL to free memory
    URL.revokeObjectURL(blobUrl);
  }
}
```

### Security Note — Content Security Policy

If your deployment enforces a strict CSP, you must allow `blob:` as a script source:

```http
Content-Security-Policy: script-src 'self' blob:;
```

Without this, `import(blobUrl)` will be blocked by the browser.

---

## Step 4 — Module Contract Validation

Before initializing a game, validate that it implements the required interface. This catches bugs in AI-generated or community game scripts early.

```javascript
// engine/loader.js

/**
 * Validate that a game module implements the required ToyBox contract.
 * Throws if any required fields are missing.
 */
function validateGameModule(mod, gameId) {
  const errors = [];

  if (typeof mod !== 'object' || mod === null) {
    throw new Error(`Game "${gameId}" default export must be an object.`);
  }

  if (typeof mod.init !== 'function') {
    errors.push('Missing required method: init(engine)');
  }

  if (typeof mod.update !== 'function') {
    errors.push('Missing required method: update(engine, deltaTime)');
  }

  // onEvent is optional but must be a function if present
  if (mod.onEvent !== undefined && typeof mod.onEvent !== 'function') {
    errors.push('onEvent must be a function if present');
  }

  // config is optional but must be an object if present
  if (mod.config !== undefined && typeof mod.config !== 'object') {
    errors.push('config must be a plain object if present');
  }

  if (errors.length > 0) {
    throw new Error(
      `Game "${gameId}" contract validation failed:\n  • ${errors.join('\n  • ')}`
    );
  }

  console.log(`[ToyBox] Game "${gameId}" validated ✓`);
}
```

---

## Step 5 — Applying Game Config

After evaluation and validation, apply the game's config to the PixiJS runtime:

```javascript
// engine/loader.js

function applyGameConfig(config, app) {
  // Set canvas background color
  if (config.background) {
    const colorInt = parseInt(config.background.replace('#', ''), 16);
    app.renderer.background.color = colorInt;
  }
}
```

---

## Step 6 — Sideload Installation API

To allow developers or future admin interfaces to install new games at runtime:

```javascript
// engine/loader.js

/**
 * Sideload a new game from a JS source string.
 * Validates the module before storing it.
 *
 * @param {Object} manifest     - Game metadata (id, title, description, etc.)
 * @param {string} scriptSource - Raw JS module source
 */
export async function sideloadGame(manifest, scriptSource) {
  // Validate before storing
  const mod = await evaluateModule(scriptSource);
  validateGameModule(mod, manifest.id);

  // Store in IndexedDB
  await sideloaded.install(manifest, scriptSource);

  console.log(`[ToyBox] Sideloaded game "${manifest.id}" installed ✓`);
  return manifest;
}

/**
 * Get the combined game catalogue: bundled + sideloaded.
 * Used by the launcher to render all available games.
 */
export async function getAllGames() {
  // Fetch bundled manifest
  const res     = await fetch('/games/manifest.json');
  const bundled = await res.json();

  // Fetch sideloaded games from IndexedDB
  const extra = await sideloaded.getAll();

  // Merge, with sideloaded marked differently for UI
  return [
    ...bundled,
    ...extra.map(g => ({ ...g, sideloaded: true })),
  ];
}
```

---

## Blob URL vs. Other Evaluation Strategies

| Strategy | Pros | Cons |
|----------|------|------|
| **Blob URL + `import()`** | Proper ES module scope, supports `import`, source maps | Requires `blob:` in CSP |
| `eval()` | Simple | No module scope, `import` won't work, CSP `unsafe-eval` |
| `new Function()` | Slightly safer than `eval` | No module scope, CSP `unsafe-eval` |
| `<script type="module">` injection | Works without CSP change | Async, harder to clean up |
| **Workers + `importScripts`** | Fully sandboxed | No DOM/PixiJS access possible |

**ToyBox uses Blob URL + `import()`** because:
- Games need to reference PIXI globals
- The `import()` scope is clean and isolated
- It's the only approach that allows games to use `import` statements internally if needed

---

## Checklist

- [ ] `loadGame()` tries SW cache → IndexedDB → remote in order
- [ ] `evaluateModule()` uses Blob URL + `import()` (not `eval`)
- [ ] Blob URL is revoked with `URL.revokeObjectURL()` after import
- [ ] `validateGameModule()` checks for `init` and `update` functions
- [ ] `applyGameConfig()` sets canvas background color
- [ ] `exitGame()` calls `game.onDestroy()` if defined before stopping loop
- [ ] `sideloadGame()` validates before storing in IndexedDB
- [ ] `getAllGames()` merges bundled + sideloaded entries for the launcher
- [ ] CSP header includes `script-src 'self' blob:` if CSP is enforced

---

**Previous:** [06 — Service Worker & Storage](./06-service-worker-caching.md) | **Next:** [08 — Input & Touch System →](./08-input-touch-system.md)
