# Game Design: Digital Coloring

**File:** `games/digital_coloring.js`
**Target Age:** 2–5 years
**Interaction Mode:** `drag`
**Estimated Play Time:** 3–8 min

---

## Overview

A digital "reveal" painting experience. The canvas shows a grey silhouette (or white fog layer) over a vibrant pre-coloured illustration. The child drags their finger to erase the fog layer, uncovering the bright image beneath. There is no way to fail — every stroke is a reward. When enough of the image is uncovered (≥ 30% threshold), an auto-complete animation wipes the rest clean and celebrates.

---

## Core Mechanic: Texture Mask Reveal

Rather than painting onto a blank canvas, we use a **WebGL render texture mask**:

1. The **target image** (e.g., a colourful lion) is rendered as a base sprite.
2. A **grey fog sprite** covers it at full opacity.
3. The fog layer has a **WebGL mask** that is a render texture.
4. As the player drags, we draw circles onto the render texture at the drag position, **punching holes** in the fog.
5. The circles grow slightly (`radius *= 1.1`) on each stroke frame to feel generous.

> **PixiJS v8 Implementation Note:** Use `PIXI.RenderTexture.create` for the mask texture. Stamp a white-filled circle `PIXI.Graphics` onto it each frame via `renderer.render({ container, renderTexture, clear: false })`. Apply the texture as `fogSprite.mask = new PIXI.Sprite(maskTexture)`.

---

## Canvas Layout

```
┌──────────────────────────┐
│  🎨  What is hiding?     │  ← title prompt (top 10%)
│                          │
│  ┌────────────────────┐  │
│  │                    │  │  ← fog layer (drag to reveal)
│  │  [hidden image]    │  │
│  │                    │  │
│  └────────────────────┘  │
│                          │
│  [=========>   ]  42%    │  ← progress bar (bottom 10%)
└──────────────────────────┘
```

---

## Scene Images

A set of pre-coloured illustration scenes. Each scene has:
- A **revealed image** (full-colour PNG): `scene_lion`, `scene_elephant`, `scene_rocket`, `scene_fish`, `scene_butterfly`
- No separate silhouette needed — the fog mask is dynamically punched.

Scenes rotate randomly each time the game is started.

---

## Interaction Flow

1. **Player drags finger** across the fog layer.
2. On each `touch_move` event:
   - Record drag position `(x, y)`.
   - Stamp a white-filled circle (radius `brushSize`) onto the mask render texture at `(x, y)`.
   - Increment `pixelsRevealed` counter (approximated by brush area per stamp).
3. **Threshold check:** When `pixelsRevealed / totalFogPixels >= 0.30`:
   - Trigger `auto_complete` event.
4. **Auto-complete animation:**
   - Play `reveal_whoosh` audio.
   - Tween fog alpha from current → 0 over 600 ms.
   - Show sparkle burst FX centred on the image.
   - After 1.5s, display the subject name in large friendly text (e.g., `"Lion! 🦁"`).
   - After 3s, transition to the next scene or show win screen.

---

## Brush Settings

| Property | Default | Notes |
|----------|---------|-------|
| `brushSize` | `engine.width * 0.08` | ~8% of canvas width — generous for little fingers |
| Stamp shape | Soft circle (white fill, alpha blended edges) | Use `PIXI.Graphics` circle with soft blur |

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `scene_lion` | Colourful lion illustration (full canvas size) |
| `scene_elephant` | Colourful elephant illustration |
| `scene_rocket` | Colourful rocket in space illustration |
| `scene_fish` | Colourful tropical fish illustration |
| `scene_butterfly` | Colourful butterfly illustration |
| `fog_texture` | Grey/cloudy overlay (tileable, covers canvas) |
| `particle_sparkle` | Sparkle/star particle for reveal FX |
| `progress_bar_bg` | Progress bar background UI element |
| `progress_bar_fill` | Progress bar fill UI element |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `brush_stroke` | Soft swoosh sound per drag event (throttled to once per 200ms) |
| `reveal_whoosh` | Dramatic wipe sound for auto-complete |
| `animal_sound_lion` | Lion roar — plays after reveal |
| `animal_sound_elephant` | Elephant trumpet |
| `win_jingle` | Celebratory fanfare |

---

## Game State

```javascript
this.currentScene      // string: active scene asset key
this.maskTexture       // PIXI.RenderTexture: the fog punch-hole mask
this.fogSprite         // PIXI.Sprite: the fog overlay
this.brushGraphics     // PIXI.Graphics: reusable brush stamp shape
this.pixelsRevealed    // number: approximate revealed pixel count
this.totalFogPixels    // number: canvas width * height
this.revealPercent     // float: 0..1
this.autoCompleted     // bool: prevent double-trigger
this.sceneQueue        // string[]: shuffled list of scenes
```

---

## Engine API Usage

```javascript
config: {
  background:      '#fef9e7',
  interactionMode: 'drag',
  assets: [
    'scene_lion', 'scene_elephant', 'scene_rocket',
    'scene_fish', 'scene_butterfly',
    'fog_texture', 'particle_sparkle',
    'progress_bar_bg', 'progress_bar_fill',
  ],
  audio: ['brush_stroke', 'reveal_whoosh', 'win_jingle'],
},

init(engine) { /* setup mask render texture, fog sprite, progress bar */ },

update(engine, deltaTime) {
  // Update progress bar fill width based on revealPercent
  // Throttle brush sound
},

onEvent(engine, eventName, payload) {
  if (eventName === 'touch_move') { /* stamp brush at x,y */ }
  if (eventName === 'auto_complete') { /* fade fog, sparkles, label */ }
},
```

---

## Preview Animation

- Show a partially-fogged image (lion, ~30% pre-revealed).
- Animate a dragging "finger" cursor sweeping across.
- Each frame increases the reveal area.
- After 2.5s the fog fades entirely and loops.

---

## Toddler-Specific Design Notes

- **Brush is HUGE** — 8% of canvas width; no pixel-perfect dragging required.
- **30% threshold** — very achievable even for a short swipe.
- **Auto-complete** — the game finishes itself so the child is never frustrated.
- **Bright, saturated illustrations** — the revealed image must be immediately recognisable.
- **No timer, no score** — pure exploratory play; each swipe has a tangible visual reward.
- **Audio rewards match the reveal** — the specific animal sound plays for that scene.

---

**Previous:** [01 — Bubble Pop](./01-bubble-pop.md) | **Next:** [03 — Peek-a-Boo →](./03-peek-a-boo.md)
