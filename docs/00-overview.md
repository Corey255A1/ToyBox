# ToyBox PWA Engine — Project Overview

> **Vision:** A lightweight, offline-first Progressive Web App that acts as a **mini-game console runtime engine** designed specifically for a tablet viewport.

---

## What Is ToyBox?

ToyBox is a self-contained browser application that mimics the feel of a handheld game console — but runs entirely in the browser with zero native installs required. It is designed with toddlers and young children in mind: large touch targets, bright visuals, forgiving input, and simple but engaging mini-games.

The console **host** handles the launcher UI, asset caching, and canvas lifecycle using **PixiJS**. Individual mini-games are injected as standalone, pure JavaScript modules that communicate with the host via a structured, simplified semantic API called the **Engine Bridge**.

---

## Goals

| Goal | Description |
|------|-------------|
| **Offline-First** | Works without an internet connection via Service Worker caching |
| **Tablet-Optimized** | Designed for touch-first 768px–1280px viewports |
| **Extensible** | New games can be added as simple JS files with zero build tooling |
| **AI-Friendly** | Game modules follow a strict interface so future AI models can generate correct games |
| **Lightweight** | No heavy frameworks; PixiJS + vanilla JS + CSS animations |
| **Kid-Safe** | No external links, no tracking, no ads — pure local experience |
| **Live Previews** | Each launcher tile shows a real animated preview rendered by the game cartridge itself |
| **Configurable** | Full settings panel: audio, age filter, parental PIN, screen timer, and more |
| **Controller Support** | Optional on-screen D-pad + A/B buttons for games that require directional input |

---

## System Architecture — Four Layers

```
┌─────────────────────────────────────────────────────────┐
│  HOST LAYER (HTML5 / CSS3)                              │
│  Launcher UI · Game selection · Settings · Transitions  │
├─────────────────────────────────────────────────────────┤
│  RUNTIME LAYER (PixiJS)                                 │
│  Fullscreen canvas · Sprite rendering · Texture cache   │
├─────────────────────────────────────────────────────────┤
│  GAME LAYER (Pure JS Modules)                           │
│  Individual game scripts · Strict lifecycle interface   │
├─────────────────────────────────────────────────────────┤
│  STORAGE LAYER (Service Worker + IndexedDB)             │
│  Asset caching · Game saves · Score history · Sideload  │
└─────────────────────────────────────────────────────────┘
```

### Layer 1 — Host Layer
The HTML/CSS application shell. Renders the game launcher dashboard, manages screen transitions, and shows native system UI components (settings, back button, loading spinner). Does **not** handle game rendering.

### Layer 2 — Runtime Layer (PixiJS)
A dedicated fullscreen `<canvas>` that activates when a game boots. PixiJS provides:
- Hardware-accelerated 2D rendering via WebGL with Canvas fallback
- Sprite sheet management and texture atlases
- The primary `requestAnimationFrame` game loop (`Ticker`)
- High-DPI resolution scaling for retina/tablet displays

### Layer 3 — Game Layer
Individual mini-games exist as isolated JavaScript ES modules. Each game implements a lifecycle contract (`init`, `update`, `onEvent`, and optional `preview` / `previewUpdate`) and receives an `engine` object — a sandboxed API that abstracts all PixiJS complexity away from game authors.

The optional `preview()` method runs in the launcher tile's mini-canvas to produce a live animated thumbnail of the game, giving players a real look at what they're about to play.

Games that require directional input declare `controller: true` in their config, which activates the on-screen D-pad and A/B button overlay. Controller state is exposed via `engine.input.controller`.

### Layer 4 — Storage Layer
- **Service Worker** caches the PixiJS library, host UI assets, and bundled game scripts so the app loads instantly with no network.
- **IndexedDB** stores dynamic data: the game manifest inventory, user save states, high scores, and any side-loaded game scripts injected at runtime.

---

## Core Data Flow

```
[Tablet Browser Launch]
        │
        ▼
[Service Worker Intercepts → Serves from Cache]
        │
        ▼
[Host UI Renders Launcher Dashboard]
        │
        ▼
[User Taps a Game Tile]
        │
        ▼
[Game Loader fetches JS module string (cache or IndexedDB)]
        │
        ▼
[Dynamic Blob URL import → game module evaluated]
        │
        ▼
[game.init(engine) called → entities spawned]
        │
        ▼
┌──► [Host Ticker Loop — every frame]
│       ├── Read & translate touch/pointer events
│       ├── game.update(engine, deltaTime)
│       └── Dispatch queued engine events → game.onEvent(...)
└───────────────────────────────────────────────┘
        │
        ▼ (game ends or user presses back)
[engine.system.exit() → canvas hidden → Launcher UI returns]
```

---

## Technology Stack

| Technology | Role |
|-----------|------|
| **HTML5 / CSS3** | Application shell, launcher UI, animations |
| **PixiJS v8** | 2D canvas rendering engine |
| **Vanilla JavaScript (ES Modules)** | Host logic, engine bridge, game scripts |
| **Service Worker (Workbox-free)** | Offline asset caching, cache-first strategy |
| **IndexedDB** | Persistent game data, sideloaded games |
| **Web Audio API** | Sound effects and audio playback |
| **PWA Manifest** | Installable app, fullscreen mode, splash screen |

---

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [Project Setup](./01-project-setup.md) | Directory scaffold, PWA manifest, tooling |
| 02 | [Host Layer](./02-host-layer.md) | Launcher UI, CSS, transitions, settings button, tile grid |
| 03 | [Runtime Layer](./03-runtime-layer.md) | PixiJS initialization, canvas lifecycle, resolution |
| 04 | [Game API Contract](./04-game-api-contract.md) | Game module interface including `preview()` and controller config |
| 05 | [Engine Abstractions](./05-engine-abstractions.md) | `engine.*` utility API including `engine.input.controller` |
| 06 | [Service Worker & Storage](./06-service-worker-caching.md) | SW caching strategy, IndexedDB schema |
| 07 | [Game Loader](./07-game-loader.md) | Dynamic script loading, Blob URL evaluation |
| 08 | [Input & Touch System](./08-input-touch-system.md) | Touch input pipeline, gesture handling |
| 09 | [Audio System](./09-audio-system.md) | Audio abstraction, preloading, playback |
| 10 | [Building a Game](./10-building-a-game.md) | Step-by-step tutorial: your first mini-game |
| 11 | [Roadmap](./11-roadmap.md) | Milestones, future features, stretch goals |
| 12 | [Settings System](./12-settings-system.md) | Settings panel, schema, persistence, parental lock, screen timer |
| 13 | [Game Preview System](./13-game-preview-system.md) | Live cartridge previews in launcher tiles, mini engine, fallback |
| 14 | [On-Screen Controller](./14-on-screen-controller.md) | D-pad + A/B overlay, controller state, engine integration |
