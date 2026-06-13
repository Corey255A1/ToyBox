# Game Design: Ball Launch

**File:** `games/ball_launch.js`
**Target Age:** 2–5 years
**Interaction Mode:** `tap`
**Estimated Play Time:** 3–6 min

---

## Overview

A gentle physics-based game where the child taps a large launch button to fire a ball in a graceful arc toward colourful targets. Even if the ball misses, a subtle "magnet" effect nudges it toward the nearest target, ensuring near-constant satisfying hits. The game is designed around the joy of motion and the dopamine reward of a target popping — not challenge or failure.

---

## Core Mechanic: Tap-to-Fire with Magnet Assist

### Ball Physics (Arc Trajectory)
Ball follows a parabolic arc using simple Euler integration:
```javascript
// Constants
const GRAVITY      = 400;   // px/s²
const LAUNCH_SPEED = 600;   // px/s
const LAUNCH_ANGLE = -65;   // degrees (upward-right by default)

// Per-frame update
this.ballVx += 0;            // no horizontal acceleration
this.ballVy += GRAVITY * dt;
this.ballX  += this.ballVx * dt;
this.ballY  += this.ballVy * dt;
```

Launch direction always aims at the **nearest target** with a slight random offset (±15°) for visual variety.

### Magnet Assist
Each frame, while the ball is in flight, calculate a soft pull toward the nearest target:
```javascript
const dx = target.x - this.ballX;
const dy = target.y - this.ballY;
const dist = Math.sqrt(dx*dx + dy*dy);

if (dist < MAGNET_RADIUS) {   // MAGNET_RADIUS = 120px
  const pull = (1 - dist / MAGNET_RADIUS) * MAGNET_STRENGTH;
  this.ballVx += (dx / dist) * pull * dt;
  this.ballVy += (dy / dist) * pull * dt;
}
```
`MAGNET_STRENGTH = 500` — strong enough to redirect near-misses without being obviously artificial.

### Hit Detection
On each frame, check if `dist(ball, target) < HIT_RADIUS` where `HIT_RADIUS = target.width * 0.55`.

---

## Canvas Layout

```
┌──────────────────────────┐
│  ⭐ Score: 7             │  ← score bar (top 8%)
│                          │
│   🎯    🎯    🎯         │  ← targets (3 rows × 3 cols)
│     🎯      🎯           │
│   🎯    🎯    🎯         │
│                          │
│        ●                 │  ← ball (in flight / resting)
│                          │
│   ╔══════════════╗       │
│   ║   LAUNCH! 🚀 ║       │  ← big launch button (bottom 20%)
│   ╚══════════════╝       │
└──────────────────────────┘
```

---

## Targets

Targets are colourful balloon/star/fruit shapes arranged in a 3×3 grid (9 targets).

| Asset Key | Description |
|-----------|-------------|
| `target_balloon_red` | Red balloon |
| `target_balloon_blue` | Blue balloon |
| `target_balloon_green` | Green balloon |
| `target_star_yellow` | Gold star |
| `target_star_pink` | Pink star |
| `target_fruit_apple` | Apple |
| `target_fruit_orange` | Orange |
| `target_fruit_banana` | Banana |
| `target_cloud` | Fluffy white cloud |

Each target is a `engine.spawn` entity with `onTouch` disabled (ball hits, not player taps).

### Target Hit Animation
1. Play `target_pop` audio.
2. Run `burst` FX at target position (8 coloured particles scatter).
3. Tween target `scale 1 → 1.6` then `alpha 1 → 0` over 300ms.
4. Target entity is despawned.
5. Score incremented by 1, score label updates.
6. Spawn a replacement target at the same position after 1.5s delay.

---

## Ball Behaviour

| State | Description |
|-------|-------------|
| `IDLE` | Ball sits at launch pad position; launch button visible |
| `FLYING` | Ball in parabolic flight; launch button hidden |
| `LANDED` | Ball reached bottom or hit edge — return to IDLE after 0.3s |

### Ball Sprite
- Asset key: `ball_main` — bright coloured rubber ball with shine highlight.
- Scale relative to canvas: `engine.width * 0.08`.
- Launch position: `(engine.width * 0.5, engine.height * 0.82)`.

