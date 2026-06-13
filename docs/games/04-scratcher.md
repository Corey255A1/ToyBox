# Game Design: Scratcher

**File:** `games/scratcher.js`
**Target Age:** 2–5 years
**Interaction Mode:** `drag`
**Estimated Play Time:** 3–6 min

---

## Overview

The screen is covered by a shiny "scratch" surface (like a scratchcard). The child swipes their finger to scratch away the surface, revealing a hidden colourful animal or object beneath. Once 30% of the surface is scratched away, an automatic "camera flash" wipe animation clears the rest and celebrates the reveal. The game then advances to the next hidden image.

---

## Core Mechanic: Scratch Reveal

This game uses the same **render texture mask** technique as Digital Coloring, but with distinct theming and interaction feedback:

1. **Base layer:** Full-colour illustrated scene (animal, vehicle, character).
2. **Scratch layer:** A metallic silver/gold textured sprite at full opacity.
3. **Mask:** A `PIXI.RenderTexture` that accumulates white circles wherever the player drags.
4. The scratch layer uses the mask; scratched regions become transparent, revealing the image.
5. **Scratch particles:** Each drag stamp also spawns 2–3 tiny `scratch_chip` particles that scatter from the drag point and fade, mimicking real card scratch debris.

### Key Difference from Digital Coloring
- Brush shape is **irregular** (offset circle cluster) to feel like real scratching.
- Scratch sounds are **percussive** (dry scratch/scrape texture).
- 30% threshold triggers a **flash wipe** (bright white overlay fades in over 300ms, then out over 300ms, leaving the image fully revealed).

---

## Canvas Layout

```
┌──────────────────────────┐
│  🎉  Scratch to Reveal!  │  ← prompt label (top 8%)
│                          │
│  ┌────────────────────┐  │
│  │  ░░░░░░░░░░░░░░░░ │  │  ← scratch layer (metallic texture)
│  │  ░░░░  [gap] ░░░░ │  │     player drags to remove
│  │  ░░░░░░░░░░░░░░░░ │  │
│  └────────────────────┘  │
│                          │
│  [=====       ] 32%      │  ← reveal progress bar
│                          │
│     🖼 1 / 6             │  ← image counter
└──────────────────────────┘
```

---

## Image Set

6 images per session, randomly ordered:

| Asset Key | Subject |
|-----------|---------|
| `reveal_cow` | Happy cartoon cow |
| `reveal_duck` | Yellow rubber duck |
| `reveal_lion` | Friendly lion with mane |
| `reveal_rocket` | Colourful rocket ship |
| `reveal_butterfly` | Rainbow butterfly |
| `reveal_turtle` | Smiling turtle |

After all 6 are revealed, a full win screen with `win_jingle` and star shower.

---

## Scratch Brush

```javascript
// Stamp brush: cluster of 3 circles to feel irregular
const offsets = [
  { dx: 0,  dy: 0  },
  { dx: -brushR * 0.4, dy: -brushR * 0.3 },
  { dx:  brushR * 0.3, dy:  brushR * 0.4 },
];
offsets.forEach(o => {
  brushGraphics.circle(x + o.dx, y + o.dy, brushR);
});
brushGraphics.fill({ color: 0xffffff });
renderer.render({ container: brushGraphics, renderTexture: maskTex, clear: false });
```

`brushR = engine.width * 0.07` — generous radius for little fingers.

---

## Scratch Particles

On each drag event, spawn 2–3 tiny `scratch_chip` sprites at the drag point:
- Random direction vector `(vx, vy)` in a downward arc (gravity effect).
- Lifetime: 0.4s; alpha fades from 1 → 0.
- Scale: 0.3–0.7 random.
- Removed from entity list when dead.

```javascript
// In update() — advance particles
this.chips = this.chips.filter(c => {
  c.vy += 300 * dt;  // gravity
  c.sprite.x += c.vx * dt;
  c.sprite.y += c.vy * dt;
  c.sprite.alpha -= 2.5 * dt;
  return c.sprite.alpha > 0;
});
```

