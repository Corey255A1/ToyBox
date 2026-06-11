# 04 — Game API Contract

Every ToyBox mini-game must conform to a strict **JavaScript module interface**. This contract enables:
- The host to call lifecycle methods predictably
- AI models to generate correct game scripts with zero ambiguity
- Games to be fully isolated from each other (no shared state)

---

## The Three-Method Lifecycle

A valid ToyBox game exports a **default object** with three methods and one config block:

```javascript
// games/my_game.js

export default {

  // ── 1. Configuration ───────────────────────────────────────────────────────────────────────
  config: {
    background:      '#1a1a2e',   // Canvas background color (hex string)
    interactionMode: 'tap',       // 'tap' | 'drag' | 'controller' | 'none'
    assets: [                     // Texture keys to preload before init
      'bubble_blue',
      'star_gold',
    ],
    audio: [                      // Audio keys to preload before init
      'pop_sound',
      'win_jingle',
    ],
    controller: {                 // Optional — declare controller requirements
      enabled: false,             // true = show on-screen D-pad + A/B buttons
      dpad:    true,
      buttons: { a: { label: 'A' }, b: { label: 'B' } },
    },
  },

  // ── 2. init(engine) — Setup Phase ──────────────────────────────────────────
  // Called ONCE after assets are loaded and canvas is ready.
  // Spawn your initial game objects here.
  init(engine) {
    // Your setup logic
  },

  // ── 3. update(engine, deltaTime) — Real-Time Loop ───────────────────────────────────
  // Called EVERY FRAME by the host Ticker.
  // Keep this fast — avoid heavy computation or DOM access.
  update(engine, deltaTime) {
    // Your per-frame logic
  },

  // ── 4. onEvent(engine, eventName, payload) — Event Broker ─────────────────────
  // Called when engine.emit() fires a named event.
  // Use for deferred or async game logic state changes (e.g. match checks).
  onEvent(engine, eventName, payload) {
    // Your event-driven logic
  },

  // ── 5. preview(miniEngine) — Launcher Tile Animation [OPTIONAL] ──────────────────
  // Called by the launcher tile system in a small isolated mini-canvas.
  // miniEngine is a subset of the full engine — no audio, no system calls.
  // Must loop indefinitely — do NOT call engine.system.exit() here.
  preview(miniEngine) {
    // Spawn lightweight preview scene
  },

  // ── 6. previewUpdate(miniEngine, deltaTime) — Preview Frame Loop [OPTIONAL] ─────
  // Called ~30 times/sec by the launcher preview loop.
  // Animate preview entities here.
  previewUpdate(miniEngine, deltaTime) {
    // Animate your preview scene
  },

};
```

---

## Interface Specification

### `config` Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `background` | `string` | ⬜ No | `'#1a1a2e'` | Hex color for canvas background |
| `interactionMode` | `string` | ⬜ No | `'tap'` | Tells the input system which events to optimize |
| `assets` | `string[]` | ⬜ No | `[]` | Texture asset keys to preload |
| `audio` | `string[]` | ⬜ No | `[]` | Audio asset keys to preload |
| `controller` | `object` | ⬜ No | `null` | On-screen controller config (see below) |

**`interactionMode` values:**

| Value | Use Case |
|-------|---------|
| `'tap'` | Games with discrete tappable objects (memory match, bubble pop) |
| `'drag'` | Games requiring drag gestures (shape sorting, puzzle sliding) |
| `'controller'` | Games driven by D-pad + A/B buttons — tap routing disabled on canvas |
| `'none'` | Non-interactive (animated story scenes, cutscenes) |

**`controller` sub-object:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `controller.enabled` | boolean | `false` | Show on-screen D-pad + A/B overlay |
| `controller.dpad` | boolean | `true` | Include D-pad in overlay |
| `controller.buttons.a` | object | `{ label: 'A' }` | A button config |
| `controller.buttons.b` | object | `{ label: 'B' }` | B button config |

---

### `init(engine)`

Called **once** when the game starts. Use this to:
- Spawn all initial sprites and UI elements
- Set up internal game state (score, timers, grids)
- Register any persistent event listeners

