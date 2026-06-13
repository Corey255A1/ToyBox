# ToyBox Mini-Games — Rework Plan

**Date:** June 2026  
**Status:** Pre-Implementation  
**Scope:** All 8 games audited against their design specifications in `docs/games/`

This document describes every discrepancy between the current implementation and the original design intent, and prescribes exactly how to fix each one to produce games that are genuinely fun and
developmentally appropriate for children aged 1–6.

---

## How to Read This Document

- 🔴 **Critical** — Game is broken or misleading; must fix before shipping
- 🟠 **High** — Core mechanic deviates significantly from design intent; noticeably impacts fun
- 🟡 **Medium** — Experience is degraded but playable; strong polish value
- 🟢 **Low** — Minor deviation from spec; nice-to-have fix

---

## Cross-Cutting Issues (Apply to Multiple Games)

Before per-game fixes, these systemic issues should be addressed first.

### CX-1 🔴 `setTimeout` in Game Logic (Ball Launch, Shape Sorter, Flashlight)

**Problem:** Several games use raw `setTimeout(() => {...}, ms)` inside game methods (e.g. `_returnBallToIdle`, `_progressRound`, `_winScene`). If the engine destroys the game between the call and the callback
firing, the callback runs against a destroyed PIXI stage and throws errors or corrupts state.

**Fix:** Replace every `setTimeout` with a delta-time accumulator pattern:
```js
// Instead of: setTimeout(() => doThing(), 1500);
// Use:
this._pendingTimer = 1.5; // seconds

// Then in update():
if (this._pendingTimer > 0) {
  this._pendingTimer -= deltaTime;
  if (this._pendingTimer <= 0) {
    doThing();
  }
}
```
This is engine-lifecycle-safe and requires no cleanup on game exit.

### CX-2 🟡 PIXI.Graphics vs Texture Assets for Simple Shapes

**Problem:** Ball Launch, Sound Board, and Shape Sorter declare sprite texture assets for shapes (circles, squares, triangles, stars, etc.) that can be drawn perfectly in code. These may or may not exist on
disk; the engine falls back to procedural textures but those are lower quality.

**Fix:** For any game that shows simple geometric shapes, draw them directly with `new PIXI.Graphics()` added to `engine.app.stage`. This removes texture dependencies, gives crisp vector rendering at any
resolution, and eliminates loading time.

> **Important engine constraint:** `engine.spawn()` does not support Graphics objects. Games must do `const g = new PIXI.Graphics(); engine.app.stage.addChild(g);` directly, and manage their own cleanup on game
exit.

### CX-3 🟠 `engine.app` Availability Guard

**Problem:** `engine.app` is used directly in Sound Board (`engine.app.renderer.generateTexture`), Flashlight (`isPreviewMode = !engine.app`), and Digital Coloring. If `engine.app` is ever null, games crash on
init.

**Fix:** Wrap any direct `engine.app` usage in a guard. For Sound Board, restructure to use PIXI.Graphics directly instead of renderer-based texture generation.

---

## Game 01: Bubble Pop

**File:** `games/bubble_pop.js`  
**Spec:** `docs/games/01-bubble-pop.md`  
**Fun Heart:** A toddler's delight at popping the one correct bubble out of many — instant gratification with colour, sound, and sparkles.

### BP-1 🔴 Missing `animals` Theme

**Problem:** The spec defines five themes: letters, numbers, shapes, colors, **and animals**. The animals theme is completely absent from `THEME_DATA` and `config.assets`. The spec describes animal names as the
bubble labels (CAT, DOG, etc.) with a companion animal sprite inside the bubble.

**Fix:**
```js
const THEME_DATA = {
  letters:  ['A','B','C','D','E','F','G','H','I','J','K'],
  numbers:  ['1','2','3','4','5','6','7','8','9','10'],
  shapes:   ['●','■','▲','★','♥','♦'],
  colors:   ['BLUE','GREEN','PINK','YELLOW','PURPLE','ORANGE'],
  animals:  ['CAT','DOG','COW','PIG','DUCK','FROG','BEAR','BIRD']
};
```
Add to `config.assets`: `'animal_cat', 'animal_dog', 'animal_cow', 'animal_pig', 'animal_duck', 'animal_frog', 'animal_bear', 'animal_bird'`

