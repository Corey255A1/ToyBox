# 13 — Game Preview System

The Game Preview System renders a **live animated preview** of each game directly inside the launcher tile. When the launcher loads, each game's JS cartridge is executed in a lightweight mini-canvas, running its optional `preview()` method. The result is a small looping animation in each tile — like a mini attract mode — that gives players a real glimpse of the game before tapping.

---

## Design Goals

| Goal | Implementation |
|------|---------------|
| Show real game output (not just a static icon) | Each game runs `preview(miniEngine)` in its own small canvas |
| Lightweight — doesn't block the launcher | Preview canvases initialize staggered, after the launcher renders |
| Looping — plays continuously until tapped | `preview()` is called in a separate Ticker loop |
| Graceful fallback | If game has no `preview()`, show a styled static placeholder |
| Memory efficient | Each mini-canvas uses Canvas2D (not WebGL) to avoid GPU context limits |
| Offline — previews run entirely from cached JS | Same Blob URL evaluation as full game loading |

---

## Architecture

```
Launcher Tile
├── .game-tile__preview             ← container div
│   └── <canvas class="preview-canvas">  ← small canvas (240×160px)
│       └── Preview PixiJS/Canvas context
│           └── game.preview(miniEngine) → renders animated frames
└── .game-tile__title               ← game title text

engine/previewer.js
├── initPreviewer(canvas, gameEntry)  → loads game module, boots preview
├── stopPreviewer(canvas)            → stops loop, clears resources
└── PreviewEngine                   → lightweight engine subset for preview
```

---

## Step 1 — The `preview()` Game Contract Extension

Games may optionally export a `preview(miniEngine)` method. This runs in the small tile canvas and should show a short (2–4 second) looping animation representative of the game.

```javascript
// games/memory_match.js — preview method added

export default {

  config: { /* ... */ },

  // ── NEW: Optional preview method ─────────────────────────────────────────
  // Called by the launcher tile system in a small isolated canvas.
  // miniEngine is a subset of the full engine — no audio, no system calls.
  // Must be fast and lightweight: target 30fps, minimal allocations.
  // The preview LOOPS automatically — do not call engine.system.exit().
  preview(miniEngine) {
    this._previewTime = 0;
    this._cards = [];

    // Spawn a 3×2 grid of simplified card backs
    const cols = 3, rows = 2;
    for (let i = 0; i < cols * rows; i++) {
      const card = miniEngine.spawn({
        id:    `prev_card_${i}`,
        asset: 'card_back',
        x:     (miniEngine.width  / (cols + 1)) * ((i % cols) + 1),
        y:     (miniEngine.height / (rows + 1)) * (Math.floor(i / cols) + 1),
        scale: 0.5,
      });
      card._delay = i * 0.15; // Staggered reveal
      this._cards.push(card);
    }
  },

  // ── NEW: previewUpdate — called each preview frame ─────────────────────
  // Like update() but for the preview context. DeltaTime in seconds.
  previewUpdate(miniEngine, deltaTime) {
    this._previewTime += deltaTime;

    // Animate cards flipping in one by one, then reset after 3 seconds
    for (const card of this._cards) {
      const t = this._previewTime - card._delay;
      if (t > 0 && t < 0.3) {
        // Flip-in animation
        card.scale.set(Math.min(0.5, t / 0.3 * 0.5));
      }
    }

    // Loop: reset after 3 seconds
    if (this._previewTime > 3) {
      this._previewTime = 0;
      for (const card of this._cards) {
        card.scale.set(0);
      }
    }
  },

  init(engine)   { /* ... full game init ... */ },
  update(engine, deltaTime) { /* ... */ },
  onEvent(engine, eventName, payload) { /* ... */ },
};
```

### `preview()` Contract Rules

| Rule | Details |
|------|---------|
| ✅ Optional | Host shows a placeholder if missing |
| ✅ Uses `miniEngine` subset | Only `spawn`, `destroy`, `animate`, `width`, `height` |
| ❌ No `audio.*` | Preview is silent (audio.play() is a no-op in miniEngine) |
| ❌ No `system.*` | `exit()`, `triggerWinState()` are no-ops in miniEngine |
| ❌ No `onTouch` callbacks | Touch events are suppressed in preview mode |
| ✅ Must loop | Loop using time accumulation; never call `engine.system.exit()` |
| ✅ Target ≤ 30fps | Preview Tickers run at half rate to save resources |
| ✅ State on `this` | Works the same as the full game — use `this._previewXxx` prefix |