### Ball Trail
Each frame while `FLYING`, spawn a trail dot:
```javascript
// Small semi-transparent circle that fades
this.trail.push({ x: this.ballX, y: this.ballY, alpha: 0.5 });
this.trail = this.trail.filter(t => { t.alpha -= 2 * dt; return t.alpha > 0; });
```

---

## Launch Button

- Large rounded rectangle: `engine.width * 0.6` wide, `engine.height * 0.12` tall.
- Centred horizontally at `y = engine.height * 0.88`.
- Asset: `btn_launch_bg` with text label `"LAUNCH! 🚀"`.
- On tap:
  1. Animate button `scale 1 → 0.9 → 1` (press feedback, 120ms).
  2. Play `launch_whoosh` sound.
  3. Set ball state to `FLYING`, calculate initial velocity.
- Hidden while ball is `FLYING`; shown when ball is `IDLE`.

---

## Win / Session

- Session ends after **20 target hits**.
- Win screen: `win_jingle`, star shower FX, score display.
- After win, reshuffle targets and restart.

---

## Assets Required

### Sprites
| Asset Key | Description |
|-----------|-------------|
| `ball_main` | Rubber ball with shine (128×128px) |
| `trail_dot` | Small translucent circle for flight trail |
| `btn_launch_bg` | Launch button background |
| `target_balloon_red` | Red balloon target |
| `target_balloon_blue` | Blue balloon target |
| `target_balloon_green` | Green balloon target |
| `target_star_yellow` | Yellow star target |
| `target_star_pink` | Pink star target |
| `target_fruit_apple` | Apple target |
| `target_fruit_orange` | Orange target |
| `target_fruit_banana` | Banana target |
| `target_cloud` | Cloud target |
| `particle_burst` | Coloured burst particle |
| `ui_star` | Score star icon |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `launch_whoosh` | Ball launch whoosh |
| `target_pop` | Satisfying pop/ding when target is hit |
| `ball_bounce` | Soft bounce when ball hits edges or floor |
| `win_jingle` | Session complete fanfare |

---

## Game State

```javascript
this.ballX, this.ballY         // float: ball position
this.ballVx, this.ballVy       // float: ball velocity
this.ballState                 // 'IDLE' | 'FLYING' | 'LANDED'
this.trail                     // Array<{x,y,alpha}>: trail points
this.targets                   // Entity[]: live target entities
this.targetData                // Array<{x,y,assetKey}>: target metadata
this.score                     // int
this.sessionHits               // int: hits toward win (cap at 20)
this.respawnTimers             // Map<entityId, float>: countdown per target
```

---

## Engine API Usage

```javascript
config: {
  background:      '#87ceeb',   // Sky blue
  interactionMode: 'tap',
  assets: [
    'ball_main', 'trail_dot', 'btn_launch_bg',
    'target_balloon_red', 'target_balloon_blue', 'target_balloon_green',
    'target_star_yellow', 'target_star_pink',
    'target_fruit_apple', 'target_fruit_orange', 'target_fruit_banana',
    'target_cloud', 'particle_burst', 'ui_star',
  ],
  audio: ['launch_whoosh', 'target_pop', 'ball_bounce', 'win_jingle'],
},
```

---

## Preview Animation

- Ball launches from the bottom-centre in an arc.
- Ball curves toward a balloon target.
- Target pops in a burst of coloured particles.
- Ball resets and loops every 3s.

---

## Toddler-Specific Design Notes

- **Tap the big button** — the entire `engine.width * 0.6` zone is the tap target; impossible to miss.
- **Magnet assist** — near-misses are quietly redirected; the child always "wins."
- **Gentle arc** — the ball moves slowly enough to track visually (`LAUNCH_SPEED = 600`).
- **Trail is satisfying** — the fading trail makes the ball's path legible even for small viewers.
- **Immediate feedback** — the launch button press animation and sound play instantly on tap.
- **Respawn targets** — targets reappear after 1.5s so the play field stays full.
- **No fail state** — if the ball lands without hitting anything, it silently resets.

---

**Previous:** [04 — Scratcher](./04-scratcher.md) | **Next:** [06 — Sound Board →](./06-sound-board.md)