For the animals theme, render a small animal sprite inside the bubble alongside the text label.

### BP-2 🔴 Glitter Burst Always Blue (Broken Color Extraction)

**Problem:** `_burstGlitter` calls `getColorFromKeyName(bubble.texture?.alias || 'blue')`. The `texture.alias` property is not reliably available in PixiJS v8 — it almost always resolves to `undefined`, making
every burst blue regardless of bubble colour.

**Fix:** Store the colour key on the entity at spawn time:
```js
bubble._colorHex = getColorFromKeyName(colorKey); // e.g. 'blue' -> 0x2196f3
// In _onBubbleTapped:
this._burstGlitter(bubble.x, bubble.y, bubble._colorHex, engine);
```

### BP-3 🟠 Wrong Tap Has No Screen Shake

**Problem:** The spec says a wrong tap triggers a **screen-level shake**. The code only wiggles the individual bubble. Screen shake is a much more impactful and funny feedback for a toddler.

**Fix:**
```js
// On wrong tap:
engine.audio.play('whoosh_fail');
const stage = engine.app.stage;
engine.animate(stage, { x: -10 }, 0.05, 'easeOut')
  .then(() => engine.animate(stage, { x: 10  }, 0.05, 'linear'))
  .then(() => engine.animate(stage, { x: -8  }, 0.05, 'linear'))
  .then(() => engine.animate(stage, { x: 0   }, 0.05, 'easeOut'));
engine.fx.wiggle(bubble).then(() => { bubble._popping = false; });
```

### BP-4 🟡 Hit Radius Too Small

**Problem:** The spec says `1.5× bubble radius`. The code uses a fixed 70px which can be smaller than needed for toddler hands.

**Fix:** Compute hit radius from bubble scale at spawn:
```js
const assetRadius = 60;
const hitRadius = Math.max(80, bubble.scale.x * assetRadius * 1.5);
bubble.hitArea = new PIXI.Circle(0, 0, hitRadius);
```

### BP-5 🟡 Spawn Continues During Win Sequence

**Problem:** After `isRoundEnd = true`, new bubbles keep spawning through the confetti screen. Add early return guard:
```js
if (this.isRoundEnd) return; // at top of update()
```

### BP-6 🟢 `initialPlacement` Y-Range Can Go Negative on Small Screens

**Fix:**
```js
const yMin = engine.height * 0.3;
const yMax = engine.height * 0.85;
const y = initialPlacement
  ? yMin + Math.random() * (yMax - yMin)
  : engine.height + 80;
```

---

## Game 02: Digital Coloring

**File:** `games/digital_coloring.js`  
**Spec:** `docs/games/02-digital-coloring.md`  
**Fun Heart:** The satisfying sensation of "painting" a grey fog to reveal a colourful animal beneath — like a toddler lottery ticket.

### DC-1 🔴 Mask is Applied to the Wrong Layer (Architecturally Inverted)

**Problem:** The mask is applied to `revealSprite` (the colourful image, zIndex 2), not to `bgFog` (the grey overlay). The fog is at zIndex 1 — below the image — so it's never visible to the player. The entire
reveal architecture is inverted.

**The correct architecture:**
```
zIndex 1: bgSprite     (colourful image — always fully visible below)
zIndex 2: fogSprite    (grey overlay — starts fully opaque, on top)
fogSprite.mask = maskSprite  ← mask on the FOG
```
The mask texture starts solid BLACK (fog opaque everywhere). Drawing WHITE circles creates transparent holes — revealing the image below.

**Fix:**
```js
this.bgSprite  = engine.spawn({ asset: currentKey, zIndex: 1, ... });
this.fogSprite = engine.spawn({ asset: 'scene_fog', zIndex: 2, ... });
this.fogSprite.tint = 0x999999; // grey fog

// Init mask as solid black (fog fully opaque):
this.maskTexture = PIXI.RenderTexture.create({ width, height });
this.maskSprite  = new PIXI.Sprite(this.maskTexture);
this.fogSprite.mask = this.maskSprite;

const initG = new PIXI.Graphics();
initG.rect(0, 0, width, height).fill(0x000000);
engine.renderToTexture(initG, this.maskTexture, true);
initG.destroy();
```

