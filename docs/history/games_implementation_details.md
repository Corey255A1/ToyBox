# ToyBox Games Implementation Details

This document catalogs the implementation architecture, code structure, physics formulas, rendering techniques, and toddler UX design details for each of the 8 mini-games implemented for the ToyBox Progressive Web App (PWA) Console Engine.

---

## 1. Shared Architectural Patterns

Across the game suite, several recurring engine patterns were utilized to achieve resolution-independent, high-performance (60fps), and network-resilient toddler gameplay.

### A. WebGL RenderTexture Masking Pattern
* **Applied in**: [Digital Coloring](file:///home/corey/code/toybox/games/digital_coloring.js) and [Scratcher](file:///home/corey/code/toybox/games/scratcher.js)
* **Mechanics**: Instead of using CPU-heavy canvas drawing or standard masks, the engine creates a dynamic WebGL render texture (`PIXI.RenderTexture`). On drag coordinates `(x, y)`, the games stamp filled `PIXI.Graphics` shapes onto the render texture via `engine.renderToTexture(graphics, texture, false)`. The texture is then mapped to a sprite which masks the foreground layer:
  ```javascript
  this.maskTexture = PIXI.RenderTexture.create({ width, height });
  this.maskSprite = new PIXI.Sprite(this.maskTexture);
  this.revealSprite.mask = this.maskSprite;
  ```

### B. Euler Physics & Spring Pattern
* **Applied in**: [Peek-a-Boo](file:///home/corey/code/toybox/games/peek_a_boo.js) and [Ball Launch](file:///home/corey/code/toybox/games/ball_launch.js)
* **Mechanics**: High-performance, lightweight physics integration implemented directly inside the `update` tick loop without using external heavy physics engines.
  * **Spring Swing (Peek-a-Boo)**:
    ```javascript
    this.angularVelocity += (targetAngle - this.doorAngle) * stiffness * dt;
    this.angularVelocity *= (1 - damping);
    this.doorAngle       += this.angularVelocity * dt;
    ```
  * **Parabolic Arc (Ball Launch)**:
    ```javascript
    this.ballVy += GRAVITY * dt;
    this.ballX  += this.ballVx * dt;
    this.ballY  += this.ballVy * dt;
    ```

### C. Procedural Texture & Audio Fallback
* **Applied in**: All games
* **Mechanics**: In the event that a server has no asset files on disk, [engine.js](file:///home/corey/code/toybox/engine/engine.js) intercepts the failure and procedurally draws the graphics vector equivalent (gradients, shines, outlines, wooden textures, shapes) using `PIXI.Graphics`, caching it in `PIXI.Cache` for instant reuse. Missing audio prompts generate real-time oscillator chimes and synth beeps in [audio.js](file:///home/corey/code/toybox/engine/audio.js).

---

## 2. Detailed Game Implementation Catalogue

### 1. Bubble Pop
* **File**: [bubble_pop.js](file:///home/corey/code/toybox/games/bubble_pop.js)
* **Mode**: `tap` | **Target Age**: 2–6 years
* **Core Loops**:
  * **`init()`**: Selects a random target theme (`letters`, `numbers`, `shapes`, or `colors`) and chooses a target character (e.g. `'B'`, `'7'`). Spawns prompt headers, score displays, and 4 starting bubbles.
  * **`update()`**: Wobbles active bubbles using a sine-wave displacement over time: `b.x = b._startX + Math.sin(b._wobble) * b._wobbleAmp`. Cleans up bubbles that float past the ceiling and spawns new ones. Handles glitter particle velocities.
  * **`onEvent()`**: Triggers popping when tapped.
* **Toddler UX Details**:
  * **Forgiving Hit Box**: The bubble's hit area is padded to a large `PIXI.Circle` with a 70px radius (1.5x scale) to accommodate inaccurate taps.
  * **Zero Penalty decoy taps**: Tapping a decoy bubble plays a gentle `whoosh_fail` sound and wiggles the bubble using `engine.fx.wiggle(bubble)`. The bubble remains active on screen.
  * **Confetti Shower Celebration**: Popping the 10th correct target spawns 45 colorful confetti particles at the top of the screen drifting down with rotation and air-drag fading. The win dialog is delayed by 2.5s to let the toddler watch the shower.
* **Attract Preview**: Spawns 3 offset colored bubbles that float upwards and wobble, resetting every 3 seconds.

---

### 2. Digital Coloring
* **File**: [digital_coloring.js](file:///home/corey/code/toybox/games/digital_coloring.js)
* **Mode**: `drag` | **Target Age**: 2–5 years
* **Core Loops**:
  * **`init()`**: Shuffles the scene queue (`scene_lion`, `scene_elephant`, etc.) and loads the first illustration. Spawns prompt titles, progress bars, and initializes the coordinates.
  * **`update()`**: Updates the progress bar percentage scale and handles random sparkle bursts during completion celebrations.
  * **`onEvent()`**: Captures `touch_move` / `touch_down` coordinates to stamp a white circular brush onto the mask RenderTexture.
* **Toddler UX Details**:
  * **Huge Brush**: The brush size is dynamically calculated as 9% of screen width (`engine.width * 0.09`) to paint huge swathes instantly.
  * **Lag-Free 30% Autocomplete**: To prevent heavy GPU-to-CPU pixel readbacks, the game maps the screen into a 10x8 collision grid. As the brush drags, grid cells intersect and flip to `true`. When $\ge 30\%$ of cells are filled, a full-screen auto-complete reveals the rest of the illustration.
  * **Celebration phase**: Tweens the colorful illustration scale, plays a custom animal sound, and displays the animal name in large letters (e.g. `"Lion! 🦁"`) for 3.2s before advancing.
* **Attract Preview**: Simulates a dragging motion by slowly fading the grey fog overlay to reveal the underlying lion.

---

### 3. Peek-a-Boo
* **File**: [peek_a_boo.js](file:///home/corey/code/toybox/games/peek_a_boo.js)
* **Mode**: `tap` | **Target Age**: 1–4 years
* **Core Loops**:
  * **`init()`**: Sets up a door frame, a rotating wooden door, progress dots, and hides a shuffled animal card behind the door.
  * **`update()`**: Evaluates spring physics on the door angle converge state: `CLOSED` $\rightarrow$ `OPENING` $\rightarrow$ `OPEN` $\rightarrow$ `CLOSING`. Fades animal sprite `alpha` dynamically based on how far the door has opened.
  * **`onEvent()`**: Captures pointer taps on the door frame to kick off the opening velocity.
* **Toddler UX Details**:
  * **Spring Inertia**: The door swings open past $-90^\circ$ and oscillates satisfyingly before settling.
  * **Tap Hint Overlay**: A bouncing finger pointer text fades out after the first successful open action to keep UI clean.
  * **Name announcement**: Plays the animal sound immediately on tap and reveals the name (e.g. `"Pig! 🐷"`) during the open state.
* **Attract Preview**: Door swings open, a cow bobs for 1.5s, then the door swings shut, looping every 4 seconds.

---

### 4. Scratcher
* **File**: [scratcher.js](file:///home/corey/code/toybox/games/scratcher.js)
* **Mode**: `drag` | **Target Age**: 2–5 years
* **Core Loops**:
  * **`init()`**: Sets up the metallic gold/silver background surface, matching illustration, and progress tracking.
  * **`update()`**: Applies gravity velocities and fades out silver debris chips spawned on the scratch points.
  * **`onEvent()`**: Captures drags and stamps an irregular offset circle cluster (3 circles grouped) to mimic real scratchcard tearing.
* **Toddler UX Details**:
  * **Debris Chips**: Spawns metallic-tinted chips that pop upwards and fall down.
  * **Flash Wipe Auto-Complete**: Crossing the 30% grid threshold triggers a bright white overlay (`overlay_white`) that scales to the screen, flashes to full opacity, removes the scratch layer, and fades out, revealing the illustration.
  * **Text Shadow Pop**: The revealed name pops onto the screen with a bounce scale and a dark stroke outline drop-shadow.
* **Attract Preview**: Fades the scratch card out slowly to reveal a rubber duck.

---

### 5. Ball Launch
* **File**: [ball_launch.js](file:///home/corey/code/toybox/games/ball_launch.js)
* **Mode**: `tap` | **Target Age**: 2–5 years
* **Core Loops**:
  * **`init()`**: Spawns a 3x3 staggered grid of target objects, launch buttons, and coordinates.
  * **`update()`**: Implements simple gravity physics on the ball when launched, performs wall bounces on horizontal boundaries, checks target collisions, and applies magnet assist.
  * **`onEvent()`**: Captures button presses to trigger the flight sequence.
* **Toddler UX Details**:
  * **Magnet Assist Proximity**: While in flight, the ball looks for the nearest active target. If it is within 150px, it applies a pull force:
    ```javascript
    const pull = (1 - minDist / MAGNET_RADIUS) * MAGNET_STRENGTH;
    this.ballVx += (dx / minDist) * pull * dt;
    this.ballVy += (dy / minDist) * pull * dt;
    ```
    This redirects near-misses dynamically, ensuring the player feels successful.
  * **Aim Assistance**: On launch, the ball calculates its initial angle directly aimed at the nearest target, adding a soft $\pm 12^\circ$ randomness.
  * **Interactive Target pops**: Spawns 8 colored particles on target pop and deflects the ball slightly. Targets automatically respawn after 1.6s.
* **Attract Preview**: Launches the ball, pops a red balloon, and resets.

---

### 6. Sound Board
* **File**: [sound_board.js](file:///home/corey/code/toybox/games/sound_board.js)
* **Mode**: `tap` | **Target Age**: 1–4 years
* **Core Loops**:
  * **`init()`**: Divides the viewport into a 2x3 grid. Generates solid white rounded rectangle textures, spawning them with a color tint. Spawns centered shape child sprites and labels.
  * **`update()`**: Free play module (no ticks required).
  * **`onEvent()`**: Listens for touch taps on individual panels.
* **Toddler UX Details**:
  * **White Flash Feedback**: To make taps feel premium, the panel's tint is set to white (`0xffffff`) to fully brighten the color, resetting back to the shape's color tint after a 150ms timeout.
  * **Micro Scale Pops**: The panel wiggles and scales up, and the centered shape performs a pop animation (`scale * 1.35`) and bounces back.
  * **Multi-Touch Safe**: No locks are placed on events, allowing toddlers to mash several shapes simultaneously.
* **Attract Preview**: Sequentially pop-scales each shape block, wrapping around.

---

### 7. Shape Sorter
* **File**: [shape_sorter.js](file:///home/corey/code/toybox/games/shape_sorter.js)
* **Mode**: `drag` | **Target Age**: 2–5 years
* **Core Loops**:
  * **`init()`**: Generates 3 (Round 1) or 4 (Rounds 2 & 3) dark slot silhouettes and places matching colored pieces into a brown wooden tray at the bottom.
  * **`update()`**: Updates the alpha of active slot glows.
  * **`onEvent()`**: Handles dragging state tracking (`_startDrag`, `_continueDrag`, `_endDrag`).
* **Toddler UX Details**:
  * **Piece Lift**: Dragging a piece scales it to `1.18` to feel like it is lifted off the canvas.
  * **Proximity Glow**: Approaching the correct slot activates a pulsing radial glow behind the slot.
  * **Auto-Snap on Drag**: If a toddler drags a piece very close ($\le 42\%$ of cell size), the piece immediately snaps into slot center and locks even before lifting their finger.
  * **Wrong Slot Wiggle**: Releasing a shape near a wrong slot plays a fail sound, wiggles the slot silhouette, and tweens the piece back to its home tray.
* **Attract Preview**: A triangle slides from the tray up to its slot, snaps, triggers a 6-particle burst, and resets.

---

### 8. Flashlight
* **File**: [flashlight.js](file:///home/corey/code/toybox/games/flashlight.js)
* **Mode**: `drag` | **Target Age**: 2–5 years
* **Core Loops**:
  * **`init()`**: Loads jungle, ocean, or space scenes. Spawns hidden items (completely transparent `alpha = 0.0`) and indicators.
  * **`update()`**: Clears the black darkness canvas overlay (`alpha = 0.88`) and punches a penumbra cutout hole. Checks if undiscovered items are illuminated.
  * **`onEvent()`**: Updates the flashlight beam coordinate coordinates.
* **Toddler UX Details**:
  * **Penumbra Falloff**: Cutout circle is drawn as 8 concentric rings:
    ```javascript
    for (let i = 8; i >= 0; i--) {
      const r = this.beamRadius * (0.65 + 0.35 * (i / 8));
      const eraseAlpha = 1.0 * (1.0 - i / 8);
      this.hole.circle(this.lightX, this.lightY, r).fill({ color: 0xffffff, alpha: eraseAlpha });
    }
  ```
  * **Fade Discoveries**: Items fade in when illuminated, pulsing their halo. Once fully visible, they unlock permanently, play their sound, and show a popup label.
  * **Lights On win state**: Discovering all 5 items tweens the darkness layer alpha to `0.0` (turning the lights on!) so the toddler can view the fully revealed scene before progression.
* **Attract Preview**: Slides a beam left-to-right, revealing a fox and frog.

---

## 3. Deployment & Precaching Integration

* **Manifest Registration**: All scripts are linked in [manifest.json](file:///home/corey/code/toybox/games/manifest.json) under their respective tags, ages, icons, and titles.
* **precaching**: Precached in [sw.js](file:///home/corey/code/toybox/sw.js) `PRECACHE_URLS` array to support 100% offline gameplay.
