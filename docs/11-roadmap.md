# 11 — Roadmap

This document outlines the phased build plan for ToyBox, from MVP to full production. Each milestone has clear acceptance criteria and a set of deliverables.

---

## Milestone Summary

```
Phase 1: Foundation ────────────────────────── Weeks 1–2
Phase 2: Core Engine ───────────────────────── Weeks 2–3
Phase 3: First Game ────────────────────────── Weeks 3–4
Phase 4: Polish & PWA ──────────────────────── Weeks 4–5
Phase 5: Expansion ─────────────────────────── Weeks 5–8
Phase 6: Sideloading & AI Integration ─────── Weeks 8–12
Phase 7: Distribution & Monitoring ─────────── Ongoing
```

---

## Phase 1 — Foundation (Weeks 1–2)

> **Goal:** A working app shell that installs as a PWA and loads the launcher dashboard.

### Deliverables

| Task | Status | Notes |
|------|--------|-------|
| Directory scaffold created | ⬜ | See [01 — Project Setup](./01-project-setup.md) |
| `index.html` with correct PWA meta tags | ⬜ | |
| `manifest.json` with fullscreen + landscape | ⬜ | |
| `styles.css` with design token system | ⬜ | |
| `app.js` bootstraps + renders launcher | ⬜ | |
| `sw.js` registers and caches app shell | ⬜ | |
| `games/manifest.json` with 1 placeholder entry | ⬜ | |
| PixiJS vendored in `/lib/pixi.min.js` | ⬜ | |
| App is installable on Android/iOS | ⬜ | |

### Acceptance Criteria

- [ ] Opening `localhost:8080` shows the ToyBox launcher UI
- [ ] App can be "Add to Home Screen" and launches in fullscreen landscape
- [ ] DevTools → Application → Service Workers shows the SW as "Activated"
- [ ] DevTools → Application → Cache Storage shows all precached files
- [ ] Disabling the network and reloading still shows the launcher

---

## Phase 2 — Core Engine (Weeks 2–3)

> **Goal:** PixiJS runtime, engine bridge, input, audio, storage, settings, and preview subsystems all wired together and tested.

### Deliverables

| Task | Status | Notes |
|------|--------|-------|
| `engine/engine.js` — PixiJS init + Ticker + entity lifecycle | ⬜ | [03](./03-runtime-layer.md) |
| `engine/engine.js` — `buildEngineObject()` factory | ⬜ | [05](./05-engine-abstractions.md) |
| `engine/engine.js` — Tween system (`engine.animate`) | ⬜ | [05](./05-engine-abstractions.md) |
| `engine/engine.js` — `engine.fx.*` micro-animations | ⬜ | [05](./05-engine-abstractions.md) |
| `engine/engine.js` — `engine.input.controller` bridge | ⬜ | [14](./14-on-screen-controller.md) |
| `engine/loader.js` — Blob URL module evaluation | ⬜ | [07](./07-game-loader.md) |
| `engine/loader.js` — Game contract validation | ⬜ | [07](./07-game-loader.md) |
| `engine/input.js` — Pointer Event listeners | ⬜ | [08](./08-input-touch-system.md) |
| `engine/input.js` — Coordinate normalization | ⬜ | [08](./08-input-touch-system.md) |
| `engine/input.js` — Tap vs drag classification | ⬜ | [08](./08-input-touch-system.md) |
| `engine/audio.js` — Web Audio context + preload | ⬜ | [09](./09-audio-system.md) |
| `engine/audio.js` — `play()`, `stop()`, `setVolume()` | ⬜ | [09](./09-audio-system.md) |
| `engine/storage.js` — IndexedDB + all 4 stores | ⬜ | [06](./06-service-worker-caching.md) |
| `engine/storage.js` — settings, gameSaves, highScores, sideloaded | ⬜ | [06](./06-service-worker-caching.md) |
| `engine/settings.js` — SETTINGS_SCHEMA + get/set/onChange | ⬜ | [12](./12-settings-system.md) |
| `engine/controller.js` — overlay show/hide + state model | ⬜ | [14](./14-on-screen-controller.md) |
| `engine/previewer.js` — mini engine + Canvas 2D fallback | ⬜ | [13](./13-game-preview-system.md) |

### Acceptance Criteria

- [ ] A dummy game module (skeleton only) loads and shows a blank colored canvas
- [ ] `engine.spawn()` adds a colored circle to the stage
- [ ] Tapping the circle triggers `onTouch` callback
- [ ] `engine.animate(entity, { alpha: 0 }, 500)` fades the entity in DevTools
- [ ] `engine.audio.play('pop_sound')` plays audio on tap
- [ ] `engine.system.exit()` returns to launcher
- [ ] `storage.set('settings', 0.8, 'volume')` persists across refresh (check DevTools → IndexedDB)
- [ ] Settings panel opens from `⚙️` button and volume change persists
- [ ] Launcher tile shows animated preview canvas (or styled fallback) for each game
- [ ] Controller overlay shows D-pad and A/B buttons for a dummy controller-mode game

---

## Phase 3 — First Game: Memory Match (Weeks 3–4)