---

## Step 2 — Mini Engine for Previews

The preview engine is a **strict subset** of the full game engine. It runs on a small `<canvas>` element using a dedicated lightweight PixiJS application.

```javascript
// engine/previewer.js

import { evaluateModule } from './loader.js';

// All active preview contexts (gameId → PreviewContext)
const activeContexts = new Map();

/**
 * Initialize a preview animation in a given canvas element.
 *
 * @param {HTMLCanvasElement} canvas    - The tile's preview canvas
 * @param {Object}            gameEntry - Game manifest entry
 * @param {string}            source    - Raw JS source of the game module
 */
export async function initPreviewer(canvas, gameEntry, source) {
  // Stop any existing preview on this canvas
  stopPreviewer(canvas);

  // Evaluate the game module (reuse cached blob if possible)
  let gameModule;
  try {
    gameModule = await evaluateModule(source);
  } catch (err) {
    console.warn(`[ToyBox/Preview] Failed to load module for ${gameEntry.id}:`, err);
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  // If no preview method, show fallback
  if (typeof gameModule.preview !== 'function') {
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  // Create a PixiJS Application for this preview canvas
  const previewApp = new PIXI.Application();
  await previewApp.init({
    canvas,
    width:           canvas.clientWidth,
    height:          canvas.clientHeight,
    backgroundColor: parseInt(
      (gameModule.config?.background ?? '#1a1a2e').replace('#', ''), 16
    ),
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
    antialias:       true,
    // Use 'low-power' to avoid fighting main game for GPU resources
    powerPreference: 'low-power',
  });

  // Preload declared assets (preview might share assets with full game)
  if (gameModule.config?.assets?.length) {
    try {
      const manifest = gameModule.config.assets.map(key => ({
        alias: key,
        src:   `/assets/sprites/${key}.png`,
      }));
      await PIXI.Assets.load(manifest);
    } catch { /* Asset load failures are silently ignored for previews */ }
  }

  // Build the mini engine object
  const miniEngine = buildMiniEngine(previewApp);

  // Initialize the game's preview
  try {
    await gameModule.preview(miniEngine);
  } catch (err) {
    console.warn(`[ToyBox/Preview] preview() threw for ${gameEntry.id}:`, err);
    previewApp.destroy(true);
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  // Start the preview tick loop at 30fps
  let lastTime = performance.now();
  const context = {
    app: previewApp,
    gameModule,
    miniEngine,
    tickHandle: null,
  };

  function tick() {
    const now      = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
    lastTime = now;

    if (gameModule.previewUpdate) {
      try {
        gameModule.previewUpdate(miniEngine, deltaTime);
      } catch { /* Silently ignore preview errors */ }
    }

    context.tickHandle = requestAnimationFrame(tick);
  }

  // Start at 30fps by throttling with setTimeout
  function throttledTick() {
    tick();
    // Don't use the RAF handle for throttle — use a separate timer
  }

  context.tickHandle = setTimeout(function loop() {
    tick();
    context.tickHandle = setTimeout(loop, 33); // ~30fps
  }, 33);

  activeContexts.set(canvas, context);
}

/**
 * Stop a preview animation and free its resources.
 * @param {HTMLCanvasElement} canvas
 */
export function stopPreviewer(canvas) {
  const context = activeContexts.get(canvas);
  if (!context) return;

  clearTimeout(context.tickHandle);
  cancelAnimationFrame(context.tickHandle);

  try {
    context.app.destroy(true, { children: true, texture: false, baseTexture: false });
  } catch { /* Ignore destroy errors */ }

  activeContexts.delete(canvas);
}

/**
 * Stop all active preview animations.
 * Called when the launcher transitions to a game.
 */
export function stopAllPreviewers() {
  for (const canvas of activeContexts.keys()) {
    stopPreviewer(canvas);
  }
}
```

---

## Step 3 — Mini Engine Object

The mini engine is a reduced version of the full engine bridge. It only exposes methods safe for use in a small canvas context.

