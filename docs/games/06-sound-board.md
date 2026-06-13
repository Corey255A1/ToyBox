# Game Design: Sound Board

**File:** `games/sound_board.js`
**Target Age:** 1–4 years
**Interaction Mode:** `tap`
**Estimated Play Time:** open-ended (no win state)

---

## Overview

A full-screen interactive sound board with large, bold shape tiles. Each tile occupies a generous portion of the screen and plays a distinct, pleasant sound when tapped. The shapes visually animate (scale up, colour pulse) on touch to reinforce the audio-visual connection. Designed as a free-play, open-ended toy — there is no win condition or timer. The child can tap forever.

---

## Core Mechanic: Tap → Sound + Animation

1. The canvas is divided into a **2×3 grid** of large tiles (2 columns, 3 rows).
2. Each tile is a coloured shape (circle, square, triangle, star, heart, diamond) with a distinct primary colour.
3. On tap:
   - The tile scales from `1.0 → 1.25` and back to `1.0` over 300ms (spring-like bounce).
   - The tile's colour briefly brightens (tweens to a lighter tint).
   - The associated audio plays immediately.
4. Multiple tiles can animate simultaneously (no locking mechanism).

---

## Canvas Layout

```
┌──────────────────────────┐
│   🎵  Sound Board        │  ← title (top 6%)
├────────────┬─────────────┤
│            │             │
│   🔵       │    🟥       │  ← Row 1: Circle, Square
│   Circle   │   Square    │
│   [boing]  │  [drumbeat] │
├────────────┼─────────────┤
│            │             │
│   🔺       │    ⭐        │  ← Row 2: Triangle, Star
│  Triangle  │    Star     │
│  [chime]   │  [ding]     │
├────────────┼─────────────┤
│            │             │
│   ❤️       │    💎       │  ← Row 3: Heart, Diamond
│   Heart    │  Diamond    │
│  [moo]     │   [quack]   │
└────────────┴─────────────┘
```

---

## Tile Definitions

| Tile ID | Shape | Colour | Sound Key | Label |
|---------|-------|--------|-----------|-------|
| `tile_circle` | Circle | `#2196F3` (Blue) | `sound_boing` | `"Circle"` |
| `tile_square` | Square | `#F44336` (Red) | `sound_drum` | `"Square"` |
| `tile_triangle` | Triangle | `#4CAF50` (Green) | `sound_chime` | `"Triangle"` |
| `tile_star` | Star (5-point) | `#FFC107` (Amber) | `sound_ding` | `"Star"` |
| `tile_heart` | Heart | `#E91E63` (Pink) | `sound_moo` | `"Heart"` |
| `tile_diamond` | Diamond | `#9C27B0` (Purple) | `sound_quack` | `"Diamond"` |

Colours intentionally use primary/bold palette — no pastels. High contrast ensures easy visibility.

---

## Tile Visual Structure (per tile)

Each tile is composed of:
1. **Background panel** — `PIXI.Graphics` rounded rectangle filling the tile cell (`cellW × cellH`).
2. **Shape sprite** — centred shape asset, `height = cellH * 0.55`.
3. **Label text** — shape name, centred below the shape, `fontSize = cellH * 0.12`.

Tile cells are calculated:
```javascript
const COLS = 2, ROWS = 3;
const PADDING = engine.width * 0.025;
const titleH = engine.height * 0.08;
const cellW = (engine.width  - PADDING * (COLS + 1)) / COLS;
const cellH = (engine.height - titleH - PADDING * (ROWS + 1)) / ROWS;
```

---

## Tap Animation

```javascript
// On tile tap:
function animateTile(tile) {
  // Scale bounce
  engine.animate(tile.bg, { scaleX: 1.15, scaleY: 1.15 }, 150)
    .then(() => engine.animate(tile.bg, { scaleX: 1.0, scaleY: 1.0 }, 150));

  // Brightness tint (tween tint value)
  tile.bg.tint = 0xFFFFFF;  // flash to white briefly
  setTimeout(() => { tile.bg.tint = tile.baseColor; }, 200);

  // Shape scale pop
  engine.fx.pop(tile.shape);

  // Audio
  engine.audio.play(tile.soundKey);
}
```