---

## Flash Wipe Auto-Complete

When `revealPercent >= 0.30`:
1. Set `this.autoCompleting = true`.
2. Play `reveal_flash` sound.
3. Tween a white full-screen overlay from `alpha 0 → 1` over 200ms.
4. In the overlay-fade-in callback:
   - Set `scratchLayer.visible = false` (fully reveal base image).
   - Tween overlay `alpha 1 → 0` over 300ms.
5. After overlay fade-out:
   - Spawn sparkle burst FX centred on the image.
   - Display subject name label for 2s.
   - After 2s, load next image.

---

## Reveal Completion Label

After the flash wipe, a large friendly label appears centred over the revealed image:
- Text: `"Duck! 🦆"` (using the subject name).
- Font size: `engine.height * 0.12`.
- Colour: white with soft drop shadow.
- Animates in with a `pop` scale FX.
- Fades out after 2s.

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `scratch_surface` | Metallic gold/silver scratchcard texture |
| `scratch_chip` | Tiny scratch debris particle (irregular shape) |
| `reveal_cow` | Cow illustration scene |
| `reveal_duck` | Duck illustration scene |
| `reveal_lion` | Lion illustration scene |
| `reveal_rocket` | Rocket illustration scene |
| `reveal_butterfly` | Butterfly illustration scene |
| `reveal_turtle` | Turtle illustration scene |
| `particle_sparkle` | Sparkle for post-reveal celebration |
| `overlay_white` | White 1×1 pixel (scaled to canvas for flash effect) |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `scratch_loop` | Scratchy drag sound (plays while dragging, throttled) |
| `reveal_flash` | Camera-flash whoosh for auto-complete |
| `win_jingle` | Full set complete fanfare |

---

## Game State

```javascript
this.maskTexture       // PIXI.RenderTexture
this.scratchLayer      // PIXI.Sprite: the scratch surface with mask
this.baseImage         // PIXI.Sprite: the hidden illustration
this.brushGraphics     // PIXI.Graphics: reusable brush stamp
this.chips             // Array<{sprite, vx, vy, alpha}>: scratch particles
this.revealPercent     // float 0..1
this.autoCompleting    // bool: prevents double trigger
this.imageQueue        // string[]: shuffled asset key list
this.imageIndex        // int: current position in queue
this.scratchSoundTimer // float: throttle scratch sound to once/150ms
```

---

## Engine API Usage

```javascript
config: {
  background:      '#2c1810',
  interactionMode: 'drag',
  assets: [
    'scratch_surface', 'scratch_chip',
    'reveal_cow', 'reveal_duck', 'reveal_lion',
    'reveal_rocket', 'reveal_butterfly', 'reveal_turtle',
    'particle_sparkle', 'overlay_white',
  ],
  audio: ['scratch_loop', 'reveal_flash', 'win_jingle'],
},
```

---

## Preview Animation

- Show scratch surface (50% pre-revealed, with visible scratch marks).
- Animate a "finger" cursor dragging across a remaining area.
- Progress bar fills to 30%.
- Flash wipe auto-complete plays.
- Scene resets with a new image and loops after 4s.

---

## Toddler-Specific Design Notes

- **30% threshold is very achievable** — a single confident swipe often covers it.
- **Flash wipe is non-frightening** — the white flash is brief (0.2s) and paired with a pleasant sound.
- **Scratch particles are tiny and downward** — the debris effect is satisfying without being overwhelming.
- **Image names are spoken** — (optional TTS via `speechSynthesis` API or pre-recorded audio clips) so non-reading toddlers still get the label.
- **6 images per session** — ends before attention wanes; win screen feels earned.
- **No backtracking** — each image is shown once per session in fixed order.

---

**Previous:** [03 — Peek-a-Boo](./03-peek-a-boo.md) | **Next:** [05 — Ball Launch →](./05-ball-launch.md)
