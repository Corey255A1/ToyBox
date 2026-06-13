# Game Design: Bubble Pop

**File:** `games/bubble_pop.js`
**Target Age:** 2–6 years
**Interaction Mode:** `tap`
**Estimated Play Time:** 2–5 min

---

## Overview

Colorful bubbles float upward across the screen, each containing a letter, number, shape, or animal picture. The player taps a bubble to pop it, triggering a satisfying burst animation and audio reward. Rounds cycle through themed sets (letters A–Z, numbers 1–10, animals, shapes) so every session can teach something new.

---

## Core Mechanics

### Bubble Spawning
- Bubbles spawn at the bottom of the screen at random X positions.
- Each bubble drifts upward with a gentle sine-wave wobble on the X axis.
- Speed and wobble amplitude are randomized slightly per-bubble so the field feels alive.
- If a bubble reaches the top of the screen without being popped, it floats away and a new one spawns — **no penalty** (toddler-safe).
- Maximum **6 bubbles** on screen simultaneously.

### Tap Interaction
- Touch radius is **1.5× the visual bubble size** (large forgiving hit area).
- On successful tap:
  1. Play `pop_sound` audio.
  2. Run `burst` FX: the bubble explodes into 8–12 coloured glitter particles that scatter outward and fade.
  3. The label inside the bubble scales up briefly (`pop` FX) and then fades.
  4. A new bubble spawns after a short delay (`0.4s`).

### Round / Progression
- A **round** consists of the player popping **10 specific target bubbles** (e.g., the number "3" or the letter "B").
- A large, friendly prompt at the top of the screen reads: `"Pop the 3!"` or `"Find the B!"`.
- Decoy bubbles display other characters from the same theme (wrong numbers, other letters).
- Popping the **correct target** increments the score and shows a brief ⭐ reward.
- Popping a **wrong bubble** plays a gentle `whoosh_fail` sound and adds a light screen shake — no score change.
- After 10 correct pops the round ends with `win_jingle` and a confetti shower.

### Themes (Configurable via Settings)
| Theme Key | Contents |
|-----------|----------|
| `letters` | A–Z uppercase labels |
| `numbers` | 1–20 numerals |
| `animals` | PNG animal sprites |
| `shapes`  | Circle, Square, Triangle, Star, Heart |
| `colors`  | Solid-color bubbles + color name label |

---

## Visual Design

### Canvas Layout
```
┌──────────────────────────┐
│  🌟  Score: 5            │  ← score bar (top 10%)
│                          │
│  "Pop the 3!"            │  ← prompt label (top 20%)
│                          │
│   🫧   🫧    🫧           │
│       🫧         🫧      │  ← floating bubble field
│  🫧         🫧           │
└──────────────────────────┘
```

### Bubble Sprite
- Circular sprite with soft gradient sheen.
- Six colour variants: blue, green, pink, yellow, purple, orange.
- Asset keys: `bubble_blue`, `bubble_green`, `bubble_pink`, `bubble_yellow`, `bubble_purple`, `bubble_orange`.
- Label rendered as `engine.spawn` text child, centred inside the bubble.

### Glitter Particles
- 8 small `particle_glitter` sprites (star or sparkle shape).
- Spawned at the pop point with random direction vectors.
- Animate outward (`x += vx * dt`, `y += vy * dt`) and fade (`alpha -= 2 * dt`).
- Removed when `alpha <= 0`.

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `bubble_blue` | Blue bubble sprite (~120×120px) |
| `bubble_green` | Green bubble sprite |
| `bubble_pink` | Pink bubble sprite |
| `bubble_yellow` | Yellow bubble sprite |
| `bubble_purple` | Purple bubble sprite |
| `bubble_orange` | Orange bubble sprite |
| `particle_glitter` | Small star sparkle for burst particles |
| `ui_star` | Gold star for score display |
| `prompt_bg` | Rounded rect background for prompt label |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `pop_sound` | Classic bubble pop (short, punchy) |
| `win_jingle` | Short celebratory fanfare |
| `whoosh_fail` | Soft whoosh for wrong tap |
| `round_start` | Friendly chime when new prompt appears |

---

## Game State

```javascript
this.score          // int: correct pops this round
this.targetChar     // string: the current target ('3', 'B', etc.)
this.targetTheme    // string: current theme key
this.bubbles        // Entity[]: live bubbles on screen
this.particles      // Entity[]: live glitter particles
this.isRoundEnd     // bool: block spawning during win sequence
```

---

## Engine API Usage

```javascript
config: {
  background:      '#1b2a4a',
  interactionMode: 'tap',
  assets: [
    'bubble_blue', 'bubble_green', 'bubble_pink',
    'bubble_yellow', 'bubble_purple', 'bubble_orange',
    'particle_glitter', 'ui_star', 'prompt_bg',
  ],
  audio: ['pop_sound', 'win_jingle', 'whoosh_fail', 'round_start'],
},

init(engine) { /* spawn score label, prompt label, first wave of bubbles */ },

update(engine, deltaTime) {
  // Move bubbles upward + wobble
  // Move and fade particles
  // Cull off-screen bubbles, spawn replacements
  // Check win condition
},

onEvent(engine, eventName, payload) {
  if (eventName === 'bubble_tapped') { /* check correct/wrong, burst FX */ }
},
```

---

## Preview Animation (`preview` / `previewUpdate`)

- Three bubbles float upward from the bottom.
- One bubble is tapped (simulated) — it bursts into glitter particles.
- The scene resets and loops every ~3 seconds.

```javascript
preview(miniEngine) {
  this.t = 0;
  this.bubbles = [
    miniEngine.spawn({ id:'pb0', asset:'bubble_blue',  x: 60, y: 200 }),
    miniEngine.spawn({ id:'pb1', asset:'bubble_green', x: 130, y: 240 }),
    miniEngine.spawn({ id:'pb2', asset:'bubble_pink',  x: 200, y: 210 }),
  ];
},

previewUpdate(miniEngine, dt) {
  this.t += dt;
  this.bubbles.forEach((b, i) => { b.y -= 25 * dt; });
  if (this.t > 3) { this.t = 0; /* reset positions */ }
},
```

---

## Toddler-Specific Design Notes

- **Giant tap radius** — `1.5× bubble radius` in the input handler hit test.
- **No fail state** — wrong taps play a soft sound and nothing disappears.
- **Glitter, not explosions** — particles are soft, sparkly, non-startling.
- **Auto-replace** — bubbles that escape the screen are silently replaced.
- **Prompt is always visible** — large, high-contrast text at the top so a parent can read along.
- **Session length** — each round is deliberately short (10 correct pops ≈ 90 seconds) to match toddler attention spans.

---

**Next:** [02 — Digital Coloring →](./02-digital-coloring.md)
