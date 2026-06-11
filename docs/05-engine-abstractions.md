# 05 — Engine Abstractions

The `engine` object is the **sandbox bridge** between a game module and the underlying PixiJS runtime. It exposes a clean, declarative API so game authors never need to write PixiJS code directly.

This document covers the full implementation of every `engine.*` method.

---

## API Surface Overview

```
engine
├── width                         → Canvas width in CSS px (read-only)
├── height                        → Canvas height in CSS px (read-only)
│
├── spawn(options)                → Create & add a sprite/container to stage
├── destroy(entity)               → Remove entity from stage & free resources
│
├── animate(entity, props, ms, easing?)  → Lightweight tween system
│   └── Returns Promise (resolves on completion)
│
├── emit(eventName, payload?)     → Queue an event for game.onEvent()
│
├── audio
│   ├── play(assetId)             → Play a sound effect
│   ├── stop(source)              → Stop a playing sound
│   └── setVolume(level)          → Set master volume (0–1)
│
├── input
│   ├── touches[]                 → Array of active touch points
│   ├── lastTap                   → { x, y, time } of last tap
│   └── controller                → On-screen controller state (see below)
│       ├── dpad.up/down/left/right   → boolean (held)
│       ├── dpad.upLeft/upRight/...   → boolean (diagonal, computed)
│       ├── buttons.a / buttons.b     → boolean (held)
│       └── pressed.dpad.* / pressed.buttons.*  → true for ONE frame only
│
└── system
    ├── exit()                    → Quit game → return to launcher
    ├── triggerWinState(options)  → Show win overlay
    ├── triggerLoseState(options) → Show lose overlay
    └── saveData(key, value)      → Persist data to IndexedDB
    └── loadData(key)             → Retrieve data from IndexedDB
```

---

## `engine.spawn(options)`

Creates a PixiJS Sprite or Container, positions it, and adds it to the stage.

### Implementation

```javascript
// engine/engine.js

function spawnEntity(options) {
  let entity;

  if (options.asset) {
    // Create a Sprite from the preloaded texture cache
    const texture = PIXI.Assets.get(options.asset);
    if (!texture) {
      console.warn(`[ToyBox] Asset not found: "${options.asset}". Did you list it in config.assets?`);
      entity = new PIXI.Container();
    } else {
      entity = new PIXI.Sprite(texture);
    }
  } else if (options.text) {
    // Create a text label
    entity = new PIXI.Text({
      text:  options.text,
      style: new PIXI.TextStyle({
        fontFamily: 'Nunito, sans-serif',
        fontSize:   options.fontSize ?? 48,
        fill:       options.color ?? '#ffffff',
        fontWeight: 'bold',
      }),
    });
  } else {
    entity = new PIXI.Container();
  }

  // Center the anchor on sprites (so x/y is the object's center)
  if (entity.anchor) entity.anchor.set(0.5);

  // Apply positioning and visual properties
  entity.x      = options.x     ?? (app.renderer.width  / app.renderer.resolution / 2);
  entity.y      = options.y     ?? (app.renderer.height / app.renderer.resolution / 2);
  entity.scale.set(options.scale ?? 1);
  entity.alpha  = options.alpha ?? 1;
  entity.angle  = options.angle ?? 0;
  if (options.tint !== undefined) entity.tint = options.tint;

  // Metadata
  entity._toyboxId  = options.id ?? `entity_${Date.now()}`;
  entity._toyboxTag = options.tag;

  // Touch/pointer interaction
  if (options.onTouch) {
    entity.eventMode = 'static';
    entity.cursor    = 'pointer';
    entity.hitArea   = options.hitArea ?? null; // Custom hit area for irregular shapes
    entity.on('pointertap', (e) => {
      e.stopPropagation();
      options.onTouch(entity);
    });
  }

  // Z-ordering (lower zIndex = drawn behind)
  if (options.zIndex !== undefined) {
    entity.zIndex = options.zIndex;
    app.stage.sortableChildren = true;
  }

  app.stage.addChild(entity);
  return entity;
}
```

### `spawn()` Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | auto | Unique debug name |
| `asset` | string | — | Texture key (must be in `config.assets`) |
| `text` | string | — | Render a text label instead of sprite |
| `fontSize` | number | `48` | Text size (when using `text`) |
| `color` | string | `'#ffffff'` | Text color (when using `text`) |
| `x` | number | canvas center | X position (CSS pixels) |
| `y` | number | canvas center | Y position (CSS pixels) |
| `scale` | number | `1` | Uniform scale |
| `alpha` | number | `1` | Opacity (0–1) |
| `angle` | number | `0` | Rotation in degrees |
| `tint` | number | `0xFFFFFF` | Color tint (hex number) |
| `zIndex` | number | — | Render order (higher = in front) |
| `onTouch` | function | — | Tap callback, receives entity |
| `hitArea` | PIXI.Rectangle | — | Custom touch hit area |

