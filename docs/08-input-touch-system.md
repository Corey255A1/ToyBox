# 08 — Input & Touch System

ToyBox is designed exclusively for **touch-first tablet interaction**. This document covers the input pipeline from raw browser events through to the semantic API exposed to game modules.

---

## Design Principles

1. **Use `pointer` events**, not `touch` events — Pointer Events are a unified API that handles touch, mouse, and stylus with a single interface
2. **Normalize coordinates** to CSS pixel space before passing to games
3. **Debounce rapid taps** to prevent accidental double-triggers
4. **Never block the main thread** — input handlers are lightweight and fast
5. **Game modules read input state, they don't register listeners** — all event routing is handled by the host

---

## Input Pipeline

```
Raw Browser Events
        │
        ▼
engine/input.js  (Pointer Event listeners on the canvas)
        │
        ├── Translate to normalized CSS pixel coordinates
        ├── Calculate delta (dx, dy) for drag events
        └── Push to inputQueue
                │
                ▼
        Host Ticker Loop (each frame)
                │
                ├── Read inputQueue
                ├── Dispatch to PixiJS sprite hit detection (for onTouch callbacks)
                └── Build engine.input snapshot → passed to game.update()
                        │
                        ▼
                Game Module
                        ├── Reads engine.input.touches (drag mode)
                        └── Receives onTouch callbacks (tap mode)
```

---

## Step 1 — Input State Model

The input system maintains a shared state object that is read-only from the game's perspective:

```javascript
// engine/input.js

export const inputState = {
  // Array of currently active touch points
  touches: [],   // [{ id, x, y, startX, startY, dx, dy, startTime }]

  // The most recent tap (pointertap)
  lastTap: null, // { x, y, time }

  // Drag state (only in 'drag' interactionMode)
  drag: {
    active:  false,
    startX:  0,
    startY:  0,
    currentX: 0,
    currentY: 0,
    dx:      0,
    dy:      0,
  },
};

// The queue of discrete events (tap, drag-start, drag-end)
// Consumed and cleared each frame by the Ticker
export const inputQueue = [];
```

---

## Step 2 — Configuring the Input Mode

Different games need different input optimizations. The `configureInput()` function sets up event listeners based on the game's declared `interactionMode`:

```javascript
// engine/input.js

let canvas         = null;
let interactionMode = 'tap';

/**
 * Configure pointer event listeners for the specified interaction mode.
 * Called by the Game Loader before game.init().
 *
 * @param {'tap'|'drag'|'none'} mode
 */
export function configureInput(mode) {
  interactionMode = mode;

  // Remove previous listeners (clean slate)
  if (canvas) {
    canvas.removeEventListener('pointerdown',  onPointerDown);
    canvas.removeEventListener('pointermove',  onPointerMove);
    canvas.removeEventListener('pointerup',    onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
  }

  canvas = document.getElementById('game-canvas');

  if (mode === 'none') return; // No input needed

  canvas.addEventListener('pointerdown',  onPointerDown,  { passive: true });
  canvas.addEventListener('pointerup',    onPointerUp,    { passive: true });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: true });

  if (mode === 'drag') {
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  }
}
```

> **`{ passive: true }`** tells the browser the handler won't call `preventDefault()`, allowing the browser to scroll/zoom immediately without waiting for the JS handler. This reduces input latency by ~16ms on mobile.

---

## Step 3 — Pointer Event Handlers

```javascript
// engine/input.js

const activePointers = new Map(); // pointerId → touch data

function onPointerDown(event) {
  const point = normalizePointer(event);

  activePointers.set(event.pointerId, {
    ...point,
    startX:    point.x,
    startY:    point.y,
    startTime: Date.now(),
    dx: 0,
    dy: 0,
  });

  inputState.touches = [...activePointers.values()];

  if (interactionMode === 'drag') {
    inputState.drag.active  = true;
    inputState.drag.startX  = point.x;
    inputState.drag.startY  = point.y;
    inputState.drag.currentX = point.x;
    inputState.drag.currentY = point.y;
    inputState.drag.dx      = 0;
    inputState.drag.dy      = 0;

    inputQueue.push({ type: 'drag_start', x: point.x, y: point.y });
  }
}

function onPointerMove(event) {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;

  const point = normalizePointer(event);
  pointer.x  = point.x;
  pointer.y  = point.y;
  pointer.dx = point.x - pointer.startX;
  pointer.dy = point.y - pointer.startY;

  inputState.touches = [...activePointers.values()];

  if (interactionMode === 'drag' && inputState.drag.active) {
    const dx = point.x - inputState.drag.currentX;
    const dy = point.y - inputState.drag.currentY;

    inputState.drag.currentX = point.x;
    inputState.drag.currentY = point.y;
    inputState.drag.dx       = dx;
    inputState.drag.dy       = dy;

    // Only queue a move event if movement is significant (reduces noise)
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      inputQueue.push({ type: 'touch_move', x: point.x, y: point.y, dx, dy });
    }
  }
}

function onPointerUp(event) {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;

  const point    = normalizePointer(event);
  const duration = Date.now() - pointer.startTime;
  const dist     = Math.hypot(point.x - pointer.startX, point.y - pointer.startY);

  // Classify as tap if short duration AND small movement
  if (duration < 300 && dist < 15) {
    inputState.lastTap = { x: point.x, y: point.y, time: Date.now() };
    inputQueue.push({ type: 'tap', x: point.x, y: point.y, pointerId: event.pointerId });
  }

  if (interactionMode === 'drag') {
    inputState.drag.active = false;
    inputQueue.push({ type: 'drag_end', x: point.x, y: point.y });
  }

  activePointers.delete(event.pointerId);
  inputState.touches = [...activePointers.values()];
  inputState.drag.dx = 0;
  inputState.drag.dy = 0;
}

function onPointerCancel(event) {
  // Treat as pointer up (e.g. incoming call on tablet)
  onPointerUp(event);
}
```