> **Goal:** The first complete, fully-polished mini-game is playable and demonstrates all engine capabilities.

### Deliverables

| Task | Status | Notes |
|------|--------|-------|
| `games/memory_match.js` — grid layout | ⬜ | [04](./04-game-api-contract.md) |
| Card flip animation (`engine.fx.flipCard`) | ⬜ | |
| Match check logic in `onEvent` | ⬜ | |
| Score tracking + display | ⬜ | |
| Win state trigger on all pairs matched | ⬜ | |
| Sound effects: flip, match, fail, win | ⬜ | |
| Sprite assets: 6 animal card faces + card back | ⬜ | |
| High score saved to IndexedDB | ⬜ | |

### Acceptance Criteria

- [ ] 12-card grid (6 pairs) renders correctly on 768px+ screens
- [ ] Tapping a face-down card flips it over (shows animal)
- [ ] Matching pair stays face-up and fades out with star burst
- [ ] Non-matching pair flips back over after 0.8 seconds
- [ ] Cannot tap a third card while two are face-up (locked state)
- [ ] Win screen appears after all 6 pairs matched
- [ ] High score shown on win screen
- [ ] Game is fully playable offline

---

## Phase 4 — Polish & PWA Hardening (Weeks 4–5)

> **Goal:** The app feels premium, loads fast, and handles edge cases gracefully. All three new systems (settings, previews, controller) fully integrated.

### Deliverables

| Task | Status | Notes |
|------|--------|-------|
| PWA icons — 192px and 512px | ⬜ | Maskable |
| Splash screen on iOS | ⬜ | Apple-specific meta tags |
| Orientation lock to landscape | ⬜ | Screen Orientation API |
| Loading screen with spinner between tile tap and game start | ⬜ | |
| Error boundary: failed game load shows message, returns to launcher | ⬜ | |
| Settings panel — all controls wired (volume, toggles, select, PIN) | ⬜ | [12](./12-settings-system.md) |
| Parental PIN flow — 4-digit numpad, shake on wrong PIN | ⬜ | [12](./12-settings-system.md) |
| Screen timer — warns at 80%, locks at 100% | ⬜ | [12](./12-settings-system.md) |
| Age filter — refreshes launcher grid in real-time on change | ⬜ | [12](./12-settings-system.md) |
| Live preview canvases in launcher tiles (all games) | ⬜ | [13](./13-game-preview-system.md) |
| Preview staggered init (150ms between tiles) | ⬜ | [13](./13-game-preview-system.md) |
| Preview fallback Canvas 2D placeholder for games with no `preview()` | ⬜ | [13](./13-game-preview-system.md) |
| On-screen controller overlay — D-pad + A/B CSS + pointer events | ⬜ | [14](./14-on-screen-controller.md) |
| Controller diagonal detection (upLeft, upRight, etc.) | ⬜ | [14](./14-on-screen-controller.md) |
| Controller `pressed.*` one-frame flags | ⬜ | [14](./14-on-screen-controller.md) |
| Exit button repositions to top-center when controller active | ⬜ | [14](./14-on-screen-controller.md) |
| Memory leak audit: no orphaned sprites after 10 game cycles | ⬜ | |
| Performance: 60fps on iPad Air (2020) minimum | ⬜ | Chrome DevTools Perf |
| Lighthouse PWA score ≥ 90 | ⬜ | |

### Acceptance Criteria

- [ ] Installing on iPad → opens fullscreen, no browser UI visible
- [ ] App loads in < 2 seconds on first visit (SW precache hit)
- [ ] Rotating tablet to portrait shows a friendly "Rotate device" message
- [ ] Settings panel opens, volume change persists after closing
- [ ] Parental PIN blocks settings access — wrong PIN shakes and resets
- [ ] Age filter "2–4" hides games tagged for older age groups
- [ ] Every launcher tile shows an animated preview or styled fallback
- [ ] Preview animations pause when settings panel opens, resume on close
- [ ] Controller games show D-pad + A/B overlay; tap-only games show no overlay
- [ ] D-pad diagonal (upRight) registers when both Up and Right held simultaneously
- [ ] No console errors during normal gameplay session
- [ ] Lighthouse audit passes PWA checklist

---

## Phase 5 — Game Expansion (Weeks 5–8)

> **Goal:** ToyBox ships with 4–6 diverse mini-games covering different skill areas, including at least one controller-enabled game.

### Planned Mini-Games

| Game ID | Title | Type | Skills | Controller | Status |
|---------|-------|------|--------|-----------|--------|
| `memory-match` | Animal Matching | Memory | Recognition, matching | ✕ | Phase 3 |
| `bubble-pop` | Bubble Pop | Tap frenzy | Motor skills, counting | ✕ | ⬜ |
| `color-sort` | Color Sort | Drag & drop | Colors, categorization | ✕ | ⬜ |
| `shape-trace` | Shape Tracer | Drag/trace | Pre-writing, shapes | ✕ | ⬜ |
| `number-count` | Count the Animals | Tap + count | Numeracy, counting | ✕ | ⬜ |
| `music-maker` | Tap the Beat | Rhythm tap | Rhythm, music | ✕ | ⬜ |
| `platformer` | Jungle Jump | D-pad + A | Movement, timing | ✓ | ⬜ |