### DC-2 🔴 Brush Circle Position Incorrect in renderToTexture

**Problem:** The code sets `brushGraphics.x = x; brushGraphics.y = y;` then calls `renderToTexture`. In PixiJS v8, renderToTexture captures the object in local space — world transform is NOT applied. The brush
always draws at (0,0).

**Fix:** Pass canvas coordinates directly to the draw call:
```js
_scratchAt(x, y, engine) {
  this.brushGraphics.clear();
  const offsets = [{ dx: 0, dy: 0 }, { dx: -14, dy: 8 }, { dx: 14, dy: 8 }];
  offsets.forEach(o => {
    this.brushGraphics.circle(x + o.dx, y + o.dy, this._currentBrushR).fill(0xffffff);
  });
  engine.renderToTexture(this.brushGraphics, this.maskTexture, false);
}
```

### DC-3 🟠 Brush Radius Growth Missing

**Problem:** The spec says each stroke frame's brush radius should multiply by ~1.08–1.1 during a drag for a "generous" growing feel. This is entirely absent.

**Fix:** Track `_currentBrushR` that grows during drag:
```js
// On drag_start: this._currentBrushR = this.brushR;
// On touch_move: this._currentBrushR = Math.min(this.brushR * 2.0, this._currentBrushR * 1.08);
// On drag_end:   this._currentBrushR = this.brushR;
```

### DC-4 🟠 Auto-Complete Doesn't Animate Fog Fade

**Problem:** On 30% reveal, the code instantly fills the mask. The spec says to tween fog alpha 0 over 600ms for a magical melting effect.

**Fix:**
```js
_triggerAutoComplete(engine) {
  if (this._completing) return;
  this._completing = true;
  engine.animate(this.fogSprite, { alpha: 0 }, 0.6, 'easeOut').then(() => {
    this._spawnSparkles(engine);
    // Subject name after 1.5s
    this._subjectTimer = 1.5;
    this._nextSceneTimer = 3.0;
  });
}
```

### DC-5 🟡 Subject Name Appears Without Delay

**Problem:** The spec says subject name appears 1.5 seconds after the reveal starts. The code shows it immediately.

**Fix:** Use a delta timer (see DC-4 above) — `_subjectTimer` counts down 1.5s in `update()` before spawning the label.

---

## Game 03: Peek-a-Boo

**File:** `games/peek_a_boo.js`  
**Spec:** `docs/games/03-peek-a-boo.md`  
**Fun Heart:** The classic toddler anticipation → surprise → recognition arc. Tap → door creaks open → animal peeks out → name is announced → close → repeat forever.

### PAB-1 🔴 Tapping During Non-CLOSED State is Silently Ignored

**Problem:** The spec says "No failure state — tapping before the door fully closes just restarts the open cycle." The code returns immediately for any non-CLOSED state. A toddler gets zero feedback when
tapping during closing — the game feels completely unresponsive.

**Fix:**
```js
_onDoorTapped(engine) {
  if (this.doorState === 'OPENING' || this.doorState === 'OPEN') {
    engine.audio.play('door_knock'); // acknowledge the tap
    return;
  }
  if (this.doorState === 'CLOSING') {
    // Reverse! Start opening again
    this.doorState = 'OPENING';
    this.openTimer = 0;
    return;
  }
  // CLOSED — normal open sequence
  this._startOpen(engine);
}
```

### PAB-2 🔴 Animal is Far Too Small

**Problem:** The spec says animals should fill ~60% of canvas height. The code scales from a 112px base using `doorH * 0.8 / 112`, producing an animal that's only ~20% canvas height. Tiny and unrecognisable on
a tablet.

**Fix:**
```js
const targetAnimalHeight = engine.height * 0.6;
const animScale = targetAnimalHeight / 112; // base asset height
this.animalSprite.scale.set(animScale);
```