---

## Step 4 — Coordinate Normalization

Raw pointer event coordinates are in **viewport pixels** and must be corrected for:
- Canvas position offset (if canvas doesn't start at 0,0)
- `devicePixelRatio` scaling (we want CSS pixels, not physical pixels)

```javascript
// engine/input.js

/**
 * Convert a raw PointerEvent into normalized CSS pixel coordinates
 * relative to the canvas element.
 */
function normalizePointer(event) {
  const canvas = document.getElementById('game-canvas');
  const rect   = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    id: event.pointerId,
  };
}
```

> **Why not use `event.offsetX/Y`?** `offsetX` is unreliable on touch events in Safari. Always compute manually from `clientX - rect.left`.

---

## Step 5 — Processing Input in the Ticker

Each frame, the Ticker reads the input queue and dispatches events:

```javascript
// engine/engine.js — inside the Ticker callback

function processInputEvents(engine) {
  // Dispatch each queued event to the game's onEvent handler
  while (inputQueue.length > 0) {
    const event = inputQueue.shift();

    if (event.type === 'touch_move' || event.type === 'drag_start' || event.type === 'drag_end') {
      currentGame?.onEvent?.(engine, event.type, event);
    }

    // 'tap' events are handled by PixiJS's own pointer system on individual sprites
    // (via the onTouch callback registered in engine.spawn)
    // We still emit them globally for games that need world-space tap detection
    if (event.type === 'tap') {
      currentGame?.onEvent?.(engine, 'touch_down', event);
    }
  }
}
```

---

## Step 6 — Touch Target Design Guidelines

For toddler-age users, touch targets must be much larger than standard UI guidelines:

| User Group | Min Touch Target | ToyBox Target |
|-----------|-----------------|---------------|
| General adults (Apple HIG) | 44 × 44 px | — |
| Children 2–4 years | ~80 × 80 px | **96 × 96 px** minimum |
| Children 4–6 years | ~60 × 60 px | **80 × 80 px** minimum |

Implementation in `engine.spawn()`:

```javascript
// If no explicit hitArea is provided, pad sprites for young children
if (!options.hitArea && options.onTouch) {
  const minSize = 96; // Minimum touch area in px
  const width   = entity.width  / (options.scale ?? 1);
  const height  = entity.height / (options.scale ?? 1);

  entity.hitArea = new PIXI.Rectangle(
    -(Math.max(minSize, width)  / 2),
    -(Math.max(minSize, height) / 2),
    Math.max(minSize, width),
    Math.max(minSize, height),
  );
}
```

---

## Step 7 — Drag Mode Usage

For games that need drag interaction (e.g., shape sorting, puzzle sliding):

```javascript
// In a drag-mode game:
config: { interactionMode: 'drag' }

onEvent(engine, eventName, payload) {
  if (eventName === 'drag_start') {
    // Find which entity was touched
    this.dragging = this.findEntityAt(payload.x, payload.y);
  }

  if (eventName === 'touch_move' && this.dragging) {
    this.dragging.x += payload.dx;
    this.dragging.y += payload.dy;
  }

  if (eventName === 'drag_end' && this.dragging) {
    this.checkDropZone(this.dragging, payload.x, payload.y);
    this.dragging = null;
  }
},

// Helper: find entity at world coordinates
findEntityAt(x, y) {
  return this.pieces.find(piece => {
    const dx = piece.x - x;
    const dy = piece.y - y;
    return Math.hypot(dx, dy) < 50;
  });
}
```

---

## Step 8 — Multi-Touch (Future)

The input system stores all active pointers in `inputState.touches`, so multi-touch is structurally supported. Future games could read `engine.input.touches` directly:

```javascript
update(engine, deltaTime) {
  if (engine.input.touches.length >= 2) {
    // Two-finger gesture — e.g. pinch to zoom map
    const [t1, t2] = engine.input.touches;
    const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
    // ... pinch logic
  }
}
```

---

## Checklist

- [ ] Using Pointer Events (not Touch Events) for unified device support
- [ ] Listeners registered with `{ passive: true }` for lower latency
- [ ] Coordinates normalized to CSS pixels relative to canvas bounds
- [ ] Tap classified as `duration < 300ms` AND `movement < 15px`
- [ ] Drag mode registers `pointermove` listener; tap mode does not
- [ ] `pointercancel` handled (treats as pointer up)
- [ ] Hit areas padded to 96px minimum for child-friendly touch targets
- [ ] `inputQueue` cleared each frame in the Ticker
- [ ] `inputState.touches` updated on every pointer event

---

**Previous:** [07 — Game Loader](./07-game-loader.md) | **Next:** [09 — Audio System →](./09-audio-system.md)