```javascript
init(engine) {
  // State can live on `this` — the game object itself
  this.score = 0;
  this.timer = 30; // seconds
  this.cards = [];

  // Spawn a score label
  this.scoreLabel = engine.spawn({
    id:    'score_label',
    asset: 'ui_score_bg',
    x:     engine.width - 80,
    y:     40,
  });

  // Spawn interactive game objects
  for (let i = 0; i < 12; i++) {
    const card = engine.spawn({
      id:      `card_${i}`,
      asset:   'card_back',
      x:       calculateGridX(i, engine.width),
      y:       calculateGridY(i, engine.height),
      scale:   1.0,
      onTouch: (self) => this.onCardTapped(self, engine),
    });
    this.cards.push(card);
  }
},
```

**Rules:**
- ✅ Store state on `this.*`
- ✅ Call `engine.spawn()` to create visual objects
- ✅ Return value is ignored
- ❌ Do not start timers using `setInterval` / `setTimeout` — use `update()` with `deltaTime` instead
- ❌ Do not access `document` or `window` directly

---

### `update(engine, deltaTime)`

Called **every frame** (~60 times per second). Use this for:
- Moving entities over time
- Counting down timers
- Checking win/lose conditions
- Simple physics (velocity, gravity)

```javascript
update(engine, deltaTime) {
  // Count down timer
  this.timer -= deltaTime;

  if (this.timer <= 0) {
    engine.system.triggerLoseState({ graphic: 'time_up' });
    return; // Stop further updates this frame
  }

  // Move a floating object up and down (sine wave)
  this.elapsedTime = (this.elapsedTime || 0) + deltaTime;
  if (this.floater) {
    this.floater.y = engine.height / 2 + Math.sin(this.elapsedTime * 2) * 20;
  }

  // Check win condition
  if (this.score >= this.targetScore) {
    engine.system.triggerWinState({ graphic: 'star_complete' });
  }
},
```

**Rules:**
- ✅ `deltaTime` is in **seconds** (e.g., `0.016` at 60fps)
- ✅ Use `this.*` for all state — the engine object is reconstructed each frame
- ✅ Return early if game is in a non-update state (paused, win screen)
- ❌ **Never** do heavy computation (sorting large arrays, fetch calls) in `update()`
- ❌ **Never** spawn or destroy entities in `update()` — do it in response to events

---

### `onEvent(engine, eventName, payload)`

Called when the host dispatches a named event via `engine.emit(eventName, payload)`. Use this for:
- Responding to match checks (e.g., do these two cards match?)
- Handling animation completion callbacks
- Inter-entity communication

```javascript
onEvent(engine, eventName, payload) {
  if (eventName === 'match_check') {
    const { cardA, cardB } = payload;

    if (cardA.data.animalId === cardB.data.animalId) {
      // Match! Animate both cards flying away
      engine.animate(cardA.entity, { alpha: 0, scale: 1.5 }, 400);
      engine.animate(cardB.entity, { alpha: 0, scale: 1.5 }, 400);
      this.score += 1;
    } else {
      // No match — flip both cards back over
      engine.animate(cardA.entity, { scale: 0 }, 200)
        .then(() => {
          cardA.entity.texture = PIXI.Assets.get('card_back');
          engine.animate(cardA.entity, { scale: 1 }, 200);
        });
    }
  }

  if (eventName === 'animation_complete') {
    // Handle tween completion
  }
},
```

**Standard Engine Events:**

| Event Name | Payload | Triggered By |
|-----------|---------|-------------|
| `'animation_complete'` | `{ entity, animId }` | `engine.animate()` finishing |
| `'touch_down'` | `{ x, y, pointerId }` | Global touch start (for drag mode) |
| `'touch_up'` | `{ x, y, pointerId }` | Global touch end |
| `'touch_move'` | `{ x, y, dx, dy }` | Touch drag movement |

**Custom events** can be emitted by the game itself using `engine.emit('my_event', data)` — this is useful for decoupling components within a complex game.

---

## Optional Lifecycle Methods

These methods are **not required** but can be implemented for advanced games:

| Method | When Called | Use Case |
|--------|------------|---------|
| `preview(miniEngine)` | Launcher tile renders | Show animated thumbnail in tile canvas (see [doc 13](./13-game-preview-system.md)) |
| `previewUpdate(miniEngine, dt)` | Each preview frame (~30fps) | Animate preview entities |
| `onResize(engine)` | Window/orientation change | Reposition UI elements |
| `onPause()` | App backgrounded or settings opened | Pause timers |
| `onResume()` | App returns to foreground | Resume timers |
| `onDestroy()` | Before stage is cleared | Cancel timers, free custom resources |

---

## Full Contract Example — Memory Match Game

