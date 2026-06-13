# Game Design: Flashlight

**File:** `games/flashlight.js`
**Target Age:** 2–5 years
**Interaction Mode:** `drag`
**Estimated Play Time:** 3–6 min

---

## Overview

The screen is dark. A circular beam of light follows the child's finger as they drag across the canvas. Hidden animals and objects are scattered throughout the dark scene. When the beam passes over a hidden object, it lights up, plays a sound, and reveals itself. Once all objects in the scene are discovered, the lights come on with a celebration, and a new scene loads.

---

## Core Mechanic: Darkness Mask + Discovery

### Darkness Implementation

The scene is rendered in two layers:
1. **Scene layer** — Full-colour illustrated scene with several hidden objects.
2. **Darkness mask layer** — A full-canvas black overlay with a soft circular hole cut out at the flashlight position.

```javascript
// Darkness layer: PIXI.Graphics redrawn every frame
const g = this.darkGraphics;
g.clear();

// Fill entire canvas black (semi-transparent so it's dark, not pitch black)
g.rect(0, 0, engine.width, engine.height).fill({ color: 0x000000, alpha: 0.85 });

// Punch a soft circular hole using a radial gradient effect
// In PixiJS v8: use a Graphics circle with blendMode or mask approach
g.circle(this.lightX, this.lightY, this.beamRadius).fill({ color: 0x000000, alpha: 0 });
```

> **PixiJS v8 Gradient Approach:** The soft "penumbra" edge is achieved by drawing 5–8 concentric circles with decreasing opacity (outermost = alpha 0.80 → innermost = alpha 0.0). This simulates a soft light falloff without requiring a shader.

```javascript
const RINGS = 8;
for (let i = RINGS; i >= 0; i--) {
  const r     = this.beamRadius * (i / RINGS);
  const alpha = 0.85 * (i / RINGS);
  g.circle(this.lightX, this.lightY, r).fill({ color: 0x000000, alpha });
}
```

---

## Canvas Layout

```
┌──────────────────────────┐
│  🔦  Find the animals!   │  ← title/prompt (visible, above dark layer)
├──────────────────────────┤
│                          │
│  ████████████████████    │
│  ██████ 🦊 ███████████   │  ← dark scene (objects hidden in darkness)
│  █████████████████████   │
│  ██████████  🐸  ██████  │     flashlight beam at player touch position
│  ████████████████████    │
│                          │
│  ○ ○ ○ ○ ○              │  ← discovery dots (bottom: one per object)
└──────────────────────────┘
```

---

## Scene & Object System

### Scenes
3 scenes, each containing 5 hidden objects:

| Scene Key | Background Asset | Objects |
|-----------|-----------------|---------|
| `scene_jungle` | `bg_jungle` | Fox, Frog, Parrot, Snake, Monkey |
| `scene_ocean` | `bg_ocean` | Fish, Crab, Seahorse, Starfish, Octopus |
| `scene_night_sky` | `bg_night` | Rocket, UFO, Moon, Shooting Star, Astronaut |

### Object Spawning
Objects are placed at fixed positions within each scene (to ensure good spatial distribution). Positions defined as fractions of canvas size:

```javascript
const JUNGLE_OBJECTS = [
  { id: 'fox',    asset: 'obj_fox',    x: 0.2,  y: 0.4, sound: 'sound_fox' },
  { id: 'frog',   asset: 'obj_frog',   x: 0.7,  y: 0.6, sound: 'sound_frog' },
  { id: 'parrot', asset: 'obj_parrot', x: 0.5,  y: 0.25, sound: 'sound_parrot' },
  { id: 'snake',  asset: 'obj_snake',  x: 0.3,  y: 0.7, sound: 'sound_snake' },
  { id: 'monkey', asset: 'obj_monkey', x: 0.8,  y: 0.35, sound: 'sound_monkey' },
];
```

Each object starts with `alpha = 0.0` (invisible even inside the beam).

---

## Discovery Mechanic

