# 14 — On-Screen Controller

The On-Screen Controller provides a virtual **D-pad** (directional pad) and **A/B action buttons** rendered as an HTML overlay on top of the game canvas. It is designed for games that require directional movement or multi-button input rather than simple tap interactions.

Games opt in to the controller by declaring `controller: true` in their config. The controller is also gated by the global `controllerEnabled` setting in the Settings panel.

---

## Layout & Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Game Canvas Content]                                      │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│    ┌──────┐                            ┌───┐  ┌───┐        │
│    │  ▲   │                            │ B │  │ A │        │
│    ├──┼───┤                            └───┘  └───┘        │
│    │←─┼─→│              [exit btn]                         │
│    ├──┼───┤                                                 │
│    │  ▼   │                                                 │
│    └──────┘                                                 │
│   D-PAD                               ACTION BUTTONS        │
└─────────────────────────────────────────────────────────────┘
```

- **D-pad** — Lower left corner, detects 8 directions (UDLR + diagonals)
- **A button** — Lower right, primary action (jump, confirm, shoot)
- **B button** — Lower right, secondary action (back, cancel, special)
- **Transparency** — Controller is semi-transparent (60% opacity) so game content shows through
- **Touch area** — Each control has a larger invisible hit area than its visual

---

## Architecture

```
On-Screen Controller
├── HTML overlay  (#controller-overlay)
│   ├── #dpad                ← D-pad ring
│   │   ├── #dpad-up
│   │   ├── #dpad-down
│   │   ├── #dpad-left
│   │   └── #dpad-right
│   └── #action-buttons
│       ├── #btn-a           ← A button (primary)
│       └── #btn-b           ← B button (secondary)
│
├── engine/controller.js
│   ├── showController()
│   ├── hideController()
│   ├── getControllerState()  → { dpad, buttons }
│   └── onControllerChange(callback)
│
└── engine/engine.js
    └── engine.input.controller  → live read of controller state
```

---

## Step 1 — Controller State Model

```javascript
// engine/controller.js

/**
 * Controller state — updated in real-time by pointer events on the overlay.
 * Games read this via engine.input.controller each frame.
 */
export const controllerState = {
  dpad: {
    up:        false,
    down:      false,
    left:      false,
    right:     false,
    // Computed diagonals
    upLeft:    false,
    upRight:   false,
    downLeft:  false,
    downRight: false,
  },
  buttons: {
    a:      false,  // Primary action
    b:      false,  // Secondary action
    start:  false,  // Start (optional, future)
    select: false,  // Select (optional, future)
  },
};

// Convenience: was the button JUST pressed this frame?
// (true for exactly one frame, then clears)
export const controllerPressed = {
  dpad:    { up: false, down: false, left: false, right: false },
  buttons: { a: false, b: false },
};

// Change listeners
const changeListeners = new Set();

export function onControllerChange(callback) {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function notifyListeners() {
  for (const cb of changeListeners) cb(controllerState);
}
```

---

## Step 2 — HTML Overlay

The controller overlay is always present in the DOM but hidden when not in use:

```html
<!-- index.html — add inside <body> -->

<!-- On-Screen Controller Overlay -->
<div id="controller-overlay" class="hidden" aria-hidden="true">

  <!-- D-Pad -->
  <div id="dpad" role="group" aria-label="Directional pad">
    <button id="dpad-up"    class="dpad-btn dpad-up"    data-direction="up"    aria-label="Up"></button>
    <button id="dpad-right" class="dpad-btn dpad-right" data-direction="right" aria-label="Right"></button>
    <button id="dpad-down"  class="dpad-btn dpad-down"  data-direction="down"  aria-label="Down"></button>
    <button id="dpad-left"  class="dpad-btn dpad-left"  data-direction="left"  aria-label="Left"></button>
    <div class="dpad-center" aria-hidden="true"></div>
  </div>

  <!-- Action Buttons -->
  <div id="action-buttons" role="group" aria-label="Action buttons">
    <button id="btn-b" class="action-btn action-btn--b" data-button="b" aria-label="B button">B</button>
    <button id="btn-a" class="action-btn action-btn--a" data-button="a" aria-label="A button">A</button>
  </div>

</div>
```

---

## Step 3 — CSS

```css
/* =============================================
   On-Screen Controller Overlay
   ============================================= */

#controller-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;          /* Below system overlay (9999) but above canvas */
  pointer-events: none;   /* Transparent to touches by default */
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
}

#controller-overlay.hidden {
  display: none;
}

#controller-overlay.visible {
  pointer-events: auto;  /* Activate touch events when controller is shown */
}

/* ── D-Pad ─────────────────────────────────────────────────────────────── */
#dpad {
  position: relative;
  width: 160px;
  height: 160px;
  flex-shrink: 0;
}