```javascript
// engine/previewer.js — buildMiniEngine

function buildMiniEngine(app) {
  return {
    width:  app.renderer.width  / app.renderer.resolution,
    height: app.renderer.height / app.renderer.resolution,

    // ── Entity Management ───────────────────────────────────────────────────
    spawn(options) {
      let entity;

      if (options.asset) {
        const texture = PIXI.Assets.get(options.asset);
        entity = texture ? new PIXI.Sprite(texture) : new PIXI.Container();
      } else if (options.text) {
        entity = new PIXI.Text({
          text: options.text,
          style: new PIXI.TextStyle({
            fontFamily: 'Nunito, sans-serif',
            fontSize:   options.fontSize ?? 24,
            fill:       options.color ?? '#ffffff',
            fontWeight: 'bold',
          }),
        });
      } else {
        entity = new PIXI.Container();
      }

      if (entity.anchor) entity.anchor.set(0.5);

      entity.x     = options.x     ?? (app.renderer.width  / app.renderer.resolution / 2);
      entity.y     = options.y     ?? (app.renderer.height / app.renderer.resolution / 2);
      entity.scale.set(options.scale ?? 1);
      entity.alpha = options.alpha ?? 1;
      entity.angle = options.angle ?? 0;
      if (options.tint !== undefined) entity.tint = options.tint;

      // onTouch is a no-op in preview mode
      app.stage.addChild(entity);
      return entity;
    },

    destroy(entity) {
      if (!entity) return;
      if (entity.parent) entity.parent.removeChild(entity);
      entity.destroy({ children: true, texture: false, baseTexture: false });
    },

    animate(entity, targetProps, duration, easing = 'easeOut') {
      // Use the same tween system as the full engine
      return animateEntity(entity, targetProps, duration, easing);
    },

    // ── Stubs for unsupported features ─────────────────────────────────────
    audio: {
      play:      () => { /* No audio in preview */ },
      stop:      () => {},
      setVolume: () => {},
    },

    emit:  () => { /* No event bus in preview */ },
    input: { touches: [], lastTap: null },

    system: {
      exit:             () => { /* No-op in preview */ },
      triggerWinState:  () => { /* No-op in preview */ },
      triggerLoseState: () => { /* No-op in preview */ },
      saveData:         async () => null,
      loadData:         async () => null,
    },
  };
}
```

---

## Step 4 — Fallback Preview Renderer

When a game has no `preview()` method, or if the preview fails to load, a styled placeholder is rendered on the canvas using the Canvas 2D API:

```javascript
// engine/previewer.js

function renderFallbackPreview(canvas, gameEntry) {
  const ctx    = canvas.getContext('2d');
  const width  = canvas.width;
  const height = canvas.height;

  // Gradient background using the game's theme color
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f3460');
  grad.addColorStop(1, '#16213e');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Game title initial letter (large)
  const initials = (gameEntry.title || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font      = `bold ${height * 0.45}px Nunito, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, width / 2, height / 2);

  // Subtle border glow
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}
```

---

## Step 5 — Updated Launcher Tile HTML

The game tile structure changes significantly from the original design. The static icon is replaced with a live preview canvas, and the description is removed to make room:

```javascript
// app.js — updated buildGameTile()

function buildGameTile(game) {
  const PREVIEW_WIDTH  = 240;
  const PREVIEW_HEIGHT = 150; // 8:5 aspect ratio

  return `
    <div class="game-tile" data-game-id="${game.id}" role="button" tabindex="0"
         aria-label="Play ${game.title}">

      <!-- Live preview canvas -->
      <div class="game-tile__preview-wrap">
        <canvas class="game-tile__preview-canvas"
                id="preview-canvas-${game.id}"
                width="${PREVIEW_WIDTH}"
                height="${PREVIEW_HEIGHT}"
                aria-hidden="true"></canvas>
        <!-- Tap-to-play overlay shown on hover/focus -->
        <div class="game-tile__play-overlay" aria-hidden="true">
          <span class="game-tile__play-icon">▶</span>
        </div>
      </div>

      <!-- Title bar below preview -->
      <div class="game-tile__footer">
        <span class="game-tile__title">${game.title}</span>
        ${game.sideloaded ? '<span class="game-tile__badge">Custom</span>' : ''}
        ${game.tags?.includes('controller') ? '<span class="game-tile__badge game-tile__badge--ctrl">🎮</span>' : ''}
      </div>

    </div>
  `;
}
```

---

## Step 6 — Updated Game Tile CSS

```css
/* =============================================
   Game Tile — Preview Canvas Layout
   ============================================= */