---

## `engine.destroy(entity)`

Safely removes an entity from the stage and frees its memory.

```javascript
function destroyEntity(entity) {
  if (!entity) return;

  // Remove from parent (stage or container)
  if (entity.parent) entity.parent.removeChild(entity);

  // Cancel any active tweens targeting this entity
  cancelTweensFor(entity);

  // Destroy the display object (children: true = also destroy nested children)
  entity.destroy({ children: true, texture: false, baseTexture: false });
}
```

> Always pass `texture: false` — this keeps the PixiJS texture cache intact so the next spawn of the same asset is instant.

---

## `engine.animate(entity, targetProperties, duration, easing?)`

A lightweight linear interpolation (Lerp) tween system. Returns a `Promise` that resolves when the animation completes.

### Supported Properties

| Property | Example |
|----------|---------|
| `x` | `{ x: 500 }` |
| `y` | `{ y: 300 }` |
| `scale` | `{ scale: 0 }` |
| `alpha` | `{ alpha: 0 }` |
| `angle` | `{ angle: 360 }` |

### Easing Functions

| Name | Behavior |
|------|---------|
| `'linear'` | Constant speed (default) |
| `'easeIn'` | Starts slow, accelerates |
| `'easeOut'` | Starts fast, decelerates |
| `'easeInOut'` | Slow → fast → slow |
| `'bounce'` | Bounces at the end |
| `'elastic'` | Overshoots and springs back |

### Implementation

```javascript
// engine/engine.js — Tween System

const activeTweens = new Map(); // entity → Set of tween descriptors

function animateEntity(entity, targetProps, duration, easing = 'easeOut') {
  return new Promise((resolve) => {
    const startProps = {};
    const deltaProps = {};

    // Capture start values and compute deltas
    for (const key of Object.keys(targetProps)) {
      if (key === 'scale') {
        startProps.scale = entity.scale.x;
        deltaProps.scale = targetProps.scale - entity.scale.x;
      } else {
        startProps[key] = entity[key];
        deltaProps[key] = targetProps[key] - entity[key];
      }
    }

    const startTime = performance.now();

    const tween = {
      entity,
      startProps,
      deltaProps,
      duration,
      easing,
      startTime,
      resolve,
    };

    if (!activeTweens.has(entity)) activeTweens.set(entity, new Set());
    activeTweens.get(entity).add(tween);
  });
}

// Called every frame from the Ticker
function updateTweens(nowMs) {
  for (const [entity, tweenSet] of activeTweens) {
    for (const tween of tweenSet) {
      const elapsed  = nowMs - tween.startTime;
      const progress = Math.min(elapsed / tween.duration, 1);
      const eased    = applyEasing(progress, tween.easing);

      for (const key of Object.keys(tween.deltaProps)) {
        const value = tween.startProps[key] + tween.deltaProps[key] * eased;
        if (key === 'scale') {
          entity.scale.set(value);
        } else {
          entity[key] = value;
        }
      }

      if (progress >= 1) {
        tweenSet.delete(tween);
        tween.resolve(entity);
      }
    }
    if (tweenSet.size === 0) activeTweens.delete(entity);
  }
}

function applyEasing(t, type) {
  switch (type) {
    case 'linear':    return t;
    case 'easeIn':    return t * t;
    case 'easeOut':   return t * (2 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'bounce':    return bounceEase(t);
    case 'elastic':   return elasticEase(t);
    default:          return t;
  }
}

function bounceEase(t) {
  if (t < (1 / 2.75))      return 7.5625 * t * t;
  else if (t < (2 / 2.75)) { t -= 1.5 / 2.75;   return 7.5625 * t * t + 0.75; }
  else if (t < (2.5/2.75)) { t -= 2.25 / 2.75;  return 7.5625 * t * t + 0.9375; }
  else                      { t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; }
}

function elasticEase(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}
```

### Usage Examples

```javascript
// Fade out and shrink a card when matched
await engine.animate(card, { alpha: 0, scale: 0 }, 400, 'easeIn');

// Slide a tile in from the right
tile.x = engine.width + 100;
engine.animate(tile, { x: targetX }, 600, 'easeOut');

// Bounce a star when score increases
await engine.animate(star, { scale: 1.4 }, 150, 'easeOut');
await engine.animate(star, { scale: 1.0 }, 150, 'bounce');

// Chain animations with Promise.all
await Promise.all([
  engine.animate(cardA, { alpha: 0 }, 300),
  engine.animate(cardB, { alpha: 0 }, 300),
]);
```