.dpad-btn {
  position: absolute;
  background: rgba(255,255,255,0.12);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.08s ease, transform 0.08s ease;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

/* D-pad cross shape — each arm is 48×52px */
.dpad-up {
  width: 52px; height: 52px;
  top: 0; left: 54px;
  border-radius: 8px 8px 4px 4px;
}
.dpad-down {
  width: 52px; height: 52px;
  bottom: 0; left: 54px;
  border-radius: 4px 4px 8px 8px;
}
.dpad-left {
  width: 52px; height: 52px;
  top: 54px; left: 0;
  border-radius: 8px 4px 4px 8px;
}
.dpad-right {
  width: 52px; height: 52px;
  top: 54px; right: 0;
  border-radius: 4px 8px 8px 4px;
}

.dpad-center {
  position: absolute;
  width: 52px; height: 52px;
  top: 54px; left: 54px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
}

/* D-pad arrow icons (pure CSS) */
.dpad-up::after    { content: '▲'; }
.dpad-down::after  { content: '▼'; }
.dpad-left::after  { content: '◀'; }
.dpad-right::after { content: '▶'; }

.dpad-btn::after {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: rgba(255,255,255,0.7);
}

/* Active/pressed state */
.dpad-btn.pressed,
.dpad-btn:active {
  background: rgba(255,255,255,0.28);
  transform: scale(0.92);
  border-color: rgba(255,255,255,0.5);
}

/* ── Action Buttons ─────────────────────────────────────────────────────── */
#action-buttons {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
}

.action-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.3);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 900;
  color: rgba(255,255,255,0.9);
  cursor: pointer;
  touch-action: none;
  transition: transform 0.08s ease, background 0.08s ease;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}