> **Note:** Every game must implement `preview()` + `previewUpdate()` to show a live animated thumbnail in the launcher tile. See [13 — Game Preview System](./13-game-preview-system.md) for the preview contract.

### Game Development Process (per game)

1. **Design** — Define target age, skills, interaction mode, controller required?
2. **Asset list** — Document all sprites and audio needed
3. **Manifest** — Add entry to `games/manifest.json` (include `ageRange`, controller flags)
4. **Preview** — Write `preview()` + `previewUpdate()` first (validates visual design quickly)
5. **Implementation** — Write full `games/<id>.js` following the contract
6. **Test** — Run through the test checklist in [10 — Building a Game](./10-building-a-game.md)
7. **Add to SW precache** — Add script path and assets to `PRECACHE_URLS`

---

## Phase 6 — Sideloading & AI Integration (Weeks 8–12)

> **Goal:** Enable external games to be installed without rebuilding the app, and document the AI prompting workflow for generating new game scripts.

### Deliverables

| Task | Status | Notes |
|------|--------|-------|
| Sideload UI in settings panel | ⬜ | Paste JS code or upload file |
| `sideloadGame()` validates + stores in IndexedDB | ⬜ | [07](./07-game-loader.md) |
| Launcher merges bundled + sideloaded games | ⬜ | |
| Uninstall sideloaded game from settings | ⬜ | |
| AI Prompt Template document | ⬜ | For generating games with Claude/Gemini |
| Example AI-generated game (tested + validated) | ⬜ | |
| Game sandbox security review | ⬜ | Blob eval CSP audit |

### AI Game Generation Prompt Template

Games can be generated by AI using this prompt structure:

```
You are generating a ToyBox mini-game JavaScript module.
ToyBox is a tablet PWA game engine for toddlers aged 2-6.

STRICT RULES:
- Export a default object with: config, init(engine), update(engine, deltaTime), onEvent(engine, eventName, payload)
- Use engine.spawn() to create sprites, never PIXI directly
- Use engine.animate() for animations, never CSS/DOM
- Use engine.audio.play() for sounds
- Call engine.system.triggerWinState() or triggerLoseState() to end the game
- Store all state on `this.*`
- No setInterval/setTimeout — use deltaTime accumulation
- No DOM access (no document.*, window.*)

Game spec: [DESCRIBE THE GAME HERE]
Target age: [AGE RANGE]
Interaction mode: [tap | drag]
Assets available: [LIST ASSET KEYS]
Audio available: [LIST AUDIO KEYS]
```

---

## Phase 7 — Distribution & Monitoring (Ongoing)

### Deployment Options

| Option | Effort | Offline? | Notes |
|--------|--------|---------|-------|
| **Self-hosted static server** | Low | ✅ Yes | Nginx/Caddy, no backend needed |
| **GitHub Pages** | Very Low | ✅ Yes | Free, custom domain supported |
| **Netlify / Vercel** | Very Low | ✅ Yes | Automatic HTTPS, deploy on push |
| **Local-only (no server)** | None | ✅ Yes | Run from USB or local network |

### Analytics (Privacy-Safe)

Since ToyBox is a kids' app:
- **No third-party analytics** (COPPA compliance)
- Optional: local-only play session logging to IndexedDB
- Optional: `performance.mark()` / `performance.measure()` for internal performance monitoring

### Update Strategy

When new bundled games or engine updates ship:
1. Increment `CACHE_VERSION` in `sw.js`
2. Deploy updated files to server
3. Next time the app is opened with network, new SW installs
4. After user closes all tabs, new SW activates and old cache is cleared
5. Launcher now shows new games automatically

---

## Feature Backlog (Post-MVP)

These features are planned but not required for launch:

| Feature | Priority | Complexity | Description |
|---------|----------|-----------|-------------|
| Parental lock / PIN | Medium | Low | Prevent exit from game |
| Playtime timer | Low | Low | Parental-set session limits |
| Profile system | Low | Medium | Multiple child profiles with separate saves |
| Localization (i18n) | Medium | Medium | Game text in multiple languages |
| Accessibility mode | High | Medium | Larger text, high contrast, audio descriptions |
| Game rating system | Low | Low | Parents rate games |
| Multiplayer (pass & play) | Low | High | Two players on one tablet |
| Custom avatar builder | Low | High | Child-personalizable character |

---

## Technical Debt Tracker

These known simplifications should be addressed before production:

| Item | Impact | Resolution |
|------|--------|-----------|
| `setTimeout` used in Memory Match for flip delay | Low | Replace with deltaTime timer |
| No CSP header configured | Medium | Add `Content-Security-Policy: script-src 'self' blob:` |
| Audio files not yet available offline | High | Add to SW `PRECACHE_URLS` |
| No error logging / crash reporting | Medium | Implement `window.onerror` → IndexedDB log |
| Game manifest not validated at startup | Low | Add schema validation on load |

---

**Previous:** [10 — Building a Game](./10-building-a-game.md) | **Back to:** [00 — Overview](./00-overview.md)
