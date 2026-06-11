# 10 — Building a Game: Step-by-Step Tutorial

This tutorial walks through creating a complete ToyBox mini-game from scratch: **"Bubble Pop"** — a simple game where toddlers tap colorful bubbles to pop them and earn stars.

---

## What We're Building

**Bubble Pop** — Tap Mode

- 10 colorful bubbles float gently on screen
- Tapping a bubble plays a "pop" sound and animates it away
- A star counter tracks how many bubbles have been popped
- When all 10 bubbles are popped, a win screen appears
- New bubbles drift in from the bottom over time

**Estimated implementation time:** ~30 minutes

---

## Prerequisites

Before starting, ensure:
- [ ] The ToyBox engine is set up per [01 — Project Setup](./01-project-setup.md)
- [ ] PixiJS is vendored in `/lib/pixi.min.js`
- [ ] A local HTTP server is running
- [ ] The game manifest exists at `/games/manifest.json`

---

## Phase 1 — Plan Your Assets

### Sprites needed

| Asset Key | File | Description |
|-----------|------|-------------|
| `bubble_red` | `/assets/sprites/bubble_red.png` | Red bubble (128×128 px) |
| `bubble_blue` | `/assets/sprites/bubble_blue.png` | Blue bubble |
| `bubble_green` | `/assets/sprites/bubble_green.png` | Green bubble |
| `bubble_yellow` | `/assets/sprites/bubble_yellow.png` | Yellow bubble |
| `star_gold` | `/assets/sprites/star_gold.png` | Gold star for score counter |

### Audio needed

| Asset Key | File | Description |
|-----------|------|-------------|
| `pop_sound` | `/assets/audio/pop_sound.ogg` | Short pop (< 200ms) |
| `win_jingle` | `/assets/audio/win_jingle.ogg` | Win fanfare (2s) |

> **Placeholder assets:** During development, use solid-color circles as placeholder sprites. You can generate them with Canvas 2D:
> ```javascript
> function makeCircleTexture(color, radius) {
>   const g = new PIXI.Graphics();
>   g.circle(0, 0, radius).fill(color);
>   return app.renderer.generateTexture(g);
> }
> ```
> This eliminates the need for external image files during prototyping.

---

## Phase 2 — Register the Game in the Manifest

Add an entry to `/games/manifest.json`:

```json
[
  {
    "id": "bubble-pop",
    "title": "Bubble Pop",
    "description": "Pop all the bubbles!",
    "icon": "bubble_blue",
    "scriptPath": "games/bubble_pop.js",
    "ageRange": "2-5",
    "tags": ["popping", "colors", "counting"]
  }
]
```

---

## Phase 3 — Create the Game File

Create `/games/bubble_pop.js`:

### Step 3.1 — Skeleton

Start with the bare contract structure:

```javascript
// games/bubble_pop.js

export default {

  config: {
    background:      '#0a1628',
    interactionMode: 'tap',
    assets: [
      'bubble_red', 'bubble_blue', 'bubble_green', 'bubble_yellow',
      'star_gold',
    ],
    audio: ['pop_sound', 'win_jingle'],
  },

  init(engine) {
    // TODO
  },

  update(engine, deltaTime) {
    // TODO
  },

  onEvent(engine, eventName, payload) {
    // TODO
  },

};
```

### Step 3.2 — State Initialization

In `init()`, set up all internal game state:

```javascript
init(engine) {
  // Game state
  this.bubblesPopped = 0;
  this.totalBubbles  = 10;
  this.bubbles       = [];
  this.spawnTimer    = 0;
  this.spawnInterval = 0.8; // seconds between new bubbles appearing
  this.gameOver      = false;

  // Score display
  this.scoreLabel = engine.spawn({
    id:       'score_label',
    text:     '⭐ 0',
    fontSize: 52,
    color:    '#FFD700',
    x:        engine.width / 2,
    y:        60,
    zIndex:   10,
  });

  // Title prompt
  engine.spawn({
    id:       'prompt',
    text:     'Pop the bubbles!',
    fontSize: 34,
    color:    'rgba(255,255,255,0.6)',
    x:        engine.width / 2,
    y:        110,
    zIndex:   10,
  });

  // Spawn initial batch of bubbles
  for (let i = 0; i < 5; i++) {
    this._spawnBubble(engine, true /* initialPlacement */);
  }
},
```

### Step 3.3 — Bubble Spawning Helper

Add a private method to create a single bubble:

```javascript
_spawnBubble(engine, initialPlacement = false) {
  const BUBBLE_ASSETS = ['bubble_red', 'bubble_blue', 'bubble_green', 'bubble_yellow'];
  const asset  = BUBBLE_ASSETS[Math.floor(Math.random() * BUBBLE_ASSETS.length)];
  const scale  = 0.6 + Math.random() * 0.6; // Varied sizes (0.6–1.2)
  const x      = 80 + Math.random() * (engine.width - 160);

  // Initial bubbles placed randomly on screen; new bubbles enter from bottom
  const y = initialPlacement
    ? 200 + Math.random() * (engine.height - 300)
    : engine.height + 80;

  const bubble = engine.spawn({
    id:      `bubble_${Date.now()}_${Math.random()}`,
    asset,
    x,
    y,
    scale,
    onTouch: (self) => this._popBubble(self, engine),
  });

  // Attach motion data to the entity
  bubble._speed   = 30 + Math.random() * 40;  // px/sec upward
  bubble._wobble  = Math.random() * Math.PI * 2; // phase offset for sine wave
  bubble._wobbleSpeed = 0.8 + Math.random() * 0.8;
  bubble._wobbleAmp   = 15 + Math.random() * 20; // horizontal drift amplitude
  bubble._startX  = x;

  this.bubbles.push(bubble);
  return bubble;
},
```

### Step 3.4 — Pop Handler

```javascript
_popBubble(bubble, engine) {
  if (bubble._popping) return; // Prevent double-tap
  bubble._popping = true;

  // Play sound
  engine.audio.play('pop_sound');

  // Remove from tracking array
  this.bubbles = this.bubbles.filter(b => b !== bubble);

  // Animate: scale up and fade out
  engine.animate(bubble, { scale: bubble.scale.x * 1.8, alpha: 0 }, 250, 'easeOut')
    .then(() => engine.destroy(bubble));

  // Spawn a burst of small stars (visual reward)
  this._spawnStarBurst(engine, bubble.x, bubble.y);

  // Update score
  this.bubblesPopped++;
  this.scoreLabel.text = `⭐ ${this.bubblesPopped}`;

  // Animate score label as feedback
  engine.animate(this.scoreLabel, { scale: 1.3 }, 100, 'easeOut')
    .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 100, 'bounce'));
},
```

### Step 3.5 — Star Burst Effect

Micro-animations are critical for toddler engagement — create a reward explosion of floating stars:

```javascript
_spawnStarBurst(engine, x, y) {
  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle  = (i / count) * Math.PI * 2;
    const dist   = 40 + Math.random() * 40;

    const star = engine.spawn({
      id:    `star_${Date.now()}_${i}`,
      asset: 'star_gold',
      x,
      y,
      scale: 0.3 + Math.random() * 0.3,
      zIndex: 5,
    });

    // Fly outward and fade
    const targetX = x + Math.cos(angle) * dist;
    const targetY = y + Math.sin(angle) * dist - 40;

    Promise.all([
      engine.animate(star, { x: targetX, y: targetY }, 500, 'easeOut'),
      engine.animate(star, { alpha: 0 }, 500, 'easeIn'),
    ]).then(() => engine.destroy(star));
  }
},
```

### Step 3.6 — `update()` — Motion and Spawning

```javascript
update(engine, deltaTime) {
  if (this.gameOver) return;

  // Check win condition
  if (this.bubblesPopped >= this.totalBubbles) {
    this.gameOver = true;
    engine.audio.play('win_jingle');
    engine.system.triggerWinState({ graphic: 'star_gold' });
    return;
  }

  // Move existing bubbles upward with sine wave drift
  this.bubbles = this.bubbles.filter(bubble => {
    bubble.y -= bubble._speed * deltaTime;
    bubble._wobble += bubble._wobbleSpeed * deltaTime;
    bubble.x = bubble._startX + Math.sin(bubble._wobble) * bubble._wobbleAmp;

    // Rotate gently
    bubble.angle += 15 * deltaTime;

    // Remove bubbles that drifted off the top of the screen
    if (bubble.y < -100) {
      engine.destroy(bubble);
      return false;
    }
    return true;
  });

  // Spawn new bubbles on a timer (until totalBubbles reached)
  const totalSpawned = this.bubblesPopped + this.bubbles.length;
  if (totalSpawned < this.totalBubbles) {
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this._spawnBubble(engine);
    }
  }
},
```

### Step 3.7 — `onEvent()` — (minimal for this game)

```javascript
onEvent(engine, eventName, payload) {
  // Bubble Pop doesn't need custom events beyond the built-in ones
  // This method is required by the contract even if unused
},
```

---

## Phase 4 — Complete Game File

Here is the final, complete `bubble_pop.js`:

