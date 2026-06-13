# Game Design: Shape Sorter

**File:** `games/shape_sorter.js`
**Target Age:** 2–5 years
**Interaction Mode:** `drag`
**Estimated Play Time:** 3–8 min

---

## Overview

A classic shape-sorting puzzle. Coloured shape pieces appear in a tray at the bottom of the screen. The top area shows silhouette "holes" (shadow outlines) where each shape belongs. The child drags a shape toward its matching silhouette. As the shape gets close, a glow highlight activates and the shape auto-snaps into place with a satisfying animation and sound.

---

## Core Mechanic: Drag + Magnetic Snap

### Drag Phase
1. On `touch_down` over a shape piece: the piece "lifts" (scale `1.0 → 1.1`, slight shadow).
2. On `touch_move`: the piece follows the finger exactly (`piece.x = touch.x`, `piece.y = touch.y`).
3. On `touch_up`: evaluate snap or return to tray.

### Magnetic Snap Detection
On each `touch_move` (and `touch_up`), check each silhouette slot:
```javascript
const snapRadius = slotSize * 0.7;  // generous snap radius
for (const slot of this.slots) {
  if (slot.filled) continue;
  const dx = piece.x - slot.x;
  const dy = piece.y - slot.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist < snapRadius && piece.shapeId === slot.shapeId) {
    // In snap zone — activate glow highlight
    slot.glow.visible = true;
    if (isMouseUp) this._snapPiece(piece, slot, engine);
  } else {
    slot.glow.visible = false;
  }
}
```

### Snap Animation (`_snapPiece`)
1. Tween piece position from current → `(slot.x, slot.y)` over 200ms (ease-out).
2. Tween piece scale: `1.1 → 1.2 → 1.0` (bounce).
3. Set `piece.draggable = false`, `slot.filled = true`.
4. Play `snap_success` audio.
5. Run sparkle burst FX at slot position.
6. Check win condition.

### Wrong Shape Handling
If `touch_up` and the piece is near a slot but **wrong shape**:
1. Play `snap_fail` sound (soft, non-discouraging).
2. Tween piece back to its tray position over 300ms.
3. Show a gentle "wiggle" FX on the wrong slot (slot shakes horizontally).

If `touch_up` and **not near any slot**:
1. Tween piece back to tray position.
2. No audio (silent return).

---

## Canvas Layout

```
┌──────────────────────────┐
│  ⭐ Shapes: 2/4          │  ← progress bar (top 8%)
│                          │
│  ┌──┐   ┌──┐   ┌──┐     │
│  │○  │   │△  │   │□  │     │  ← silhouette slots (top 55%)
│  │   │   │   │   │   │     │
│  └──┘   └──┘   └──┘     │
│                          │
│ ═══════════════════════  │  ← separator / tray border
│                          │
│   [■]   [●]   [▲]  [♦]  │  ← shape pieces tray (bottom 35%)
└──────────────────────────┘
```

---

## Shape Set (One Round = 4 Shapes)

Full shape library (8 shapes):

| Shape ID | Asset Key | Colour |
|----------|-----------|--------|
| `circle` | `piece_circle`, `slot_circle` | `#2196F3` Blue |
| `square` | `piece_square`, `slot_square` | `#F44336` Red |
| `triangle` | `piece_triangle`, `slot_triangle` | `#4CAF50` Green |
| `star` | `piece_star`, `slot_star` | `#FFC107` Amber |
| `heart` | `piece_heart`, `slot_heart` | `#E91E63` Pink |
| `diamond` | `piece_diamond`, `slot_diamond` | `#9C27B0` Purple |
| `oval` | `piece_oval`, `slot_oval` | `#FF9800` Orange |
| `cross` | `piece_cross`, `slot_cross` | `#009688` Teal |

Each round randomly selects 4 from the full library. After 3 rounds the game shows a win screen.

### Slot vs Piece Visual
- **Slot** (silhouette): dark grey/navy outline of the shape, no fill — visually reads as a "hole."
- **Piece**: full-colour filled shape with a subtle drop shadow when dragging.

---

## Snapping Glow Effect

When a piece is inside `snapRadius` of the matching slot:
```javascript
// Glow sprite is a soft-edge white circle sprite behind the slot
slot.glow.visible = true;
slot.glow.alpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;  // pulsing glow
```

Glow asset: `slot_glow` — a radial gradient white circle (256×256px, soft feathered edge).

---

## Auto-Snap vs Manual Drop