### PAB-3 🟠 Large Name Label Missing During OPEN State

**Problem:** The spec shows a large name label (`"COW! 🐄"`) centred on screen during the OPEN state. The code only updates the small top-bar prompt — unreadable by a 2-year-old at arm's length.

**Fix:** Spawn a dedicated large label when the door opens and destroy it when it closes:
```js
this.nameLabelBig = engine.spawn({
  id: 'animal_name_big',
  text: `${animal.name}! ${animal.emoji}`,
  fontSize: Math.max(48, engine.height * 0.1),
  color: '#fff176',
  x: engine.width / 2,
  y: engine.height * 0.82,
  zIndex: 10
});
engine.animate(this.nameLabelBig, { scale: 1.2 }, 0.15, 'easeOut')
  .then(() => engine.animate(this.nameLabelBig, { scale: 1.0 }, 0.12, 'bounce'));
```

### PAB-4 🟡 Bob Animation Too Fast/Jittery

**Problem:** Code: `animalBobTime * 6`, amplitude 10px. Spec: `animalBobTime * 4`, amplitude 8px. At 6Hz the bob looks nervous, not playful.

**Fix:** `Math.sin(this.animalBobTime * 4) * 8`

### PAB-5 🟡 Spring Constants Don't Match Spec

**Problem:** Code uses stiffness 8.5, damping 0.35. Spec says stiffness 8.0, damping 0.4. Higher damping settles the door faster and more decisively — the right feel for a toddler toy.

**Fix:** `const stiffness = 8.0; const damping = 0.4;`

---

## Game 04: Scratcher

**File:** `games/scratcher.js`  
**Spec:** `docs/games/04-scratcher.md`  
**Fun Heart:** The tactile satisfaction of scratching to reveal. Every swipe produces visible debris chips and progressively exposes a vibrant image.

### SC-1 🔴 Mask Applied to Wrong Layer (Same as Digital Coloring)

**Problem:** Identical architectural error as DC-1. The mask is on `revealSprite` rather than on `scratchBg`. The scratch surface sits at zIndex 1 below the image at zIndex 2 — meaning the scratch surface is
never visible.

**Fix:** Same fix as DC-1 applied here:
```
zIndex 1: revealSprite  (the reveal image — always visible below)
zIndex 2: scratchBg     (the metallic scratch surface — starts fully opaque, on top)
scratchBg.mask = maskSprite
```
Initialize mask as solid BLACK. White circles = holes in the scratch layer.

### SC-2 🟠 Scratch Particle Gravity Too Strong (Debris Invisible)

**Problem:** Code uses `_vy += 500 * dt`. Spec says `300 * dt`. At 500px/s² particles hit the floor almost instantly — the satisfying debris scatter is invisible.

**Fix:** `c._vy += 300 * deltaTime;`
Also ensure initial vertical velocity is upward: `-80 to -120 px/s`.

### SC-3 🟡 Brush Radius 14% Too Large

**Problem:** `brushR = engine.width * 0.08`. Spec says `0.07`. The large brush makes autocomplete fire after only 2–3 swipes before the child gets the scratch-off satisfaction.

**Fix:** `this.brushR = engine.width * 0.07;`

### SC-4 🟡 Flash Wipe Destroys scratchBg Instead of Hiding

**Problem:** `engine.destroy(this.scratchBg)` at peak flash. Spec says `visible = false`.

**Fix:** `this.scratchBg.visible = false;` — then actually destroy in `_loadScene` cleanup.

### SC-5 🟡 Image Counter (🖼 1 / 6) Never Spawned

**Problem:** The spec layout shows an image counter. Children and parents have no sense of session progress.

**Fix:**
```js
this.counterLabel = engine.spawn({
  id: 'image_counter',
  text: `🖼 ${this.imageIndex + 1} / ${this.images.length}`,
  fontSize: Math.max(16, engine.height * 0.03),
  color: '#e0e0e0',
  x: engine.width - 60,
  y: 30,
  zIndex: 12
});
```

### SC-6 🟢 Subject Name Label Slightly Undersized

**Problem:** Code uses `fontSize: engine.height * 0.1`. Spec says `engine.height * 0.12`.