---

## Sound Assignments (Toddler-Appropriate)

The sounds are chosen to be pleasant, non-startling, and educational:

| Sound Key | Description | Why This Sound |
|-----------|-------------|----------------|
| `sound_boing` | Low spring boing | Playful, non-jarring |
| `sound_drum` | Single bass drum hit | Satisfying, physical |
| `sound_chime` | High wind chime | Musical, bright |
| `sound_ding` | Bell ding | Clear, short, positive |
| `sound_moo` | Cow moo | Animal connection, familiar |
| `sound_quack` | Duck quack | Animal connection, fun |

Future settings option: swap to musical notes (C, D, E, F, G, A) so the board becomes a simple xylophone.

---

## Settings Integration

The Sound Board should read from the ToyBox settings system:
- `soundboard.theme`: `'shapes'` (default) | `'animals'` | `'music_notes'`
  - Changes what sprites are shown and what sounds play.
- `soundboard.labels`: `true` | `false` — show/hide text labels beneath shapes.

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `shape_circle` | Blue circle shape (256×256px) |
| `shape_square` | Red square shape |
| `shape_triangle` | Green triangle shape |
| `shape_star` | Amber 5-point star |
| `shape_heart` | Pink heart |
| `shape_diamond` | Purple diamond |

> **Note:** Shapes can alternatively be rendered entirely in `PIXI.Graphics` (programmatic drawing) to avoid texture loading overhead. This is the **preferred** implementation since shapes are geometric and resolution-independent.

### Audio
| Audio Key | Description |
|-----------|-------------|
| `sound_boing` | Spring boing |
| `sound_drum` | Bass drum hit |
| `sound_chime` | Wind chime |
| `sound_ding` | Bell ding |
| `sound_moo` | Cow moo |
| `sound_quack` | Duck quack |

---

## Game State

```javascript
this.tiles         // Array<{id, bg, shape, label, soundKey, baseColor}>
this.animatingIds  // Set<string>: tiles currently mid-animation (allow overlap)
```

---

## Engine API Usage

```javascript
config: {
  background:      '#1a1a2e',
  interactionMode: 'tap',
  assets: [],  // If using PIXI.Graphics for shapes, no assets needed
  audio: ['sound_boing', 'sound_drum', 'sound_chime', 'sound_ding', 'sound_moo', 'sound_quack'],
},

init(engine) {
  // Draw tiles as PIXI.Graphics objects
  // Register onTouch for each tile
},

update(engine, deltaTime) {
  // No continuous update logic needed — event-driven only
},

onEvent(engine, eventName, payload) {
  if (eventName === 'touch_down') {
    // Hit-test all tile regions, trigger animateTile if inside
  }
},
```

---

## Preview Animation

- All 6 tiles are visible.
- Each tile animates in sequence (0.4s apart): scale up → down, colour flash.
- The sequence loops continuously (no audio in preview).

```javascript
preview(miniEngine) {
  this.t = 0;
  this.tiles = buildTiles(miniEngine);
},
previewUpdate(miniEngine, dt) {
  this.t += dt;
  const idx = Math.floor(this.t / 0.5) % 6;
  miniEngine.fx.pop(this.tiles[idx].shape);
  // Reset t prevents stacking
},
```

---

## Toddler-Specific Design Notes

- **Each tile is half the screen** (2-column layout) — extremely easy to hit.
- **Sound is immediate** — no delay between tap and audio (audio starts `<16ms`).
- **No win state / no timer** — open-ended; the child controls the experience.
- **Multi-touch safe** — all tiles can animate independently; rapid tapping is encouraged.
- **Bright primary colours** — maximum visual contrast and stimulation without being harsh.
- **Shape names spoken** — the label `"Circle"` is displayed; optionally use TTS to speak the word.
- **Volume is modest** — sounds are tuned to a comfortable level; no sudden loud effects.

---

**Previous:** [05 — Ball Launch](./05-ball-launch.md) | **Next:** [07 — Shape Sorter →](./07-shape-sorter.md)