.game-tile {
  background: var(--color-bg-card);
  border-radius: var(--radius-card);
  padding: 0;                /* Remove padding — preview fills edge to edge */
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;           /* Clip preview canvas to rounded corners */
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}

.game-tile:active {
  transform: scale(0.97);
  box-shadow: var(--shadow-glow);
}

/* ── Preview Canvas Wrapper ───────────────────────────────────────────────── */
.game-tile__preview-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 8 / 5;    /* 240:150 = 8:5 */
  overflow: hidden;
  background: #0f3460;
}

.game-tile__preview-canvas {
  width: 100%;
  height: 100%;
  display: block;
  /* Pixelated scaling keeps crisp pixel art */
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* ── Play Overlay (appears on hover/focus) ───────────────────────────────── */
.game-tile__play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.game-tile:hover .game-tile__play-overlay,
.game-tile:focus .game-tile__play-overlay {
  background: rgba(0,0,0,0.35);
}

.game-tile__play-icon {
  font-size: 2.5rem;
  color: #fff;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease, transform 0.2s ease;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));
}

.game-tile:hover .game-tile__play-icon,
.game-tile:focus .game-tile__play-icon {
  opacity: 1;
  transform: scale(1);
}

/* ── Footer Bar ──────────────────────────────────────────────────────────── */
.game-tile__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-xs) var(--space-sm);
  gap: var(--space-xs);
  background: rgba(0,0,0,0.2);
}