**Fix:** `fontSize: Math.max(64, engine.height * 0.12)`

---

## Game 05: Ball Launch

**File:** `games/ball_launch.js`  
**Spec:** `docs/games/05-ball-launch.md`  
**Fun Heart:** Press a big button, watch a ball arc through the air, smash into colourful targets, and get a satisfying pop + debris burst.

### BL-1 🔴 Target Hit Has No Pop Animation (Most Critical Fun Bug)

**Problem:** On collision, code does `target.visible = false` instantly. The spec says to tween `scale: 1→1.6, alpha: 1→0` over 300ms. Without this animation, targets just disappear — no satisfying pop moment
at all.

**Fix:**
```js
_popTarget(target, engine) {
  if (target._popping) return;
  target._popping = true;
  engine.audio.play('target_pop');
  engine.animate(target, { scale: target.scale.x * 2.0, alpha: 0 }, 0.3, 'easeOut')
    .then(() => {
      engine.destroy(target);
      // schedule respawn via delta timer
    });
  this._spawnDebris(target.x, target.y, engine);
  this.score++;
  this._updateScoreLabel(engine);
}
```

### BL-2 🟠 Physics Constants Too Aggressive

**Problem:** Gravity is 550 (spec: 400), launch speed 750 (spec: 600), angle variation only ±5.7° (spec: ±15°). Ball arcs snap too fast and frequently exit the screen.

**Fix:**
```js
const GRAVITY = 400;
const LAUNCH_SPEED = 600;
const angleVariation = (Math.random() - 0.5) * 0.52; // ±15°
this.ballVx = Math.max(-380, Math.min(380, launchVx));
this.ballVy = Math.min(-380, launchVy);
```

### BL-3 🟠 Ball Start Y Position Too High

**Problem:** Code: `engine.height * 0.72`. Spec: `engine.height * 0.82`.

**Fix:** `this.ballStartY = engine.height * 0.82;`

### BL-4 🟡 Magnet Constants Too Strong

**Problem:** MAGNET_RADIUS=150, STRENGTH=600. Spec: 120, 500.

**Fix:** `const MAGNET_RADIUS = 120; const MAGNET_STRENGTH = 500;`

### BL-5 🟡 Button Should Fully Hide During Flight

**Problem:** Button dims to alpha 0.3 during flight. Spec says hidden.

**Fix:** Animate to `alpha: 0` on launch, `alpha: 1` on ball return to idle.

### BL-6 🟡 Win Screen Missing Star Shower FX

**Problem:** `triggerWinState` is called with no preceding visual celebration.

**Fix:** Before calling `triggerWinState`, spawn 20-30 star particles that rain from the top. Move in `update()` like existing particles. Call win state after 2.5s delay (using delta timer, not setTimeout).

### BL-7 🟢 Replace setTimeout with Delta Accumulator

**Problem:** `_returnBallToIdle` uses `setTimeout(..., 300)`.

**Fix:** See CX-1. `this._returnTimer = 0.3;` handled in `update()`.

---

## Game 06: Sound Board

**File:** `games/sound_board.js`  
**Spec:** `docs/games/06-sound-board.md`  
**Fun Heart:** An infinite cause-and-effect toy. Tap a big shape → hear a funny sound → see the tile bounce. Zero wrong answers. Pure joy.

### SB-1 🔴 Shape Sprites Have No Touch Handler

**Problem:** Shape sprites are spawned at higher zIndex than the panel. In PixiJS, the topmost interactive object gets the tap. Tapping the shape icon (the most natural target for a child) produces **no
response** — only tapping the panel around the shape works.

**Fix:** Make shape sprites and labels non-interactive so taps fall through to the panel:
```js
shapeSprite.interactive = false;
shapeSprite.interactiveChildren = false;
label.interactive = false;
label.interactiveChildren = false;
```

### SB-2 🔴 `engine.app.renderer.generateTexture` Can Crash on Init

**Problem:** If `engine.app` is not exposed, this throws on the first frame and the game never starts.