On each `touch_move` (and `update`), check each undiscovered object:
```javascript
for (const obj of this.hiddenObjects) {
  if (obj.discovered) continue;
  const dx = obj.x - this.lightX;
  const dy = obj.y - this.lightY;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist < this.beamRadius * 0.8) {
    // Object is inside the beam — reveal it
    obj.sprite.alpha = Math.min(1, obj.sprite.alpha + 3 * dt);  // fade in over ~0.3s

    // Glow: the object emits its own halo when illuminated
    obj.glow.visible = true;
    obj.glow.alpha = 0.6 + Math.sin(Date.now() * 0.004) * 0.3;

    if (obj.sprite.alpha >= 1 && !obj.soundPlayed) {
      engine.audio.play(obj.sound);
      obj.soundPlayed = true;
      this._markDiscovered(obj, engine);
    }
  } else {
    // Object fades out when beam moves away (but stays visible if discovered)
    if (!obj.discovered) {
      obj.sprite.alpha = Math.max(0, obj.sprite.alpha - 2 * dt);
      obj.glow.visible = false;
    }
  }
}
```

### Object Glow Halo
Each object has a `glow` sprite (radial gradient circle, soft white/yellow) positioned behind the object sprite. It pulses while the beam is on it and stays lit after discovery.

---

## Discovery Confirmation

When `_markDiscovered(obj, engine)` is called:
1. `obj.discovered = true`.
2. The object stays fully visible (`alpha = 1.0`) regardless of beam position.
3. A name label pops up above the object: `"Fox! 🦊"` (scale-in FX, fades after 1.5s).
4. A sparkle burst FX fires at the object's position.
5. The corresponding progress dot at the bottom turns gold.
6. Check win condition: if all 5 objects discovered → `_winScene(engine)`.

---

## Win Scene

When all objects are discovered:
1. Play `win_jingle`.
2. Tween darkness layer `alpha 0.85 → 0` over 800ms (lights come on!).
3. All objects remain visible; the full illuminated scene is shown for 2s.
4. Transition to next scene (or full game win screen after 3 scenes).

---

## Beam Radius

| Setting | Radius | Notes |
|---------|--------|-------|
| Default | `engine.width * 0.18` | Approx. 18% of screen width — visible but not too easy |
| Minimum | `60px` | Hard floor for small screens |
| Maximum | `200px` | Cap for very large displays |

The beam radius is intentionally kept generous — toddlers should not feel like they're searching with a pinhole.

---

## Flashlight Position

