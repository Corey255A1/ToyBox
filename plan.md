Here is the comprehensive, production-ready architectural prompt. It is structured explicitly for an advanced AI agent (like Gemini Pro or Claude Code) to instantly understand the system topology and generate the starter codebase.

---

# Project Specification Prompt: "ToyBox PWA Engine"

You are an expert system architect and senior software engineer. Scaffolding a lightweight, offline-first Progressive Web App (PWA) that acts as a **mini-game console runtime engine** designed specifically for a tablet viewport.

The console host handles the UI launcher, asset caching, and canvas lifecycle using **PixiJS**, while individual mini-games are injected as standalone, pure JavaScript modules that communicate via a structured, simplified semantic API.

---

## 1. Core Architecture Topology

* **Host Layer (HTML5/CSS3):** Renders the main console dashboard, game selection screen, settings, and native system components using flat layouts and smooth CSS animations.
* **Runtime Layer (PixiJS):** A dedicated, fullscreen canvas context that activates upon game boot. PixiJS handles hardware-accelerated 2D rendering and asset sprite sheets.
* **Game Layer (Pure JS Strings/Files):** Individual games exist completely as separate, non-compiled JavaScript object literals/modules matching a strict lifecycle interface.
* **Storage & Caching (Service Worker + IndexedDB):** * **Service Worker:** Caches the PixiJS library, the main UI assets, core host code, and static internal game scripts via a strict **Cache-Only** or **Cache-First** routine.
* **IndexedDB:** Acts as the game cartridge inventory system, storing dynamic game manifests, user game-saves, high scores, and newly side-loaded game JavaScript text strings.



---

## 2. Master System API & Execution Lifecycle

When a game is selected from the HTML UI, the host application clears out any previous game state, displays the canvas, resizes it carefully to match the high-DPI resolution of the tablet screen, and kicks off the execution lifecycle.

### The Host Ticker & Sandbox Bridge

The host handles the primary requestAnimationFrame loop, calculates precise system `deltaTime` intervals, and monitors global input coordinates. It hides raw canvas drawing functions entirely and passes a highly semantic `engine` utility object to the running game.

```
[Main Menu UI Selection] 
        │
        ▼
[Fetch Game Module String] ──► [Evaluate Blob URL / Import]
        │
        ▼
[Invoke .init(engine)] ──► Spawns baseline components & interactive nodes
        │
        ▼
┌──► [Host Frame Ticker Loop]
│       │
│       ├──► [Read & Translate Touch Interactions]
│       ├──► [Invoke Game .update(engine, deltaTime)]
│       └──► [Evaluate Global Event Broker Listeners]
│               │
└───────────────┘

```

---

## 3. The Code Contracts (What the AI Must Write)

### A. The Game Manifest Configuration

The app parses a localized JSON list representing the launcher menu.

```json
[
  {
    "id": "memory-match",
    "title": "Animal Matching Puzzle",
    "description": "Flip and match pairs of cute animals!",
    "icon": "ui_icon_cow",
    "scriptPath": "games/memory_match.js"
  }
]

```

### B. The Unified JavaScript Interface

Every mini-game script must conform to this explicit module contract:

```javascript
export default {
  // Config parameters consumed directly by the engine host framework
  config: {
    background: '#F0F4F8',
    interactionMode: 'tap' // Tells host how to optimize touch listening
  },

  // 1. Setup Phase: Spawns the static grid, game objects, or layouts
  init(engine) {
    this.score = 0;
    
    // Abstracted spawning example
    engine.spawn({
      id: 'target_node',
      asset: 'bubble_blue',
      x: engine.width / 2,
      y: engine.height / 2,
      scale: 1.2,
      onTouch: (self) => {
        engine.audio.play('pop_sound');
        self.destroy();
        this.score++;
      }
    });
  },

  // 2. Global Event Broker: Communicates abstract game logic state changes
  onEvent(engine, eventName, payload) {
    if (eventName === 'match_check') {
      // Game-specific logic evaluation goes here
    }
  },

  // 3. Real-Time Logic: Checked every frame loop (ticks, simple velocities)
  update(engine, deltaTime) {
    if (this.score >= 10) {
      engine.system.triggerWinState({ graphic: 'star_complete' });
    }
  }
};

```

---

## 4. Host Utility Abstractions (The "Engine" Parameters)

To maximize the accuracy of game updates written by downstream AI models, the `engine` pipeline argument abstracts complex systems into simple, declarative buckets:

* **`engine.spawn(options)`**: Instantiates a PixiJS container/sprite object under the hood, binds coordinates, sets anchor points to center ($0.5$), and injects it into the rendering stack.
* **`engine.audio.play(assetId)`**: Invokes HTML5 Audio or Web Audio API playback for a pre-loaded internal sound snippet.
* **`engine.animate(entity, targetProperties, duration, easing)`**: An ultra-lightweight linear interpolation (Lerp) / tween framework allowing objects to bounce, shake, or swell when tapped—critical for toddler engagement without writing custom differential physics formulas.
* **`engine.system.exit()`**: Immediately stops the game animation frame ticker loop, zeroes out entity matrices, clears references for garbage collection, and shifts visibility back to the HTML/CSS home dashboard.

---

## 5. Next Execution Steps for Scaffolding

1. **Generate the Directory Foundation:** Setup `index.html`, `styles.css`, `app.js` (Host Engine), `sw.js` (Service Worker), and an empty `/games` folder.
2. **Initialize PixiJS Setup:** Implement the basic fullscreen resizing architecture in `app.js` along with basic texture loader management for a mock asset manifest.
3. **Construct the Dynamic Script Loader:** Write the dynamic `import()` or Blob evaluation logic that converts raw string text scripts into active runtime modules.
4. **Inject the Exit Loop UI:** Add a permanent, small system close button or hardcoded gesture handling at the host application layer so the tablet can always reliably drop back to the main launcher screen.