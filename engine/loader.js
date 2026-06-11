// engine/loader.js

import { initRuntime, startGameLoop, preloadGameAssets, stopGameLoop, buildEngineObject }
  from './engine.js';
import { sideloaded } from './storage.js';
import { configureInput } from './input.js';
import { preloadAudio } from './audio.js';
import { showController, hideController } from './controller.js';
import { getSetting } from './settings.js';

let currentGameId   = null;
let currentGameModule = null;

/**
 * Load and boot a game from a manifest entry.
 *
 * @param {Object}   gameEntry          - Entry from games/manifest.json
 * @param {Object}   [options]
 * @param {Function} [options.onReady]  - Callback fired after game.init() completes
 * @param {Function} [options.onExit]   - Callback fired when game exits
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

    // 9. Show/hide controller based on game config AND user setting
    const wantsController = config.controller?.enabled === true;
    const settingAllows   = getSetting('controllerEnabled') !== false; // default to true if undefined

    if (wantsController && settingAllows) {
      showController(config.controller);
    } else {
      hideController();
    }

    // 10. Build the initial engine object and call init()
    const engine = buildEngineObject();
    await gameModule.init(engine);

    // 11. Notify host that game is ready (host will show canvas)
    options.onReady?.();

    // 12. Start the frame loop
    startGameLoop(gameModule, gameEntry.id, () => {
      hideController();
      if (options.onExit) options.onExit();
    });

  } catch (err) {
    console.error(`[ToyBox] Failed to load game "${gameEntry.id}":`, err);
    throw err;
  }
}

/**
 * Stop the current game and clean up all state.
 */
export function exitGame() {
  if (currentGameModule && typeof currentGameModule.onDestroy === 'function') {
    try {
      currentGameModule.onDestroy();
    } catch (err) {
      console.warn('[ToyBox] Game onDestroy crashed:', err);
    }
  }
  hideController();
  stopGameLoop();
  currentGameId     = null;
  currentGameModule = null;
}

/**
 * Get the JS source string for a game, from SW cache, IndexedDB, or network.
 *
 * @param {Object} gameEntry - Game manifest entry
 * @returns {Promise<string>} Raw JavaScript module source
 */
export async function resolveGameSource(gameEntry) {
  // ── Source 1: Bundled (Service Worker cache) ─────────────────────────────
  if (gameEntry.scriptPath) {
    try {
      const response = await fetch(`/${gameEntry.scriptPath}`);
      if (response.ok) {
        return await response.text();
      }
    } catch (e) {
      // Fall through to next source
    }
  }

  // ── Source 2: Sideloaded (IndexedDB) ─────────────────────────────────────
  const sideloadedGame = await sideloaded.get(gameEntry.id);
  if (sideloadedGame?.scriptSource) {
    return sideloadedGame.scriptSource;
  }

  // ── Source 3: Remote fetch (dev/test mode only) ───────────────────────────
  if (gameEntry.remoteUrl) {
    console.warn(`[ToyBox] Fetching remote game (no offline support): ${gameEntry.remoteUrl}`);
    const response = await fetch(gameEntry.remoteUrl);
    if (!response.ok) throw new Error(`Remote fetch failed: ${response.status}`);
    return await response.text();
  }

  throw new Error(`[ToyBox] No source found for game: ${gameEntry.id}`);
}

/**
 * Convert a raw JavaScript string into a live ES Module by using a Blob URL.
 *
 * @param {string} source - Raw ES Module JavaScript text
 * @returns {Promise<Object>} The evaluated module's default export
 */
export async function evaluateModule(source) {
  const blob    = new Blob([source], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const module = await import(blobUrl);
    
    // Return the default export or the module directly if not wrapped
    if (module.default) {
      return module.default;
    }
    return module;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Validate that a game module implements the required ToyBox contract.
 */
function validateGameModule(mod, gameId) {
  const errors = [];

  const bindMod = mod.default || mod;

  if (typeof bindMod !== 'object' || bindMod === null) {
    throw new Error(`Game "${gameId}" default export must be an object.`);
  }

  if (typeof bindMod.init !== 'function') {
    errors.push('Missing required method: init(engine)');
  }

  if (typeof bindMod.update !== 'function') {
    errors.push('Missing required method: update(engine, deltaTime)');
  }

  if (bindMod.onEvent !== undefined && typeof bindMod.onEvent !== 'function') {
    errors.push('onEvent must be a function if present');
  }

  if (bindMod.config !== undefined && typeof bindMod.config !== 'object') {
    errors.push('config must be a plain object if present');
  }

  if (errors.length > 0) {
    throw new Error(
      `Game "${gameId}" contract validation failed:\n  • ${errors.join('\n  • ')}`
    );
  }

  console.log(`[ToyBox] Game "${gameId}" validated ✓`);
}

function applyGameConfig(config, app) {
  if (config.background && app) {
    const colorInt = parseInt(config.background.replace('#', ''), 16);
    app.renderer.background.color = colorInt;
  }
}

/**
 * Sideload a new game from a JS source string.
 * Validates the module before storing it.
 */
export async function sideloadGame(manifest, scriptSource) {
  const mod = await evaluateModule(scriptSource);
  validateGameModule(mod, manifest.id);

  await sideloaded.install(manifest, scriptSource);

  console.log(`[ToyBox] Sideloaded game "${manifest.id}" installed ✓`);
  return manifest;
}

/**
 * Get the combined game catalogue: bundled + sideloaded.
 */
export async function getAllGames() {
  let bundled = [];
  try {
    const res = await fetch('/games/manifest.json');
    if (res.ok) {
      bundled = await res.json();
    }
  } catch (err) {
    console.warn('[ToyBox/Loader] Failed to fetch games/manifest.json. Using sideloaded catalog only.', err);
  }

  const extra = await sideloaded.getAll();

  return [
    ...bundled,
    ...extra.map(g => ({ ...g, sideloaded: true })),
  ];
}