/* A button — coral/pink (primary action) */
.action-btn--a {
  background: rgba(233, 69, 96, 0.5);
  border-color: rgba(233, 69, 96, 0.8);
  box-shadow: 0 4px 20px rgba(233,69,96,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}

/* B button — amber (secondary action) */
.action-btn--b {
  background: rgba(245, 166, 35, 0.5);
  border-color: rgba(245, 166, 35, 0.8);
  box-shadow: 0 4px 20px rgba(245,166,35,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
}

.action-btn.pressed,
.action-btn:active {
  transform: scale(0.88) translateY(2px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}

/* ── Global controller opacity ──────────────────────────────────────────── */
#controller-overlay .dpad-btn,
#controller-overlay .action-btn {
  opacity: 0.65;
}

/* Increase opacity when actively pressed */
#controller-overlay .dpad-btn.pressed,
#controller-overlay .action-btn.pressed {
  opacity: 1;
}
```

---

## Step 4 — Controller Input Handler (`engine/controller.js`)

```javascript
// engine/controller.js

import { controllerState, controllerPressed, notifyListeners } from './controllerState.js';
import { getSetting } from './settings.js';

let overlayEl = null;
let isVisible = false;

// Track active pointer IDs per button
const activePointers = new Map(); // pointerId → buttonId

/**
 * Show the on-screen controller overlay.
 * Called by the host when a controller-enabled game boots.
 */
export function showController() {
  overlayEl = document.getElementById('controller-overlay');
  if (!overlayEl) return;

  overlayEl.classList.remove('hidden');
  overlayEl.classList.add('visible');
  isVisible = true;

  attachControllerEvents();
}

/**
 * Hide the controller overlay.
 * Called on game exit or when game doesn't require a controller.
 */
export function hideController() {
  if (!overlayEl) return;
  overlayEl.classList.remove('visible');
  overlayEl.classList.add('hidden');
  isVisible = false;

  // Reset all state
  resetControllerState();
  detachControllerEvents();
}

function resetControllerState() {
  Object.keys(controllerState.dpad).forEach(k => controllerState.dpad[k] = false);
  Object.keys(controllerState.buttons).forEach(k => controllerState.buttons[k] = false);
  activePointers.clear();
}

// ── Event Attachment ──────────────────────────────────────────────────────────

const handlePointerDown = (e) => {
  e.preventDefault();
  const target = e.target.closest('[data-direction], [data-button]');
  if (!target) return;

  const direction = target.dataset.direction;
  const button    = target.dataset.button;

  target.classList.add('pressed');
  activePointers.set(e.pointerId, target.id);

  if (direction) {
    setDpad(direction, true);
    // Vibrate on D-pad press if setting enabled
    if (getSetting('vibrationEnabled') && navigator.vibrate) {
      navigator.vibrate(10); // 10ms — very subtle
    }
  }
  if (button) {
    setButton(button, true);
    if (getSetting('vibrationEnabled') && navigator.vibrate) {
      navigator.vibrate(15);
    }
  }
};

const handlePointerUp = (e) => {
  const targetId = activePointers.get(e.pointerId);
  if (!targetId) return;

  const target = document.getElementById(targetId);
  target?.classList.remove('pressed');

  const direction = target?.dataset.direction;
  const button    = target?.dataset.button;

  if (direction) setDpad(direction, false);
  if (button)    setButton(button, false);

  activePointers.delete(e.pointerId);
};

const handlePointerCancel = (e) => handlePointerUp(e);

function attachControllerEvents() {
  overlayEl.addEventListener('pointerdown',  handlePointerDown,  { passive: false });
  overlayEl.addEventListener('pointerup',    handlePointerUp,    { passive: true });
  overlayEl.addEventListener('pointercancel',handlePointerCancel,{ passive: true });
}

function detachControllerEvents() {
  overlayEl?.removeEventListener('pointerdown',  handlePointerDown);
  overlayEl?.removeEventListener('pointerup',    handlePointerUp);
  overlayEl?.removeEventListener('pointercancel',handlePointerCancel);
}

// ── State Setters ─────────────────────────────────────────────────────────────

function setDpad(direction, active) {
  if (!(direction in controllerState.dpad)) return;

  const wasActive = controllerState.dpad[direction];
  controllerState.dpad[direction] = active;

  // Update diagonal states
  controllerState.dpad.upLeft    = controllerState.dpad.up   && controllerState.dpad.left;
  controllerState.dpad.upRight   = controllerState.dpad.up   && controllerState.dpad.right;
  controllerState.dpad.downLeft  = controllerState.dpad.down && controllerState.dpad.left;
  controllerState.dpad.downRight = controllerState.dpad.down && controllerState.dpad.right;

  // Mark as "just pressed" for one frame
  if (active && !wasActive) {
    controllerPressed.dpad[direction] = true;
  }

  notifyListeners();
}

function setButton(button, active) {
  if (!(button in controllerState.buttons)) return;

  const wasActive = controllerState.buttons[button];
  controllerState.buttons[button] = active;

  if (active && !wasActive) {
    controllerPressed.buttons[button] = true;
  }

  notifyListeners();
}

/**
 * Called each frame by the Ticker to clear "just pressed" state.
 * Must be called AFTER game.update() reads the state.
 */
export function clearPressedState() {
  Object.keys(controllerPressed.dpad).forEach(k => controllerPressed.dpad[k] = false);
  Object.keys(controllerPressed.buttons).forEach(k => controllerPressed.buttons[k] = false);
}
```

---

## Step 5 — Integration with the Engine Bridge

The controller state is added to the `engine.input` object, available to every game module:

```javascript
// engine/engine.js — updated buildEngineObject()

import { controllerState, controllerPressed } from './controller.js';

function buildEngineObject() {
  return {
    width:  /* ... */,
    height: /* ... */,

    spawn:   spawnEntity,
    destroy: destroyEntity,
    animate: animateEntity,
    emit:    emitEvent,
    audio:   audioSystem,

    input: {
      // Existing touch state
      touches: [...inputState.touches],
      lastTap: inputState.lastTap,

      // NEW: Controller state (always present; all false if no controller)
      controller: {
        dpad: { ...controllerState.dpad },
        buttons: { ...controllerState.buttons },
        // "just pressed" — true for exactly ONE frame
        pressed: {
          dpad:    { ...controllerPressed.dpad },
          buttons: { ...controllerPressed.buttons },
        },
      },
    },

    system: { /* ... */ },
  };
}
```

### Reading Controller Input in a Game

```javascript
update(engine, deltaTime) {
  const ctrl = engine.input.controller;

  // Continuous movement while held
  if (ctrl.dpad.right) this.player.x += 200 * deltaTime;
  if (ctrl.dpad.left)  this.player.x -= 200 * deltaTime;
  if (ctrl.dpad.up)    this.player.y -= 200 * deltaTime;
  if (ctrl.dpad.down)  this.player.y += 200 * deltaTime;

  // Diagonal movement (45°)
  if (ctrl.dpad.upRight) {
    this.player.x += 140 * deltaTime;
    this.player.y -= 140 * deltaTime;
  }

  // Action on BUTTON PRESS (one frame only — not held)
  if (ctrl.pressed.buttons.a) {
    this.player.jump();
    engine.audio.play('jump_sound');
  }

  // Action while HOLDING button B
  if (ctrl.buttons.b) {
    this.player.shield.alpha = 1; // Show shield while held
  } else {
    this.player.shield.alpha = 0;
  }
},
```

---

## Step 6 — Game Config Declaration

Games declare controller support in their `config`:

```javascript
export default {
  config: {
    background:      '#1a1a2e',
    interactionMode: 'controller',  // Tells input system to activate controller mode
    controller: {
      enabled:  true,              // Show on-screen controller
      dpad:     true,              // Show D-pad
      buttons: {
        a: { label: 'A', color: '#e94560' },   // Customise button appearance
        b: { label: 'B', color: '#f5a623' },
      },
    },
    assets: ['player_sprite', 'enemy_sprite'],
    audio:  ['jump', 'hit', 'win_jingle'],
  },

  // ...
};
```

### `controller` Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `controller.enabled` | boolean | `false` | Show the on-screen controller |
| `controller.dpad` | boolean | `true` | Show D-pad |
| `controller.buttons.a` | object | `{ label: 'A' }` | A button config |
| `controller.buttons.b` | object | `{ label: 'B' }` | B button config |

The `interactionMode: 'controller'` value also disables the default tap routing on the canvas, so taps on game sprites are not intercepted while the controller is active.

---

## Step 7 — Controller Lifecycle in the Loader

```javascript
// engine/loader.js — updated loadGame()

import { showController, hideController } from './controller.js';

export async function loadGame(gameEntry, options = {}) {
  const gameModule = await resolveAndEvaluate(gameEntry);
  const config     = gameModule.config ?? {};

  // ... asset preloading, runtime init ...

  // Show/hide controller based on game config AND user setting
  const wantsController = config.controller?.enabled === true;
  const settingAllows   = getSetting('controllerEnabled');

  if (wantsController && settingAllows) {
    showController(config.controller);
  } else {
    hideController();
  }

  // ... init game, start loop ...
}

export function exitGame() {
  hideController();  // Always hide on exit
  stopGameLoop();
  // ...
}
```

---

## Step 8 — System Overlay Adjustment

When the controller is active, the exit button position shifts to avoid overlapping the A/B buttons. The exit button moves to the top-center:

```css
/* When controller is visible, reposition exit button */
#controller-overlay.visible ~ #system-overlay {
  top: var(--space-sm);
  right: 50%;
  transform: translateX(50%);
}
```

Or apply via JS by adding a CSS class to the system overlay:

```javascript
// In showController():
document.getElementById('system-overlay').classList.add('controller-mode');

