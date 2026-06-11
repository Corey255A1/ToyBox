# 03 — Runtime Layer (PixiJS)

The Runtime Layer is the heart of ToyBox's visual engine. It manages the PixiJS application instance, the fullscreen canvas, the main game loop (Ticker), and high-DPI resolution scaling for tablet screens.

---

## Responsibilities

```
Runtime Layer (engine/engine.js)
├── PixiJS Application creation & canvas management
├── High-DPI / devicePixelRatio resolution scaling
├── Canvas resize handling (orientation change, window resize)
├── Primary Ticker loop (requestAnimationFrame wrapper)
│   ├── Delta time calculation
│   ├── Dispatch touch events to game
│   └── Call game.update(engine, deltaTime)
├── Entity (Sprite/Container) lifecycle
│   ├── engine.spawn() — create & add to stage
│   └── entity.destroy() — remove from stage
└── Stage cleanup between game sessions
```

---

## Step 1 — PixiJS Application Setup

The PixiJS `Application` object is the top-level singleton. It owns the WebGL renderer, the `stage` (root container), and the `Ticker`.

```javascript
// engine/engine.js

let app = null;           // PixiJS Application singleton
let currentGame = null;   // Active game module reference
let inputState = null;    // Shared input state (from input.js)

/**
 * Initialize the PixiJS Application and attach it to the canvas element.
 * Called once on first game boot; subsequent games reuse the same app instance.
 */
export async function initRuntime(canvas) {
  if (app) return app; // Reuse existing instance

  app = new PIXI.Application();

  await app.init({
    canvas,
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x1a1a2e,      // Match CSS background color
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,          // Auto-scale canvas for high-DPI displays
    antialias:       true,
    powerPreference: 'high-performance',
  });

  // Handle resize events (orientation change on tablet)
  window.addEventListener('resize', () => resizeRenderer());

  return app;
}
```

### PixiJS v8 Init Notes

PixiJS v8 uses an async `app.init()` pattern (replacing the v7 constructor). Always `await app.init()` before accessing `app.stage` or `app.renderer`.

Key init options:

| Option | Value | Purpose |
|--------|-------|---------|
| `canvas` | `<canvas>` DOM element | Use existing element instead of creating a new one |
| `resolution` | `devicePixelRatio` | Crisp rendering on retina/tablet screens |
| `autoDensity` | `true` | CSS pixel size stays consistent, device pixels scale up |
| `antialias` | `true` | Smoothed edges on sprites |
| `powerPreference` | `'high-performance'` | Request discrete GPU on dual-GPU devices |

---

## Step 2 — Resolution & Canvas Sizing

Tablets have a `devicePixelRatio` of 1.5–3x. Without correct scaling, the canvas appears blurry.

```javascript
/**
 * Resize the PixiJS renderer to fill the window.
 * Must be called on init and every time the window resizes.
 */
function resizeRenderer() {
  if (!app) return;

  const width  = window.innerWidth;
  const height = window.innerHeight;

  app.renderer.resize(width, height);

  // Notify the active game of the new dimensions
  if (currentGame?.onResize) {
    currentGame.onResize(buildEngineObject());
  }
}
```

**How `autoDensity` + `resolution` work together:**

```
Physical screen:  2048 × 1536 px  (iPad, devicePixelRatio = 2)
CSS size:         1024 × 768 px
canvas CSS style: width: 1024px; height: 768px;  ← autoDensity sets this
canvas internal:  2048 × 1536 px  ← resolution: 2 sets this
Result:           Sharp, crisp rendering at native resolution
```

---

## Step 3 — The Engine Object (Bridge API)

Rather than giving games direct access to `app`, the runtime exposes a clean **Engine Bridge Object**. This object is passed to every game lifecycle method.