**Fix:** Replace panel texture generation with a direct PIXI.Graphics approach:
```js
const panel = new PIXI.Graphics();
panel.roundRect(-cellW/2, -cellH/2, cellW, cellH, 18)
  .fill(parseInt(data.color.replace('#',''), 16));
panel.x = cellX;
panel.y = cellY;
panel.interactive = true;
panel.eventMode = 'static';
panel.on('pointertap', () => this._onTileTapped(index, engine));
engine.app.stage.addChild(panel);
```

### SB-3 🟠 Tap Scale Feedback Nearly Invisible (1.05× not 1.25×)

**Problem:** The 1.05× panel bounce is imperceptible on small screens. For a 1-year-old, this visual feedback barely registers.

**Fix:** `engine.animate(tile.panel, { scale: 1.25 }, 0.1, 'easeOut').then(...scale back to 1.0 with bounce...)`

### SB-4 🟡 Panel Tint Flash is Inverted

**Problem:** Setting `tint = 0xffffff` removes the tint — the panel briefly turns white. This is jarring, not a brightness flash.

**Fix:** Use a white overlay sprite that flashes and fades, rather than tint manipulation.

---

## Game 07: Shape Sorter

**File:** `games/shape_sorter.js`  
**Spec:** `docs/games/07-shape-sorter.md`  
**Fun Heart:** The pure cognitive satisfaction of matching piece to hole — shapes, colours, and the satisfying click of a piece snapping home.

### SS-1 🟠 Round 3 Can Repeat Round 2 Shapes

**Problem:** Round 3 picks 4 random shapes from all 8, potentially repeating Round 2's shapes. Toddlers thrive on novelty.

**Fix:**
```js
const round2Ids = new Set(ALL_SHAPES.slice(3, 7).map(s => s.id));
const eligible  = ALL_SHAPES.filter(s => !round2Ids.has(s.id));
roundShapes = eligible.sort(() => Math.random() - 0.5).slice(0, 4);
```

### SS-2 🟠 Snap Animation Missing the Satisfying Overshoot

**Problem:** Code: pickup=1.18 → snap=1.05 → 1.0. Spec: 1.0 → 1.2 → 1.0. The overshoot "click" feel is never reached.

**Fix:**
```js
engine.animate(piece.entity, { x: slot.x, y: slot.y, scale: 1.1 }, 0.15, 'easeOut')
  .then(() => engine.animate(piece.entity, { scale: 1.2 }, 0.08, 'easeOut'))
  .then(() => engine.animate(piece.entity, { scale: 1.0 }, 0.12, 'bounce'));
```

### SS-3 🟡 Slot Colour Not Shown Until After Placement

**Problem:** Slots start dark grey (0x555555). The colour cue that should help children find the correct slot is invisible until AFTER they've successfully placed the piece.

**Fix:** Use a lighter version of the shape colour for empty slots:
```js
entity.tint = (slot.colorHex & 0xfefefe) >> 1 | 0x404040; // darkened colour variant
```
Or add a thin coloured ring overlay around the slot.

### SS-4 🟡 Use PIXI.Graphics for Shapes

**Problem:** 16 texture assets loaded for shapes that could be crisp vector Graphics.

**Fix (recommended):** Implement a `drawShape(key, color, size)` helper using PIXI.Graphics for all pieces and slots. Eliminates 16 asset dependencies.

### SS-5 🟢 Replace setTimeout with Delta Accumulator

**Problem:** `_progressRound` uses `setTimeout(..., 1000)`.

**Fix:** See CX-1.

---

## Game 08: Flashlight

**File:** `games/flashlight.js`  
**Spec:** `docs/games/08-flashlight.md`  
**Fun Heart:** The eerie, delightful anticipation of sweeping a torch through darkness to find hidden friends. Every reveal is a tiny "aha!" moment.

### FL-1 🟠 Penumbra Ring Distribution Wrong

**Problem:** Rings are drawn between `beamRadius * 0.65` and `beamRadius * 1.0`. The inner 65% of the beam has no gradient — it's a hard opaque hole. A real flashlight has a bright centre that softens gradually
from centre to edge.

