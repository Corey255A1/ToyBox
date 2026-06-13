# Game Design: Peek-a-Boo

**File:** `games/peek_a_boo.js`
**Target Age:** 1–4 years
**Interaction Mode:** `tap`
**Estimated Play Time:** 2–4 min

---

## Overview

A classic peek-a-boo mechanic: a friendly door (or curtain) sits in the centre of the screen. The child taps the door; it springs open with a bouncy animation, revealing a surprise animal or character that waves and makes a sound. The door closes again after a moment, ready for the next tap. Each tap reveals a different animal in a random order.

---

## Core Mechanic: Spring Door

A central "door" sprite covers a hidden animal panel beneath it. When tapped:

1. The door pivots open using a rotation tween with spring overshoot (simulated via a bounce easing curve).
2. The animal sprite beneath fades in and immediately plays an idle animation (bounce up-down, or wave).
3. The animal plays its audio cue (`moo`, `quack`, etc.).
4. After 2.5s the door rotates back closed.
5. The next animal in the queue is placed behind the door.
6. A gentle "curtain close" sound plays.

### Spring Animation (Simulated)

Since PixiJS tweens support only linear/easing curves, implement the spring via `update()` with a physics step:

```javascript
// Simple spring: angle converges toward target with overshoot
const stiffness = 8.0;
const damping   = 0.4;
this.angularVelocity += (targetAngle - this.doorAngle) * stiffness * dt;
this.angularVelocity *= (1 - damping);
this.doorAngle       += this.angularVelocity * dt;
this.doorSprite.rotation = this.doorAngle;
```

---

## Canvas Layout

```
┌──────────────────────────┐
│   🐄  "Who is there?"    │  ← prompt label + animal count indicator
│                          │
│        ┌──────┐          │
│        │ ████ │          │  ← door (closed state)
│        │ ████ │          │
│        │ ████ │          │
│        └──────┘          │
│         👆 Tap me!       │  ← tap hint (fades after first tap)
│                          │
│     ⭐⭐⭐⭐⭐⭐           │  ← animal progress dots (bottom)
└──────────────────────────┘
```

---

## Animal Sequence

Animals cycle in random order. Full set (8 animals):

| Index | Animal | Asset Key | Audio Key |
|-------|--------|-----------|-----------|
| 0 | Cow | `animal_cow` | `sound_moo` |
| 1 | Duck | `animal_duck` | `sound_quack` |
| 2 | Frog | `animal_frog` | `sound_ribbit` |
| 3 | Pig | `animal_pig` | `sound_oink` |
| 4 | Cat | `animal_cat` | `sound_meow` |
| 5 | Dog | `animal_dog` | `sound_woof` |
| 6 | Elephant | `animal_elephant` | `sound_trumpet` |
| 7 | Lion | `animal_lion` | `sound_roar` |

After cycling through all 8, the sequence reshuffles and starts again with a `win_jingle`.

---

## Door States

| State | Description |
|-------|-------------|
| `CLOSED` | Door is fully closed, tap hint is visible |
| `OPENING` | Spring rotation from 0° → -90° (pivot at left edge) |
| `OPEN` | Door held open, animal visible and animated |
| `CLOSING` | Rotation returns 0°, animal fades out |

State transitions:
- `CLOSED → OPENING`: on player tap
- `OPENING → OPEN`: when `|doorAngle - targetAngle| < 1°` AND velocity < 0.1
- `OPEN → CLOSING`: after 2.5s timer
- `CLOSING → CLOSED`: when `|doorAngle| < 1°` AND velocity < 0.1

---

## Animal Idle Animation

When `OPEN`, the revealed animal sprite bobs:
```javascript
// In update() while state === 'OPEN'
this.animalBobTime += dt;
this.animalSprite.y = this.animalBaseY + Math.sin(this.animalBobTime * 4) * 8;
```

Scale the animal sprite to fill ~60% of the canvas height.

---

## Progress Indicator

Row of small circle dots at the bottom — one per animal in the current cycle.
- Grey circle: not yet revealed this cycle.
- Gold star: revealed this cycle.
- Fills left to right as animals are discovered.

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `door_closed` | Friendly wooden door sprite (full panel) |
| `door_frame` | Door frame / surround (stays static) |
| `animal_cow` | Cow illustration |
| `animal_duck` | Duck illustration |
| `animal_frog` | Frog illustration |
| `animal_pig` | Pig illustration |
| `animal_cat` | Cat illustration |
| `animal_dog` | Dog illustration |
| `animal_elephant` | Elephant illustration |
| `animal_lion` | Lion illustration |
| `ui_dot_empty` | Grey circle progress dot |
| `ui_dot_filled` | Gold star progress dot |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `door_creak_open` | Wooden creak as door swings open |
| `door_close` | Soft close thud |
| `sound_moo` | Cow moo |
| `sound_quack` | Duck quack |
| `sound_ribbit` | Frog ribbit |
| `sound_oink` | Pig oink |
| `sound_meow` | Cat meow |
| `sound_woof` | Dog woof |
| `sound_trumpet` | Elephant trumpet |
| `sound_roar` | Lion roar |
| `win_jingle` | Full cycle complete fanfare |

---

## Game State

```javascript
this.doorAngle         // float: current door rotation in radians
this.angularVelocity   // float: spring physics velocity
this.doorState         // 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING'
this.openTimer         // float: seconds spent in OPEN state
this.animalQueue       // string[]: shuffled animal key list
this.currentAnimalIdx  // int
this.animalBobTime     // float: accumulator for bob sine
this.revealedThisCycle // int: count for progress dots
this.progressDots      // Entity[]: dot sprites
```

---

## Engine API Usage

```javascript
config: {
  background:      '#fce4ec',
  interactionMode: 'tap',
  assets: [
    'door_closed', 'door_frame',
    'animal_cow', 'animal_duck', 'animal_frog', 'animal_pig',
    'animal_cat', 'animal_dog', 'animal_elephant', 'animal_lion',
    'ui_dot_empty', 'ui_dot_filled',
  ],
  audio: [
    'door_creak_open', 'door_close',
    'sound_moo', 'sound_quack', 'sound_ribbit', 'sound_oink',
    'sound_meow', 'sound_woof', 'sound_trumpet', 'sound_roar',
    'win_jingle',
  ],
},
```

---

## Preview Animation

- Door sits closed.
- After 0.5s it swings open (spring) revealing the cow.
- Cow bobs up-down for 1.5s.
- Door swings closed.
- Loops every 4s.

---

## Toddler-Specific Design Notes

- **Entire door is the tap target** — no small buttons or precision required.
- **Spring animation is delightful** — the "boing" overshoot is physically satisfying even for adults.
- **Sound plays immediately** on OPENING (not waiting for door to fully open).
- **No failure state** — tapping before the door fully closes just restarts the open cycle.
- **Name label** displayed large above the animal during OPEN state (`"COW! 🐄"`).
- **Tap hint arrow** fades out after the first successful tap so it doesn't clutter the screen.

---

**Previous:** [02 — Digital Coloring](./02-digital-coloring.md) | **Next:** [04 — Scratcher →](./04-scratcher.md)