| Condition | Behaviour |
|-----------|-----------|
| Correct shape, within `snapRadius`, on `touch_up` | Snap into slot |
| Correct shape, within `snapRadius * 0.5`, on `touch_move` | **Auto-snap immediately** (even without releasing) |
| Wrong shape, within `snapRadius` | Glow does NOT activate; piece returns on release |
| No slot within `snapRadius` | Piece returns to tray |

The `0.5×` auto-snap on drag prevents situations where a toddler drags close but can't quite release in the right spot.

---

## Level Progression

| Round | Shapes | Layout |
|-------|--------|--------|
| 1 | 3 shapes | 3-column slots |
| 2 | 4 shapes | 4-column slots |
| 3 | 4 shapes (different set) | 4-column slots |
| Win | — | Win screen + celebration |

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `piece_circle` | Filled blue circle (200×200px) |
| `piece_square` | Filled red square |
| `piece_triangle` | Filled green triangle |
| `piece_star` | Filled amber star |
| `piece_heart` | Filled pink heart |
| `piece_diamond` | Filled purple diamond |
| `piece_oval` | Filled orange oval |
| `piece_cross` | Filled teal cross |
| `slot_circle` | Dark outline circle slot |
| `slot_square` | Dark outline square slot |
| `slot_triangle` | Dark outline triangle slot |
| `slot_star` | Dark outline star slot |
| `slot_heart` | Dark outline heart slot |
| `slot_diamond` | Dark outline diamond slot |
| `slot_oval` | Dark outline oval slot |
| `slot_cross` | Dark outline cross slot |
| `slot_glow` | Soft radial glow highlight |
| `tray_bg` | Tray panel background |
| `particle_sparkle` | Sparkle particle for snap FX |

> **Implementation Note:** Slots and pieces can be drawn in `PIXI.Graphics` rather than loaded textures. This eliminates all texture loading for this game — pieces are drawn as filled shapes and slots as stroked outlines. This is the **preferred** approach as it gives crisp resolution-independent rendering at any canvas size.

### Audio
| Audio Key | Description |
|-----------|-------------|
| `snap_success` | Satisfying click/thunk when shape snaps |
| `snap_fail` | Soft "bwop" for wrong shape |
| `piece_pickup` | Light tap/pop when shape is lifted |
| `win_jingle` | Game complete fanfare |
| `round_complete` | Short ding for completing one round |

---

## Game State

```javascript
this.pieces        // Array<{entity, shapeId, homeX, homeY, draggable}>
this.slots         // Array<{entity, shapeId, x, y, filled, glow}>
this.dragging      // {piece, offsetX, offsetY} | null: currently dragged piece
this.piecesPlaced  // int: snap count this round
this.totalPieces   // int: pieces in current round (3 or 4)
this.round         // int: 1–3
this.sessionScore  // int: total pieces placed across all rounds
```

---

## Engine API Usage

```javascript
config: {
  background:      '#e8f5e9',   // Soft mint green background
  interactionMode: 'drag',
  assets: [],                   // Graphics-based — no texture assets required
  audio: ['snap_success', 'snap_fail', 'piece_pickup', 'win_jingle', 'round_complete'],
},

init(engine) {
  // Draw slots and pieces using PIXI.Graphics
  // Set up drag state tracking
},

update(engine, deltaTime) {
  // Animate slot glow pulsing
  // No physics-based logic needed
},

onEvent(engine, eventName, payload) {
  if (eventName === 'touch_down')  { this._startDrag(payload, engine); }
  if (eventName === 'touch_move')  { this._continueDrag(payload, engine); }
  if (eventName === 'touch_up')    { this._endDrag(payload, engine); }
},
```

---

## Preview Animation

- 3 shape slots visible at top.
- Piece animates up from tray toward the matching circle slot.
- Glow activates as it approaches.
- Snap FX plays (sparkles + scale bounce).
- Piece appears in next tray slot and loops every 3.5s.

---

## Toddler-Specific Design Notes

- **Snap radius is very generous** (`70% of slot size`) — approximate placement is sufficient.
- **Auto-snap at 50% radius on drag** — piece flies into place even before the child lifts their finger.
- **Glow preview** — the visual feedback clearly signals "you're in the right place."
- **Wrong shape = silent return** — no alarming sound or failure state; the piece quietly returns.
- **3 shapes in round 1** — deliberately easy so the child succeeds on their first attempt.
- **Colour matching reinforces shape** — the piece and its slot share the same colour, providing a secondary visual cue beyond shape outline alone.

---

**Previous:** [06 — Sound Board](./06-sound-board.md) | **Next:** [08 — Flashlight →](./08-flashlight.md)