**Fix:** Distribute rings from 0 to full beamRadius, draw outermost first:
```js
const RINGS = 10;
for (let i = RINGS; i >= 0; i--) {
  const frac   = i / RINGS;
  const r      = this.beamRadius * frac;
  const eAlpha = 1.0 - frac; // full erase at centre, 0 at outer edge
  this.hole.circle(this.lightX, this.lightY, r)
    .fill({ color: 0xffffff, alpha: eAlpha });
}
```

### FL-2 🟡 Win Jingle Plays on Every Scene Transition (3× During Full Game)

**Problem:** `win_jingle` fires at the end of every scene including intermediate ones, devaluing the final moment.

**Fix:**
```js
const isLastScene = this.sceneIndex >= this.sceneQueue.length - 1;
engine.audio.play(isLastScene ? 'win_jingle' : 'scene_complete');
```

### FL-3 🟡 `isPreviewMode` Detection is Fragile

**Problem:** `this.isPreviewMode = !engine.app` — if engine.app is always present, this is always false. If it's missing in real game mode, darkness is never created.

**Fix:** Use a more robust heuristic: `this.isPreviewMode = (engine.app == null) || (engine.width < 250);`

### FL-4 🟡 Object Edge Flicker Near Beam

**Problem:** Fade-in at +3.0*dt vs fade-out at -2.0*dt creates visible flickering at beam edges.

**Fix:** Add a minimum alpha floor: `obj.sprite.alpha = Math.max(0.05, obj.sprite.alpha - 1.5 * dt);`

### FL-5 🟡 Progress Dot Texture Swap Bypasses Engine API

**Problem:** `dot.texture = PIXI.Assets.get('ui_dot_filled')` silently fails if the asset isn't loaded.

**Fix:** Use tint instead:
```js
dot.tint = 0xffd700; // gold star colour
engine.animate(dot, { scale: dot.scale.x * 1.3 }, 0.15, 'bounce');
```

### FL-6 🟢 Replace setTimeout with Delta Accumulator

**Problem:** `_winScene` uses `setTimeout(..., 2500)`.

**Fix:** See CX-1.

---

## Unified Fix Priority Order

| Priority | Fix | Game(s) | Why First |
|----------|-----|---------|-----------|
| 1 | DC-1 / SC-1 — Mask layer inversion | Coloring, Scratcher | Game architecturally broken; reveal never works |
| 2 | BL-1 — Target pop animation | Ball Launch | Most impactful fun fix; targets just disappear |
| 3 | PAB-1 — Allow tap-during-closing | Peek-a-Boo | Game feels broken/unresponsive |
| 4 | PAB-2 — Animal size (60% canvas height) | Peek-a-Boo | Animals too small to recognise |
| 5 | BP-1 — Add animals theme | Bubble Pop | Missing entire design theme |
| 6 | SB-1 — Shape sprite touch passthrough | Sound Board | Core interaction fails on shape icon tap |
| 7 | SB-2 — Remove renderer.generateTexture | Sound Board | Can crash on init |
| 8 | CX-1 — Replace all setTimeouts | All | Lifecycle safety |
| 9 | DC-2 — Brush position in renderToTexture | Coloring | Brush always draws at wrong position |
| 10 | BP-2 — Fix glitter colour | Bubble Pop | Glitter always blue regardless of bubble colour |
| 11 | All physics/constant corrections | BL, FL, PAB | Tuning for correct feel |
| 12 | All scale/label/polish fixes | All | Final polish pass |

---

## Required Image Assets to Generate

The following assets should be generated to replace procedural fallbacks. All images: colourful, friendly, toddler-appropriate cartoon style with clean outlines. No text in images.

### Game 01: Bubble Pop — Animal Theme (256×256px each)

| Asset Key | Description |
|-----------|-------------|
| `animal_cat` | Cute cartoon cat face, forward-facing, orange/white, big eyes |
| `animal_dog` | Cartoon dog face, tongue out, golden/brown, floppy ears |
| `animal_cow` | Cartoon cow face, black spots, pink nose |
| `animal_pig` | Cartoon pig face, round pink snout |
| `animal_duck` | Cartoon duck face, yellow with orange beak |
| `animal_frog` | Cartoon frog face, bright green, big round eyes |
| `animal_bear` | Cartoon bear face, brown, round ears, friendly smile |
| `animal_bird` | Cartoon chick face, yellow with orange beak |