- Follows `touch_move` events directly.
- On `touch_up`: the beam stays at the last position (doesn't disappear).
- On game start: beam is centred at `(engine.width * 0.5, engine.height * 0.5)`.
- A subtle torch/flashlight sprite is drawn at the beam edge (optional cosmetic touch).

---

## Assets Required

### Scene Backgrounds
| Asset Key | Description |
|-----------|-------------|
| `bg_jungle` | Full-canvas lush jungle background |
| `bg_ocean` | Underwater ocean background |
| `bg_night` | Night sky with stars background |

### Object Sprites (per scene)
| Asset Key | Description |
|-----------|-------------|
| `obj_fox` | Fox illustration |
| `obj_frog` | Frog illustration |
| `obj_parrot` | Parrot illustration |
| `obj_snake` | Snake illustration |
| `obj_monkey` | Monkey illustration |
| `obj_fish` | Fish illustration |
| `obj_crab` | Crab illustration |
| `obj_seahorse` | Seahorse illustration |
| `obj_starfish` | Starfish illustration |
| `obj_octopus` | Octopus illustration |
| `obj_rocket` | Rocket illustration |
| `obj_ufo` | UFO illustration |
| `obj_moon` | Moon illustration |
| `obj_shooting_star` | Shooting star illustration |
| `obj_astronaut` | Astronaut illustration |

### UI Sprites
| Asset Key | Description |
|-----------|-------------|
| `obj_glow` | Soft radial glow halo (reused for all objects) |
| `ui_dot_empty` | Empty discovery progress dot |
| `ui_dot_filled` | Gold discovery progress dot |
| `particle_sparkle` | Sparkle FX particle |

### Audio
| Audio Key | Description |
|-----------|-------------|
| `sound_fox` | Fox bark |
| `sound_frog` | Frog ribbit |
| `sound_parrot` | Parrot squawk |
| `sound_snake` | Snake hiss |
| `sound_monkey` | Monkey chatter |
| `sound_fish` | Bubble sound |
| `sound_crab` | Crab click |
| `sound_seahorse` | Gentle chime |
| `sound_starfish` | Sparkle ding |
| `sound_octopus` | Deep bubbles |
| `sound_rocket` | Rocket whoosh |
| `sound_ufo` | Sci-fi zap |
| `sound_moon` | Dreamy chime |
| `sound_shooting_star` | Twinkle shimmer |
| `sound_astronaut` | Radio static + "hello" |
| `win_jingle` | Scene complete fanfare |

---

## Game State

```javascript
this.lightX, this.lightY    // float: current flashlight position
this.beamRadius             // float: beam radius in pixels
this.darkGraphics           // PIXI.Graphics: redrawn each frame
this.hiddenObjects          // Array<{id, sprite, glow, discovered, soundPlayed, x, y, sound}>
this.sceneKey               // string: current scene identifier
this.sceneQueue             // string[]: shuffled scene order
this.discoveredCount        // int
this.progressDots           // Entity[]: bottom indicator dots
```

---

## Engine API Usage

```javascript
config: {
  background:      '#0a0a1a',   // Very dark blue (almost black)
  interactionMode: 'drag',
  assets: [
    'bg_jungle', 'bg_ocean', 'bg_night',
    'obj_fox', 'obj_frog', 'obj_parrot', 'obj_snake', 'obj_monkey',
    'obj_fish', 'obj_crab', 'obj_seahorse', 'obj_starfish', 'obj_octopus',
    'obj_rocket', 'obj_ufo', 'obj_moon', 'obj_shooting_star', 'obj_astronaut',
    'obj_glow', 'ui_dot_empty', 'ui_dot_filled', 'particle_sparkle',
  ],
  audio: [
    'sound_fox', 'sound_frog', 'sound_parrot', 'sound_snake', 'sound_monkey',
    'sound_fish', 'sound_crab', 'sound_seahorse', 'sound_starfish', 'sound_octopus',
    'sound_rocket', 'sound_ufo', 'sound_moon', 'sound_shooting_star', 'sound_astronaut',
    'win_jingle',
  ],
},

init(engine) { /* load scene, spawn objects, draw initial darkness */ },

update(engine, deltaTime) {
  // Redraw darkGraphics at current lightX/lightY
  // Check discovery proximity for each object
  // Update object alpha (fade in/out)
  // Animate glow pulsing
},

onEvent(engine, eventName, payload) {
  if (eventName === 'touch_move') {
    this.lightX = payload.x;
    this.lightY = payload.y;
  }
  if (eventName === 'touch_down') {
    this.lightX = payload.x;
    this.lightY = payload.y;
  }
},
```

---

## Preview Animation

- Dark scene with 3 hidden animal silhouettes barely visible.
- A flashlight beam sweeps slowly from left to right.
- As the beam passes over an animal, it lights up and sparkles.
- Loop every 4s.

---

## Toddler-Specific Design Notes

- **Beam radius is generous** (18% of canvas width) — objects don't require precise aiming.
- **Objects fade in gradually** — not a sudden jump; the progressive reveal is exciting.
- **Beam stays on release** — the dark scene doesn't snap back when the child lifts their finger.
- **Bright object glow** — illuminated objects emit their own halo, reinforcing the "found it" moment.
- **Lights-on win transition** — the darkness lifting is a physical metaphor that even very young children understand.
- **Audio triggers on full reveal** — sound plays when the object is fully visible, not on initial contact, preventing overwhelming simultaneous sounds.
- **No anxiety design** — the objects are not scary; they are friendly characters that wave or animate when discovered.
- **Darkness is not pitch black** — `alpha: 0.85` not `1.0`; a slight hint of the scene is always visible, preventing disorientation.

---

**Previous:** [07 — Shape Sorter](./07-shape-sorter.md)
