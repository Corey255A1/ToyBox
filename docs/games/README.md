# ToyBox — Game Design Index

This directory contains detailed implementation design plans for each ToyBox mini-game. Each document covers:
- Core mechanics and game loop design
- Canvas layout and visual structure
- Complete asset manifests (sprites + audio)
- Engine API usage (`config`, `init`, `update`, `onEvent`)
- `preview` / `previewUpdate` implementation for the launcher tile
- Toddler-specific UX design decisions

---

## Games

| # | Game | File | Mode | Age | Status |
|---|------|------|------|-----|--------|
| 1 | [Bubble Pop](./01-bubble-pop.md) | `games/bubble_pop.js` | `tap` | 2–6 | 📝 Designed |
| 2 | [Digital Coloring](./02-digital-coloring.md) | `games/digital_coloring.js` | `drag` | 2–5 | 📝 Designed |
| 3 | [Peek-a-Boo](./03-peek-a-boo.md) | `games/peek_a_boo.js` | `tap` | 1–4 | 📝 Designed |
| 4 | [Scratcher](./04-scratcher.md) | `games/scratcher.js` | `drag` | 2–5 | 📝 Designed |
| 5 | [Ball Launch](./05-ball-launch.md) | `games/ball_launch.js` | `tap` | 2–5 | 📝 Designed |
| 6 | [Sound Board](./06-sound-board.md) | `games/sound_board.js` | `tap` | 1–4 | 📝 Designed |
| 7 | [Shape Sorter](./07-shape-sorter.md) | `games/shape_sorter.js` | `drag` | 2–5 | 📝 Designed |
| 8 | [Flashlight](./08-flashlight.md) | `games/flashlight.js` | `drag` | 2–5 | 📝 Designed |

**Existing Game:**
| — | [Animal Memory Match](../10-building-a-game.md) | `games/memory_match.js` | `tap` | 2–6 | ✅ Implemented |

---

## Design Patterns Across All Games

### Interaction Modes Used
- **`tap`**: Bubble Pop, Peek-a-Boo, Ball Launch, Sound Board
- **`drag`**: Digital Coloring, Scratcher, Shape Sorter, Flashlight

### Common Toddler UX Principles
All games follow these shared design rules:

1. **No fail states** — wrong actions are silently corrected or gently redirected.
2. **Generous hit targets** — touch areas are `1.25–1.5×` the visual size.
3. **Immediate feedback** — audio and animation respond within one frame of input.
4. **Auto-completion** — games nudge themselves to completion (magnet snaps, auto-wipes, 30% thresholds).
5. **Short sessions** — each round/scene is designed for ~90-second toddler attention windows.
6. **Bright, saturated visuals** — high-contrast palettes with large, readable shapes.
7. **Audio is optional** — all audio is wrapped in try/catch; games function fully without sound.

### Render Texture Mask Pattern
Three games (Digital Coloring, Scratcher, Flashlight) use PixiJS v8's `PIXI.RenderTexture` mask technique:
- Create `maskTex = PIXI.RenderTexture.create({ width, height })`.
- On each drag event, stamp `PIXI.Graphics` shapes onto `maskTex` via `renderer.render({ container, renderTexture: maskTex, clear: false })`.
- Apply mask: `targetSprite.mask = new PIXI.Sprite(maskTex)`.

### Physics-Lite Pattern
Two games (Ball Launch, Peek-a-Boo) use simple physics in `update()`:
- No physics library — all simulation is manual Euler integration.
- Spring: `velocity += stiffness * (target - position); velocity *= (1-damping); position += velocity * dt`.
- Arc: `vy += GRAVITY * dt; x += vx * dt; y += vy * dt`.

### PIXI.Graphics-First Pattern
Three games (Sound Board, Shape Sorter + optional for Bubble Pop) draw their primary visuals in `PIXI.Graphics` instead of loading texture assets:
- Benefits: no asset loading delay, resolution-independent rendering, smaller bundle.
- Drawback: complex shapes (hearts, stars) require path math or SVG-to-path conversion.

---

## Implementation Priority

Suggested build order based on complexity and shared patterns:

```
Round 1 (Simple tap games):
  Sound Board   → minimal assets, open-ended, good engine warm-up
  Peek-a-Boo    → introduces spring physics pattern
  Bubble Pop    → particle system foundation

Round 2 (Physics & launch):
  Ball Launch   → builds on arc physics from Peek-a-Boo

Round 3 (Drag & mask):
  Scratcher     → introduces RenderTexture mask (simpler use case)
  Digital Coloring → extends Scratcher pattern
  Flashlight    → extends mask + adds discovery logic

Round 4 (Drag & snap):
  Shape Sorter  → most complex drag interaction; uses PIXI.Graphics shapes
```

---

## Asset Production Notes

- **All scene illustrations** should be at `1024×768px` or `1024×1024px` PNG with transparency.
- **UI sprites** (dots, stars, buttons) should be at `256×256px`.
- **Audio** should be short OGG files (< 2s for effects, < 5s for jingles) with 44.1kHz, mono preferred.
- **Fallback synthesis** — `engine.audio` already has Web Audio API synthesis fallbacks; missing audio files will not crash games.
