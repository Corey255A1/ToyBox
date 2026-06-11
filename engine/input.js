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

let canvas         = null;
let interactionMode = 'tap';

const activePointers = new Map(); // pointerId → touch data

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
  if (!canvas) return;

  if (mode === 'none') return; // No input needed

  canvas.addEventListener('pointerdown',  onPointerDown,  { passive: true });
  canvas.addEventListener('pointerup',    onPointerUp,    { passive: true });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: true });

  if (mode === 'drag') {
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  }
}

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
  onPointerUp(event);
}

/**
 * Convert a raw PointerEvent into normalized CSS pixel coordinates
 * relative to the canvas element.
 */
function normalizePointer(event) {
  const c = canvas || document.getElementById('game-canvas');
  if (!c) return { x: event.clientX, y: event.clientY, id: event.pointerId };
  const rect = c.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    id: event.pointerId,
  };
}