```javascript
// games/bubble_pop.js
// ToyBox Mini-Game: Bubble Pop
// Target age: 2–5 years | Interaction: Tap | Duration: ~2 min

const BUBBLE_ASSETS = ['bubble_red', 'bubble_blue', 'bubble_green', 'bubble_yellow'];

export default {

  config: {
    background:      '#0a1628',
    interactionMode: 'tap',
    assets:          [...BUBBLE_ASSETS, 'star_gold'],
    audio:           ['pop_sound', 'win_jingle'],
  },

  init(engine) {
    this.bubblesPopped = 0;
    this.totalBubbles  = 10;
    this.bubbles       = [];
    this.spawnTimer    = 0;
    this.spawnInterval = 0.8;
    this.gameOver      = false;

    this.scoreLabel = engine.spawn({
      id: 'score_label', text: '⭐ 0',
      fontSize: 52, color: '#FFD700',
      x: engine.width / 2, y: 60, zIndex: 10,
    });

    engine.spawn({
      id: 'prompt', text: 'Pop the bubbles!',
      fontSize: 34, color: 'rgba(255,255,255,0.6)',
      x: engine.width / 2, y: 110, zIndex: 10,
    });

    for (let i = 0; i < 5; i++) this._spawnBubble(engine, true);
  },

  update(engine, deltaTime) {
    if (this.gameOver) return;

    if (this.bubblesPopped >= this.totalBubbles) {
      this.gameOver = true;
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({ graphic: 'star_gold' });
      return;
    }

    this.bubbles = this.bubbles.filter(bubble => {
      bubble.y -= bubble._speed * deltaTime;
      bubble._wobble += bubble._wobbleSpeed * deltaTime;
      bubble.x = bubble._startX + Math.sin(bubble._wobble) * bubble._wobbleAmp;
      bubble.angle += 15 * deltaTime;

      if (bubble.y < -100) { engine.destroy(bubble); return false; }
      return true;
    });

    const totalSpawned = this.bubblesPopped + this.bubbles.length;
    if (totalSpawned < this.totalBubbles) {
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this._spawnBubble(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {},

  _spawnBubble(engine, initialPlacement = false) {
    const asset  = BUBBLE_ASSETS[Math.floor(Math.random() * BUBBLE_ASSETS.length)];
    const scale  = 0.6 + Math.random() * 0.6;
    const x      = 80 + Math.random() * (engine.width - 160);
    const y      = initialPlacement
      ? 200 + Math.random() * (engine.height - 300)
      : engine.height + 80;

    const bubble = engine.spawn({
      id: `bubble_${Date.now()}_${Math.random()}`,
      asset, x, y, scale,
      onTouch: (self) => this._popBubble(self, engine),
    });

    bubble._speed       = 30 + Math.random() * 40;
    bubble._wobble      = Math.random() * Math.PI * 2;
    bubble._wobbleSpeed = 0.8 + Math.random() * 0.8;
    bubble._wobbleAmp   = 15 + Math.random() * 20;
    bubble._startX      = x;

    this.bubbles.push(bubble);
    return bubble;
  },

  _popBubble(bubble, engine) {
    if (bubble._popping) return;
    bubble._popping = true;

    engine.audio.play('pop_sound');
    this.bubbles = this.bubbles.filter(b => b !== bubble);

    engine.animate(bubble, { scale: bubble.scale.x * 1.8, alpha: 0 }, 250, 'easeOut')
      .then(() => engine.destroy(bubble));

    this._spawnStarBurst(engine, bubble.x, bubble.y);

    this.bubblesPopped++;
    this.scoreLabel.text = `⭐ ${this.bubblesPopped}`;
    engine.animate(this.scoreLabel, { scale: 1.3 }, 100, 'easeOut')
      .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 100, 'bounce'));
  },

  _spawnStarBurst(engine, x, y) {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const star  = engine.spawn({
        id: `star_${Date.now()}_${i}`, asset: 'star_gold',
        x, y, scale: 0.3 + Math.random() * 0.3, zIndex: 5,
      });
      Promise.all([
        engine.animate(star, { x: x + Math.cos(angle) * 60, y: y + Math.sin(angle) * 60 - 40 }, 500, 'easeOut'),
        engine.animate(star, { alpha: 0 }, 500, 'easeIn'),
      ]).then(() => engine.destroy(star));
    }
  },

};
```

---

## Phase 5 — Testing Checklist

After building your game:

- [ ] Game appears in the launcher grid (manifest entry added)
- [ ] Game loads without console errors
- [ ] Bubbles appear and float upward with sine drift
- [ ] Tapping a bubble plays sound and triggers pop animation
- [ ] Score label updates and animates on each pop
- [ ] Star burst spawns on each pop
- [ ] After 10 pops, win screen appears
- [ ] Win jingle plays on win screen
- [ ] Exit button returns to launcher
- [ ] Game works offline (disable network, reload from SW cache)
- [ ] No memory leaks: destroyed entities don't appear in `app.stage.children`

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Mutating `this.bubbles` array while iterating it in `update()` | Use `.filter()` to return a new array |
| Forgetting `if (bubble._popping) return` | Prevents double-tap causing two pops |
| Using `setTimeout` for game timers | Use `deltaTime` accumulation instead |
| Accessing `engine.width` in `_spawnBubble` before `engine` is passed | Always pass `engine` as a parameter |
| Spawning entities in `update()` every frame | Use a timer (`spawnTimer`) to throttle |

---

**Previous:** [09 — Audio System](./09-audio-system.md) | **Next:** [11 — Roadmap →](./11-roadmap.md)
