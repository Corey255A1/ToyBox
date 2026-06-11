# Debugging & Scaling Analysis History

This document catalogs the detailed debugging, architectural analysis, and technical fixes implemented to resolve display, scaling, and operational failures within the ToyBox PWA console and the Animal Memory Match game.

---

## 1. Diagnostics & Root Cause Analysis

On first execution of the console after custom animal assets were added to the server:
- **Symptom**: The launcher rendered correctly, but upon selecting and launching the Memory Match game, the screen went blank (only showing the solid blue background). Taps on the screen did not flip cards or register actions.
- **Diagnostics**:
  1. Inspecting the file system showed that the user had uploaded 7 large high-resolution PNG files (around 5MB to 6.2MB each) to `/assets/sprites/` for the cards.
  2. The game's required asset array in `memory_match.js` included `ui_star` (defined in `config.assets`), but there was no corresponding `ui_star.png` in `/assets/sprites/`.
  3. No audio assets (like `flip_card.ogg`/`mp3`) existed in `/assets/audio/`.

### Root Cause A: Bulk Asset Load Failures
In PixiJS v8, `PIXI.Assets.load(manifest)` returns a single promise representing the load progress of the entire array. If **any** single resource in the manifest fails to load (e.g., a 404 on `ui_star.png`), the entire promise rejects. 
- In our engine loader, this failure meant that the load operation was interrupted.
- Consequently, no textures were cached under their aliases, and `PIXI.Assets.get('card_back')` returned `undefined`.
- In `spawnEntity()`, when `texture` is missing, the engine falls back to spawning a `new PIXI.Container()`. A container has 0x0 size and no visual representation. Therefore, the grid cards spawned as completely invisible, non-interactive empty containers.

### Root Cause B: Massive Card Image Sizes
The custom user PNGs (e.g., `card_back.png`, `card_cow.png`) are extremely large high-resolution source files. Spawning them at a raw `scale: 1.0` meant that each card was rendered at its full physical pixel width (e.g., 2000px+), completely overflowing the 1024x768 CSS viewport and overlapping all other card spawns.

### Root Cause C: Hardcoded Animation Scales
The pop (`pop`) and flip card (`flipCard`) micro-animations in `engine.js` originally animated scale parameters back to a hardcoded `1.0` or `1.4`. For any cards scaled down to fit the grid (e.g., scaled to `0.05` to fit a 120px cell), these animations caused cards to suddenly blow up to their enormous raw dimensions upon being tapped.

### Root Cause D: Service Worker Cache Lock
The Service Worker (`sw.js`) was configured to serve precached shell files (like `app.js` and `memory_match.js`) with a strict `Cache-Only` strategy. When files were updated in the local development workspace, the browser continued loading the old cached versions from memory.

---

## 2. Technical Solutions & Implementation Details

To solve these issues, the following architectural fixes were implemented:

### Fix 1: Resilient Individual Asset Loading
We refactored `preloadGameAssets` inside [engine.js](../../engine/engine.js) to load assets *individually* inside separate async map promises, each protected by its own `try..catch` block:
```javascript
export async function preloadGameAssets(assetConfig) {
  if (!assetConfig || assetConfig.length === 0) return;

  const promises = assetConfig.map(async (key) => {
    try {
      await PIXI.Assets.load({
        alias: key,
        src:   `/assets/sprites/${key}.png`,
      });
    } catch (err) {
      console.warn(`[ToyBox/Engine] Failed to load asset "${key}":`, err);
    }
  });

  await Promise.all(promises);
}
```
This guarantees that even if a resource like `ui_star` fails to load, it prints a warning but allows all other card textures to resolve and register successfully. We also added a placeholder [ui_star.png](../../assets/sprites/ui_star.png) to prevent 404 warnings.

### Fix 2: Robust Audio Initialization & Synthesis Fallback
Web Audio API initialization was made highly resilient inside [audio.js](../../engine/audio.js). If the browser environment lacks Web Audio support or if context creation fails, the system fails silently rather than throwing blocking exceptions. Additionally, if preloading sound assets fails (such as when `/assets/audio` is empty), the game utilizes real-time synthesized sine and triangle wave oscillations to generate pops, chirps, and win fanfare sounds, making audio completely optional.

### Fix 3: Responsive Card Grid Scaling
We updated [memory_match.js](../../games/memory_match.js) to dynamically calculate grid boundaries, column spacing, and card dimensions using the screen's viewport width and height (`engine.width` / `engine.height`).
When cards are spawned, they calculate their scale dynamically relative to their actual texture dimensions:
```javascript
const targetSize = this.gridSpacing * 0.85;
if (card.texture && card.texture.width > 0) {
  const scale = this.targetSize / Math.max(card.texture.width, card.texture.height);
  card.scale.set(scale);
  card._baseScale = scale; // Cache for FX animations
}
```
This ensures cards always fit cleanly inside their grid cells on any screen ratio. We also added an `onResize(engine)` handler that reposition and rescale all cards dynamically during window resizing or device rotation.

### Fix 4: Relatively Scaled FX Animations
We refactored `pop` and `flipCard` in [engine.js](../../engine/engine.js) to animate scale parameters relative to the sprite's base size instead of using hardcoded target values:
- **Card Flips**: During a horizontal flip, the card scales along X down to `0`. When flipping back up, it animates to `entity.scale.y` (the card's vertical base scale, which remains unchanged).
- **Match Pops**: Animates scale up to `baseScale * 1.4` and then down to `0` before destruction.
This ensures cards maintain their correct proportions and sizes throughout all gameplay animations.

### Fix 5: Localhost SW Bypass
We updated the Service Worker fetch event listener in [sw.js](../../sw.js) to detect whether the host is `localhost` or `127.0.0.1` and fall back to a `Network-First` strategy. This bypasses `Cache-Only` behaviors during local development so that updates to JS modules take effect immediately on reload.