---

## `engine.emit(eventName, payload?)`

Queues a named event for delivery to `game.onEvent()` at the end of the current frame.

```javascript
// In the event queue
const eventQueue = [];

function emitEvent(eventName, payload) {
  eventQueue.push({ name: eventName, payload });
}

// Called at the end of each Ticker frame
function flushEventQueue(engine) {
  while (eventQueue.length > 0) {
    const { name, payload } = eventQueue.shift();
    if (currentGame?.onEvent) {
      currentGame.onEvent(engine, name, payload);
    }
  }
}
```

> Events are **deferred** — they fire at the end of the frame, never mid-frame. This prevents re-entrant game logic issues.

---

## `engine.system.*`

### `engine.system.exit()`

```javascript
function triggerExit() {
  stopGameLoop();      // Stop ticker, clear stage
  showLauncher();      // Return to HTML launcher UI (imported from app.js)
}
```

### `engine.system.triggerWinState(options)`

Stops the game loop and shows a win overlay:

```javascript
function showWinState(options) {
  stopGameLoop();

  const overlay = buildSystemOverlay({
    title:   '🌟 You Win!',
    graphic: options.graphic ?? 'ui_star',
    buttons: [
      { label: 'Play Again', action: () => restartCurrentGame() },
      { label: 'Home',       action: () => { exitGame(); showLauncher(); } },
    ],
  });

  document.body.appendChild(overlay);
}
```

### `engine.system.saveData(key, value)` / `loadData(key)`

```javascript
// Delegates to the IndexedDB storage layer (see doc 06)
async function saveData(key, value) {
  await storage.set(`game:${currentGameId}:${key}`, value);
}

async function loadData(key) {
  return storage.get(`game:${currentGameId}:${key}`);
}
```

---

## Micro-Animations for Toddler Engagement

These pre-built animation patterns are critical for the target age group. They make the game feel alive and rewarding without game authors needing to implement custom effects:

```javascript
// Convenience helpers wrapping engine.animate()
// These are exposed on engine.fx.*

engine.fx = {
  // Card flip (scale X to 0, swap texture, scale X to 1)
  async flipCard(entity, newTexture) {
    await engine.animate(entity, { scaleX: 0 }, 150, 'easeIn');
    entity.texture = newTexture;
    await engine.animate(entity, { scaleX: 1 }, 150, 'easeOut');
  },

  // Pop — scale up then back, like a bubble popping
  async pop(entity) {
    await engine.animate(entity, { scale: 1.4 }, 100, 'easeOut');
    await engine.animate(entity, { scale: 0 }, 150, 'easeIn');
    engine.destroy(entity);
  },

  // Wiggle — shake on failure
  async wiggle(entity) {
    const origX = entity.x;
    for (let i = 0; i < 3; i++) {
      await engine.animate(entity, { x: origX + 12 }, 60, 'linear');
      await engine.animate(entity, { x: origX - 12 }, 60, 'linear');
    }
    await engine.animate(entity, { x: origX }, 60, 'linear');
  },

  // Float up and fade — reward particle
  async floatUp(entity) {
    await Promise.all([
      engine.animate(entity, { y: entity.y - 80 }, 600, 'easeOut'),
      engine.animate(entity, { alpha: 0 }, 600, 'easeIn'),
    ]);
    engine.destroy(entity);
  },
};
```

---

## Checklist

- [ ] `engine.spawn()` handles `asset`, `text`, and bare container variants
- [ ] `engine.spawn()` always sets anchor to `0.5` on Sprites
- [ ] `engine.destroy()` cancels active tweens before destroying entity
- [ ] `engine.animate()` returns a Promise resolving on completion
- [ ] Tween system runs in the Ticker (not `setTimeout`)
- [ ] `engine.emit()` queues events for end-of-frame delivery
- [ ] `engine.system.exit()` stops ticker, clears stage, shows launcher
- [ ] `engine.fx.*` micro-animations are implemented and tested
- [ ] `engine.audio.*` delegates to the audio module (see doc 09)
- [ ] `engine.system.saveData/loadData` delegates to IndexedDB (see doc 06)
- [ ] `engine.input.controller` populated from controller state each frame (see [doc 14](./14-on-screen-controller.md))
- [ ] `engine.input.controller.pressed.*` flags cleared after each frame in Ticker

---

**Previous:** [04 — Game API Contract](./04-game-api-contract.md) | **Next:** [06 — Service Worker & Storage →](./06-service-worker-caching.md)

**Also see:** [14 — On-Screen Controller](./14-on-screen-controller.md)