.game-tile__title {
  font-size: var(--font-size-md);
  font-weight: 700;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Badges ──────────────────────────────────────────────────────────────── */
.game-tile__badge {
  font-size: var(--font-size-sm);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,0.12);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.game-tile__badge--ctrl {
  background: rgba(74, 222, 128, 0.15);
  color: var(--color-accent-3);
}
```

---

## Step 7 — Staggered Preview Initialization

To avoid performance spikes, previews initialize staggered — 150ms apart — after the launcher renders. This prevents all game modules from loading simultaneously.

```javascript
// app.js — preview bootstrapping

import { initPreviewer, stopAllPreviewers } from './engine/previewer.js';
import { resolveGameSource } from './engine/loader.js';

async function initAllPreviews(games) {
  for (let i = 0; i < games.length; i++) {
    const game = games[i];

    // Stagger initialization
    await new Promise(resolve => setTimeout(resolve, i * 150));

    const canvas = document.getElementById(`preview-canvas-${game.id}`);
    if (!canvas) continue; // Tile may have been removed

    try {
      const source = await resolveGameSource(game);
      initPreviewer(canvas, game, source); // Fire-and-forget
    } catch (err) {
      console.warn(`[ToyBox] Preview init failed for ${game.id}:`, err);
      // Canvas will show the fallback via the 2D context
    }
  }
}

// In renderLauncher(), after building tile HTML:
async function renderLauncher() {
  const games = await getAllGames();

  appShell.innerHTML = `
    <header class="launcher-header"> ... </header>
    <main class="game-grid" id="game-grid">
      ${games.map(buildGameTile).join('')}
    </main>
  `;

  wireGameGridEvents(games);

  // Start previews staggered after render
  requestAnimationFrame(() => initAllPreviews(games));
}

// Stop all previews when a game launches
async function onGameSelected(game) {
  stopAllPreviewers();       // Free GPU resources from preview canvases
  showLoadingScreen();
  try {
    await loadGame(game, { onReady: () => { hideLoadingScreen(); showGame(); } });
  } catch (err) {
    console.error('[ToyBox] Failed to load game:', err);
    hideLoadingScreen();
    renderLauncher();        // Re-render + re-init previews
  }
}
```

---

## Step 8 — WebGL Context Limit Considerations

Browsers limit simultaneous WebGL contexts (typically 8–16). If ToyBox has many games, running a WebGL PixiJS instance per tile will hit this limit.

### Strategy: Canvas 2D for Previews

Use the Canvas 2D API for previews instead of WebGL to avoid the context limit:

```javascript
// Alternative approach: render preview frames to 2D canvas
// In buildMiniEngine(), replace PixiJS with a Canvas 2D draw API

function buildCanvas2DMiniEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const width  = canvas.width;
  const height = canvas.height;
  const entities = [];

  return {
    width,
    height,
    spawn(options) {
      const entity = {
        x:     options.x ?? width / 2,
        y:     options.y ?? height / 2,
        scale: options.scale ?? 1,
        alpha: options.alpha ?? 1,
        angle: options.angle ?? 0,
        color: options.color ?? '#ffffff',
        text:  options.text ?? null,
        asset: options.asset ?? null,
        _destroyed: false,
      };
      entities.push(entity);
      return entity;
    },
    destroy(entity) {
      entity._destroyed = true;
    },
    animate: animateEntity, // Shared tween system
    audio:   { play: () => {}, stop: () => {}, setVolume: () => {} },
    emit:    () => {},
    system:  { exit: () => {}, triggerWinState: () => {}, triggerLoseState: () => {} },

    // Called each frame by the preview loop to render all entities
    _render() {
      ctx.clearRect(0, 0, width, height);
      for (const e of entities) {
        if (e._destroyed) continue;
        ctx.save();
        ctx.globalAlpha = e.alpha;
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle * Math.PI / 180);
        ctx.scale(e.scale, e.scale);

        if (e.text) {
          ctx.fillStyle = e.color;
          ctx.font      = `bold 24px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else {
          // Draw colored rectangle as sprite placeholder
          ctx.fillStyle = e.color;
          ctx.fillRect(-24, -24, 48, 48);
        }
        ctx.restore();
      }
    },
  };
}
```

**Recommended approach:** Use **Canvas 2D** for all previews. This eliminates the WebGL context limit and reduces GPU memory pressure. The visual quality is sufficient for small animated thumbnails.

---

## Preview Method Writing Guide

When writing a `preview()` for a game:

```javascript
// ✅ Good preview — simple, looping, representative
preview(miniEngine) {
  this._t = 0;
  // Spawn 3 bubbles
  this._bubbles = [0,1,2].map(i => miniEngine.spawn({
    id: `prev_b_${i}`,
    asset: 'bubble_blue',
    x: miniEngine.width * (0.25 + i * 0.25),
    y: miniEngine.height / 2,
    scale: 0.4 + i * 0.1,
  }));
},

previewUpdate(miniEngine, dt) {
  this._t += dt;
  this._bubbles.forEach((b, i) => {
    b.y = miniEngine.height / 2 + Math.sin(this._t * 2 + i) * 20;
    b.angle = this._t * 30;
  });
  // Reset every 4 seconds (implicit loop — no cleanup needed)
},

// ❌ Bad preview — too complex, spawns many objects, no loop reset
preview(miniEngine) {
  for (let i = 0; i < 100; i++) {  // Too many entities
    miniEngine.spawn({ id: `e_${i}`, asset: 'card_back' });
  }
  // No previewUpdate → static and boring
}
```

---

## Checklist

- [ ] `engine/previewer.js` created with `initPreviewer`, `stopPreviewer`, `stopAllPreviewers`
- [ ] `buildMiniEngine()` stubs out audio, system, and input APIs
- [ ] `renderFallbackPreview()` renders styled Canvas 2D placeholder when no `preview()` defined
- [ ] Game tiles updated: preview canvas replaces icon, title in footer bar
- [ ] Preview canvases use Canvas 2D (not WebGL) to avoid context limit
- [ ] Preview Tickers run at ~30fps (throttled with setTimeout)
- [ ] Previews initialize staggered (150ms between each game)
- [ ] `stopAllPreviewers()` called before a game loads
- [ ] Previews restart when user returns to launcher
- [ ] Game contract updated: `preview(miniEngine)` and `previewUpdate(miniEngine, dt)` documented as optional
- [ ] Tiles have hover overlay showing ▶ play icon

---

**Previous:** [12 — Settings System](./12-settings-system.md) | **Next:** [14 — On-Screen Controller →](./14-on-screen-controller.md)