// In hideController():
document.getElementById('system-overlay').classList.remove('controller-mode');
```

---

## Step 9 — Gamepad API Passthrough (Optional)

For devices with physical Bluetooth gamepads, the Web Gamepad API can map to the same `controllerState` object, providing seamless compatibility:

```javascript
// engine/controller.js — physical gamepad support

let gamepadPollInterval = null;

export function startGamepadPolling() {
  gamepadPollInterval = setInterval(() => {
    const gamepads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(gamepads).find(g => g?.connected);
    if (!gp) return;

    // Standard gamepad mapping (axes 0–1 = left stick, buttons 0–3 = ABXY)
    const deadzone = 0.3;

    // Left stick / D-pad
    const dx = gp.axes[0] ?? 0;
    const dy = gp.axes[1] ?? 0;
    setDpad('left',  dx < -deadzone || gp.buttons[14]?.pressed);
    setDpad('right', dx >  deadzone || gp.buttons[15]?.pressed);
    setDpad('up',    dy < -deadzone || gp.buttons[12]?.pressed);
    setDpad('down',  dy >  deadzone || gp.buttons[13]?.pressed);

    // Action buttons (A = button 0, B = button 1 in standard mapping)
    setButton('a', gp.buttons[0]?.pressed);
    setButton('b', gp.buttons[1]?.pressed);
  }, 16); // Poll at ~60fps
}

export function stopGamepadPolling() {
  clearInterval(gamepadPollInterval);
}
```

---

## Checklist

- [ ] `#controller-overlay` HTML present in `index.html` with D-pad and A/B buttons
- [ ] `engine/controller.js` created with `showController`, `hideController`, `clearPressedState`
- [ ] D-pad detects all 4 directions and 4 diagonals
- [ ] `controllerPressed.*` flags are true for exactly one frame then cleared
- [ ] Pointer events use `{ passive: false }` on `pointerdown` to allow `preventDefault`
- [ ] `engine.input.controller` included in `buildEngineObject()`
- [ ] `interactionMode: 'controller'` in game config disables canvas tap routing
- [ ] Controller shows/hides based on BOTH game config AND `controllerEnabled` setting
- [ ] Exit button repositions to top-center when controller is visible
- [ ] Haptic feedback fires on button press when `vibrationEnabled` setting is on
- [ ] `showController()` / `hideController()` called in `loader.js` game boot/exit
- [ ] `stopAllPreviewers()` stops any active game previews before controller games launch
- [ ] Optional: Gamepad API polling connects physical Bluetooth controllers

---

**Previous:** [13 — Game Preview System](./13-game-preview-system.md) | **Back to:** [00 — Overview](./00-overview.md)