```javascript
/**
 * Build the engine bridge object for the current frame.
 * This is the API that every game module receives.
 */
function buildEngineObject() {
  return {
    // Canvas dimensions (in CSS pixels — use these for game layout)
    width:  app.renderer.width  / app.renderer.resolution,
    height: app.renderer.height / app.renderer.resolution,

    // Entity management
    spawn:   (options) => spawnEntity(options),
    destroy: (entity)  => destroyEntity(entity),

    // Animation / tweening
    animate: (entity, targetProps, duration, easing) =>
             animateEntity(entity, targetProps, duration, easing),

    // Audio subsystem (see engine/audio.js)
    audio: audioSystem,

    // Input state (read-only snapshot)
    input: { ...inputState },

    // Event broker
    emit:  (eventName, payload) => emitEvent(eventName, payload),

    // System controls
    system: {
      exit:          () => triggerExit(),
      triggerWinState: (options) => showWinState(options),
      triggerLoseState: (options) => showLoseState(options),
    },
  };
}
```

The engine object is **rebuilt every frame** in the Ticker so games always get fresh `width`, `height`, and `input` snapshots.

---

## Step 4 — The Ticker (Game Loop)

The PixiJS `Ticker` replaces raw `requestAnimationFrame` and provides a precise `deltaTime` value.

```javascript
/**
 * Start the main game loop.
 * Called after a game module has been loaded and init()'d.
 */
export function startGameLoop(gameModule, engineRef) {
  currentGame = gameModule;

  // PixiJS Ticker fires every frame
  app.ticker.add((ticker) => {
    // ticker.deltaTime  = frames elapsed since last tick (usually ~1.0 at 60fps)
    // ticker.deltaMS    = milliseconds since last tick
    const deltaTime = ticker.deltaMS / 1000; // Convert to seconds for physics

    // 1. Build a fresh engine snapshot
    const engine = buildEngineObject();

    // 2. Process and clear the input queue
    processInputEvents(engine);

    // 3. Run the game's per-frame update
    if (currentGame?.update) {
      currentGame.update(engine, deltaTime);
    }

    // 4. Flush pending engine events to game.onEvent
    flushEventQueue(engine);
  });
}

/**
 * Stop the game loop and clear the stage.
 * Called by engine.system.exit()
 */
export function stopGameLoop() {
  app.ticker.remove(tickerCallback); // Remove game-specific tick listener
  clearStage();
  currentGame = null;
}

function clearStage() {
  // Destroy all children of the stage (frees GPU textures & memory)
  while (app.stage.children.length > 0) {
    const child = app.stage.children[0];
    app.stage.removeChild(child);
    child.destroy({ children: true, texture: false, baseTexture: false });
    // Note: texture:false — we keep textures in the cache for the next game
  }
}
```

### Delta Time Explained

Using `deltaMS / 1000` (seconds) rather than raw frame counts keeps game physics frame-rate independent:

```javascript
// Frame-rate DEPENDENT (bad — runs faster at 120fps than 60fps)
entity.x += 5;

// Frame-rate INDEPENDENT (correct — always moves 200px/second)
entity.x += 200 * deltaTime;
```

---

## Step 5 — Texture Loading & Asset Management

Games declare which textures they need via a `config.assets` array. The runtime preloads them before calling `game.init()`.

```javascript
/**
 * Load all textures declared in the game's config.assets list.
 * Uses PixiJS Assets API (v8) with automatic caching.
 */
export async function preloadGameAssets(assetConfig) {
  if (!assetConfig || assetConfig.length === 0) return;

  const manifest = assetConfig.map(key => ({
    alias: key,
    src:   `/assets/sprites/${key}.png`,
  }));

  await PIXI.Assets.load(manifest);
}
```

Assets loaded via `PIXI.Assets.load()` are automatically cached in the PixiJS texture cache. Subsequent calls with the same alias are instant (no re-download).

**Texture cache strategy:**
- Bundled game assets are **precached** by the Service Worker at install time
- Dynamic/sideloaded game assets are fetched on first play and cached by the browser HTTP cache