### Game 03: Peek-a-Boo — Full Body Animal Sprites (512×512px each)

These need to be full-body sprites to fill 60% of screen height:

| Asset Key | Description |
|-----------|-------------|
| `animal_cow_body` | Full body cartoon cow, standing forward, black spots |
| `animal_dog_body` | Full body cartoon dog, sitting, happy expression |
| `animal_cat_body` | Full body cartoon cat, sitting upright, tail curled |
| `animal_duck_body` | Full body duck, waddling pose, yellow with orange feet |
| `animal_frog_body` | Full body frog, sitting, arms out, big smile |
| `animal_rabbit_body` | Full body rabbit, sitting, long ears up, white/grey |

### Game 05: Ball Launch — Targets (128×128px each)

| Asset Key | Description |
|-----------|-------------|
| `target_balloon_red` | Cartoon red balloon, tied at bottom with string |
| `target_balloon_blue` | Cartoon blue balloon |
| `target_balloon_yellow` | Cartoon yellow balloon |
| `target_star_gold` | 5-point star, gold with sparkle highlight |
| `target_can` | Silver tin can target with coloured rings |
| `ball_main` | Round colourful ball with stripes or spots, 3D shaded |

### Game 08: Flashlight — Scene Backgrounds (1024×768px) & Objects (128×128px)

| Asset Key | Description |
|-----------|-------------|
| `scene_farm` | Farm background: barn, fields, fences, blue sky, daytime |
| `scene_jungle` | Jungle background: dense foliage, tropical plants, bright colours |
| `scene_ocean` | Underwater scene: coral reef, bubbles, blue-green water |
| `obj_duck` | Small rubber duck icon |
| `obj_frog` | Small cartoon frog icon |
| `obj_star` | Glowing warm yellow star icon |
| `obj_mushroom` | Red mushroom with white spots |
| `obj_butterfly` | Colourful butterfly with open wings |
| `obj_fish` | Bright tropical fish |
| `obj_owl` | Cartoon owl with wide round eyes |
| `obj_snail` | Snail with spiral shell |
| `obj_flower` | Simple 5-petal flower |
| `obj_bee` | Bee with yellow/black stripes and wings |
| `obj_crab` | Red crab with claws raised |
| `obj_turtle` | Green turtle with shell pattern |

### Game 02: Digital Coloring — Reveal Images (1024×768px each)

Bold, flat cartoon style — bright colours that will wow a toddler when the fog clears:

| Asset Key | Description |
|-----------|-------------|
| `scene_dog` | Cartoon dog illustration, vivid/bold colours |
| `scene_cat` | Cartoon cat illustration |
| `scene_elephant` | Cartoon elephant illustration |
| `scene_fish` | Cartoon fish in underwater scene |
| `scene_flower` | Flower garden illustration |
| `scene_rainbow` | Rainbow over a green meadow with clouds |

### Shared UI Assets

| Asset Key | Size | Description |
|-----------|------|-------------|
| `ui_dot_empty` | 32×32px | Small grey circle (progress dot, unfilled) |
| `ui_dot_filled` | 32×32px | Small gold star (progress dot, filled) |
| `ui_star` | 64×64px | 5-point gold star for win animations |
| `particle_glitter` | 24×24px | Small sparkle/diamond shape |
| `prompt_bg` | 400×80px | Rounded rectangle background for prompt text, semi-transparent |
| `btn_launch_bg` | 512×120px | Rounded pill button background, red/orange gradient |
| `tray_bg` | 1024×200px | Wooden tray background for shape sorter |
| `scene_fog` | 1×1px | Solid white pixel (tinted grey in code as fog layer) |

---

*Total new assets required: ~50 images*  
*Priority order for generation: Peek-a-Boo animals (biggest visual impact) → Flashlight scene backgrounds → Digital Coloring reveal images → Ball Launch targets → Bubble Pop animal icons → UI elements*

---

*End of Rework Plan*