```javascript
// games/memory_match.js

const ANIMAL_IDS = ['cow', 'duck', 'frog', 'pig', 'cat', 'dog'];

export default {

  config: {
    background:      '#0f3460',
    interactionMode: 'tap',
    assets:          ['card_back', 'card_cow', 'card_duck', 'card_frog',
                      'card_pig', 'card_cat', 'card_dog', 'ui_star'],
    audio:           ['flip_card', 'match_success', 'match_fail', 'win_jingle'],
  },

  init(engine) {
    this.score        = 0;
    this.flippedCards = [];
    this.isLocked     = false;  // Prevent tapping during flip animation

    // Create a shuffled deck (12 cards = 6 pairs)
    const pairs = [...ANIMAL_IDS, ...ANIMAL_IDS]
      .sort(() => Math.random() - 0.5);

    this.cards = pairs.map((animalId, index) => {
      const card = engine.spawn({
        id:      `card_${index}`,
        asset:   'card_back',
        x:       this._gridX(index, engine.width),
        y:       this._gridY(index, engine.height),
        scale:   1.0,
        onTouch: (self) => {
          if (!this.isLocked && !self._revealed) {
            this._flipCard(self, animalId, engine);
          }
        },
      });
      card._animalId  = animalId;
      card._revealed  = false;
      return card;
    });
  },

  update(engine, deltaTime) {
    // Win condition: all pairs matched
    if (this.score >= ANIMAL_IDS.length) {
      engine.system.triggerWinState({ graphic: 'ui_star' });
    }
  },

  onEvent(engine, eventName, payload) {
    if (eventName === 'match_check') {
      const [cardA, cardB] = this.flippedCards;
      this.flippedCards = [];

      if (cardA._animalId === cardB._animalId) {
        // Match!
        engine.audio.play('match_success');
        engine.animate(cardA, { alpha: 0 }, 500);
        engine.animate(cardB, { alpha: 0 }, 500);
        this.score++;
      } else {
        // No match — flip back
        engine.audio.play('match_fail');
        setTimeout(() => {
          cardA.texture = PIXI.Assets.get('card_back');
          cardB.texture = PIXI.Assets.get('card_back');
          cardA._revealed = false;
          cardB._revealed = false;
          this.isLocked = false;
        }, 800);
      }
    }
  },

  // ── Private helpers (not part of the contract) ──────────────────────────
  _flipCard(card, animalId, engine) {
    engine.audio.play('flip_card');
    card.texture    = PIXI.Assets.get(`card_${animalId}`);
    card._revealed  = true;
    this.flippedCards.push(card);

    if (this.flippedCards.length === 2) {
      this.isLocked = true;
      // Defer the match check by 600ms so the player can see both cards
      setTimeout(() => engine.emit('match_check'), 600);
    }
  },

  _gridX(index, canvasWidth) {
    const col = index % 4;
    return canvasWidth / 2 - 220 + col * 150;
  },

  _gridY(index, canvasHeight) {
    const row = Math.floor(index / 4);
    return canvasHeight / 2 - 110 + row * 150;
  },

};
```

---

## Contract Validation Checklist

Before submitting a new game, verify:

- [ ] Default export is a plain object literal (not a class)
- [ ] `config` object is present (even if empty `{}`)
- [ ] `init(engine)` is defined
- [ ] `update(engine, deltaTime)` is defined
- [ ] No direct DOM access (`document.*`, `window.*`) inside lifecycle methods
- [ ] No `setInterval` / `setTimeout` used for game timers (use `deltaTime` instead)
- [ ] All assets referenced in `onTouch` / `onEvent` handlers are listed in `config.assets`
- [ ] `engine.system.exit()` or `triggerWinState()` is called when game ends
- [ ] If `controller.enabled: true`, game reads `engine.input.controller` (not touch) for input
- [ ] If `preview()` is defined, `previewUpdate()` is also defined and animates the scene
- [ ] `preview()` does **not** call `miniEngine.system.exit()` or `miniEngine.audio.play()`
- [ ] `preview()` loops by time accumulation — no external `setTimeout` / `setInterval`

---

**Previous:** [03 — Runtime Layer](./03-runtime-layer.md) | **Next:** [05 — Engine Abstractions →](./05-engine-abstractions.md)

**Also see:** [13 — Game Preview System](./13-game-preview-system.md) | [14 — On-Screen Controller](./14-on-screen-controller.md)