---

## Step 6 — Entity System (`engine.spawn`)

The `spawn` function is the primary way games add visual objects to the stage:

```javascript
/**
 * Create a PixiJS sprite or container and add it to the stage.
 *
 * @param {Object} options
 * @param {string}   options.id        - Unique identifier for the entity
 * @param {string}   [options.asset]   - Texture asset key (from PIXI.Assets cache)
 * @param {number}   [options.x]       - X position (CSS pixels, from left)
 * @param {number}   [options.y]       - Y position (CSS pixels, from top)
 * @param {number}   [options.scale]   - Uniform scale factor (default: 1)
 * @param {number}   [options.alpha]   - Opacity 0–1 (default: 1)
 * @param {Function} [options.onTouch] - Callback when entity is tapped
 * @returns {PIXI.Sprite|PIXI.Container} The created entity
 */
function spawnEntity(options) {
  let entity;

  if (options.asset) {
    const texture = PIXI.Assets.get(options.asset);
    entity = new PIXI.Sprite(texture);
  } else {
    entity = new PIXI.Container();
  }

  // Center the anchor so x/y refer to the object's center
  if (entity.anchor) entity.anchor.set(0.5);

  // Apply options
  entity.x        = options.x     ?? app.renderer.width  / 2;
  entity.y        = options.y     ?? app.renderer.height / 2;
  entity.scale.set(options.scale ?? 1);
  entity.alpha    = options.alpha ?? 1;
  entity._toyboxId = options.id;

  // Register touch handler
  if (options.onTouch) {
    entity.eventMode = 'static';
    entity.cursor    = 'pointer';
    entity.on('pointertap', () => options.onTouch(entity));
  }

  app.stage.addChild(entity);
  return entity;
}
```

### Entity Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | required | Unique name for debugging |
| `asset` | string | — | Texture key from asset cache |
| `x` | number | canvas center | X position in CSS pixels |
| `y` | number | canvas center | Y position in CSS pixels |
| `scale` | number | `1` | Uniform size multiplier |
| `alpha` | number | `1` | Opacity (0 = invisible, 1 = opaque) |
| `tint` | number | `0xFFFFFF` | Color tint as hex number |
| `onTouch` | function | — | Tap callback, receives entity as argument |

---

## Step 7 — Stage Cleanup Between Games

When a game exits, all entities must be destroyed to prevent GPU memory leaks:

```javascript
function clearStage() {
  app.stage.removeChildren().forEach(child => {
    // Destroy containers + their children, but preserve shared textures
    child.destroy({ children: true, texture: false, baseTexture: false });
  });

  // Cancel any running tweens
  activeTweens.clear();

  // Reset ticker (remove game-specific listeners)
  app.ticker.stop();
  app.ticker.remove(gameTickHandler);
  app.ticker.start();
}
```

> **Memory Leak Warning:** Always use `destroy({ children: true })` when removing containers. Simply calling `removeChild()` without `destroy()` leaves orphaned GPU texture references.

---

## Checklist

- [ ] `initRuntime(canvas)` creates a single PixiJS Application instance
- [ ] `devicePixelRatio` and `autoDensity` configured for sharp tablet rendering
- [ ] Resize handler updates renderer when orientation changes
- [ ] `buildEngineObject()` returns fresh state every frame
- [ ] Ticker drives `game.update(engine, deltaTime)` each frame
- [ ] `deltaTime` is in seconds (not frames) for frame-rate-independent logic
- [ ] `spawnEntity()` sets anchor to 0.5 (center) on all sprites
- [ ] `clearStage()` destroys all children without destroying cached textures
- [ ] `preloadGameAssets()` uses PixiJS Assets API v8 with alias-based caching

---

**Previous:** [02 — Host Layer](./02-host-layer.md) | **Next:** [04 — Game API Contract →](./04-game-api-contract.md)
