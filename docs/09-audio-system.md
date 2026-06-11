# 09 — Audio System

The ToyBox audio system provides a simple, declarative API that wraps the Web Audio API. Game modules interact with audio through the `engine.audio.*` interface, never directly touching the Web Audio API.

---

## Design Goals

| Goal | Implementation |
|------|---------------|
| Preload sounds before game starts | Declared in `config.audio[]` |
| Low latency playback | Web Audio API `AudioBufferSourceNode` |
| Multiple simultaneous sounds | Each `play()` call creates a new source node |
| Offline-first | Audio files cached by Service Worker |
| Volume control | Master `GainNode` on the audio graph |
| Mobile autoplay fix | Context resumed on first user interaction |

---

## Audio Graph Architecture

```
AudioContext
     │
     ▼
[Sound Effect] → AudioBufferSourceNode
                        │
                        ▼
                   GainNode (per-sound volume)
                        │
                        ▼
                   masterGain (global volume 0–1)
                        │
                        ▼
                   AudioContext.destination (speakers)
```

---

## Step 1 — Audio System Initialization

```javascript
// engine/audio.js

let audioContext = null;
let masterGain   = null;
const audioBuffers = new Map(); // assetId → AudioBuffer (decoded audio)

/**
 * Initialize the Web Audio API context.
 * Must be called (or resumed) after a user gesture on mobile.
 */
export function initAudio() {
  if (audioContext) return;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioContext.createGain();
  masterGain.gain.value = 1.0; // Full volume by default
  masterGain.connect(audioContext.destination);

  // Resume context on any user gesture (required on iOS/Android)
  document.addEventListener('pointerdown', resumeContext, { once: false });
}

function resumeContext() {
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
}
```

> **Why context suspension?** Mobile browsers suspend the AudioContext until a user interaction occurs (to prevent autoplay). We hook into `pointerdown` to resume it on every tap, ensuring audio works after the screen locks and unlocks too.

---

## Step 2 — Preloading Audio Assets

Audio files must be fetched, decoded, and stored as `AudioBuffer` objects before a game starts. This eliminates playback latency during gameplay.

```javascript
// engine/audio.js

/**
 * Preload a list of audio assets. Called by the Game Loader before game.init().
 *
 * @param {string[]} assetIds - Audio keys declared in config.audio[]
 */
export async function preloadAudio(assetIds) {
  if (!audioContext) initAudio();

  const promises = assetIds.map(async (id) => {
    if (audioBuffers.has(id)) return; // Already loaded

    const url = `/assets/audio/${id}.ogg`; // Primary format
    let response;

    try {
      response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      // Fallback to .mp3 for Safari (limited OGG support)
      const fallback = `/assets/audio/${id}.mp3`;
      response = await fetch(fallback);
      if (!response.ok) throw new Error(`Audio not found: ${id}`);
    }

    const arrayBuffer  = await response.arrayBuffer();
    const audioBuffer  = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffers.set(id, audioBuffer);
  });

  await Promise.all(promises);
}
```

### Supported Audio File Formats

| Format | Browser Support | Notes |
|--------|----------------|-------|
| `.ogg` (Vorbis) | Chrome, Firefox, Edge | Smallest file size, preferred |
| `.mp3` | All browsers incl. Safari | Fallback for iOS/Safari |

Provide both formats for each sound: `pop_sound.ogg` and `pop_sound.mp3`.

---

## Step 3 — Playing Sounds

```javascript
// engine/audio.js

/**
 * Play a preloaded sound effect.
 * Creates a new AudioBufferSourceNode for each call,
 * allowing the same sound to overlap itself.
 *
 * @param {string}  assetId - Audio key
 * @param {Object}  [options]
 * @param {number}  [options.volume=1]   - Per-sound volume (0–1)
 * @param {number}  [options.rate=1]     - Playback rate (0.5=slower, 2.0=faster)
 * @param {boolean} [options.loop=false] - Loop continuously
 * @returns {AudioBufferSourceNode} - Can be stored to call .stop() later
 */
export function play(assetId, options = {}) {
  if (!audioContext) {
    console.warn('[ToyBox] Audio not initialized');
    return null;
  }

  const buffer = audioBuffers.get(assetId);
  if (!buffer) {
    console.warn(`[ToyBox] Audio not preloaded: "${assetId}"`);
    return null;
  }

  // Resume context if suspended (e.g., after app was backgrounded)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  // Create source → gain → master chain
  const source = audioContext.createBufferSource();
  source.buffer             = buffer;
  source.playbackRate.value = options.rate ?? 1;
  source.loop               = options.loop ?? false;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = options.volume ?? 1;

  source.connect(gainNode);
  gainNode.connect(masterGain);

  source.start(0);
  return source;
}
```

**Usage examples:**

```javascript
// Simple one-shot play
engine.audio.play('pop_sound');

// Play slower (lower pitch) — useful for "wrong answer" effect
engine.audio.play('flip_card', { rate: 0.8 });

// Loop background music
const bgMusic = engine.audio.play('bg_music_loop', { loop: true, volume: 0.4 });

// Stop it later
bgMusic.stop();
```

---

## Step 4 — Stopping Sounds

```javascript
// engine/audio.js

/**
 * Stop a specific sound source node.
 * The source returned by play() can be stored and stopped later.
 *
 * @param {AudioBufferSourceNode} source
 */
export function stop(source) {
  if (!source) return;
  try {
    source.stop();
  } catch {
    // Source may have already ended naturally — ignore the error
  }
}

/**
 * Stop all currently playing sounds.
 * Called on game exit to ensure no sounds persist into the launcher.
 */
export function stopAll() {
  // The most reliable way: suspend and immediately resume the context
  // This cuts all audio graphs cleanly
  if (audioContext) {
    audioContext.suspend().then(() => audioContext.resume());
  }
}
```

---

## Step 5 — Volume Control

```javascript
// engine/audio.js

/**
 * Set the master volume for all ToyBox audio.
 *
 * @param {number} level - Volume from 0 (silent) to 1 (full)
 */
export function setVolume(level) {
  if (!masterGain) return;

  // Clamp to valid range
  const clamped = Math.max(0, Math.min(1, level));

  // Ramp volume change over 100ms to avoid audio clicks/pops
  masterGain.gain.linearRampToValueAtTime(
    clamped,
    audioContext.currentTime + 0.1
  );
}

/**
 * Get current master volume.
 */
export function getVolume() {
  return masterGain?.gain.value ?? 1;
}
```

### Persisting Volume Setting

The volume preference should be saved to IndexedDB and restored on startup:

```javascript
// In app.js bootstrap

import { settings } from './engine/storage.js';
import { setVolume } from './engine/audio.js';

async function restoreSettings() {
  const savedVolume = await settings.get('volume', 1.0);
  setVolume(savedVolume);
}
```

---

## Step 6 — The `engine.audio` Interface

The public interface exposed to game modules:

```javascript
// engine/engine.js — part of buildEngineObject()

audio: {
  play:      (assetId, options) => audio.play(assetId, options),
  stop:      (source)           => audio.stop(source),
  setVolume: (level)            => audio.setVolume(level),
  getVolume: ()                 => audio.getVolume(),
},
```

---

## Step 7 — Audio Asset Guidelines

### File Organization

```
assets/audio/
├── pop_sound.ogg          ← Short, punchy (< 0.5s)
├── pop_sound.mp3          ← Safari fallback
├── match_success.ogg      ← Positive reward (< 1s)
├── match_success.mp3
├── match_fail.ogg         ← Gentle negative (< 0.5s)
├── match_fail.mp3
├── win_jingle.ogg         ← Win fanfare (2–4s)
├── win_jingle.mp3
└── bg_music_loop.ogg      ← Seamless loop (8–16s)
    bg_music_loop.mp3
```

### Sound Design for Children

| Sound Type | Length | Character | Notes |
|-----------|--------|-----------|-------|
| **Tap/Touch feedback** | 50–200ms | Bright, high-pitched | Immediate gratification |
| **Match success** | 300–800ms | Warm, cheerful ascending notes | Reward |
| **Match fail** | 200–400ms | Gentle descending, soft | Non-scary |
| **Win fanfare** | 2–4s | Celebratory, upbeat | Trigger on game win |
| **Background music** | 8–16s loop | Calm, non-distracting | Low volume (0.3–0.5) |

> **Important:** All sounds should be **child-safe** — no harsh buzzes, loud bangs, or startling sounds. Children's games research shows that gentle, melodic audio reinforcement significantly improves engagement and learning retention.

---

## Step 8 — Mute Button (System Overlay)

The system overlay includes a mute toggle accessible during gameplay:

```javascript
// app.js — system overlay setup

const btnMute = document.getElementById('btn-mute');
let isMuted   = false;

btnMute.addEventListener('pointerdown', async () => {
  isMuted = !isMuted;
  const level = isMuted ? 0 : (await settings.get('volume', 1.0));
  setVolume(level);
  btnMute.textContent = isMuted ? '🔇' : '🔊';
  if (!isMuted) await settings.set('volume', level);
});
```

---

## Checklist

- [ ] `AudioContext` created lazily (not before user interaction)
- [ ] `resumeContext()` called on every `pointerdown` to handle iOS suspension
- [ ] `preloadAudio()` fetches `.ogg` with `.mp3` fallback
- [ ] Audio buffers cached in `audioBuffers` Map after decode
- [ ] Each `play()` call creates a new `AudioBufferSourceNode` (allows overlapping)
- [ ] `masterGain` controls overall volume with `linearRampToValueAtTime` (no clicks)
- [ ] `stopAll()` called when game exits to prevent audio bleed into launcher
- [ ] Volume persisted to IndexedDB via `settings` store
- [ ] Mute button in system overlay functional during gameplay

---

**Previous:** [08 — Input & Touch System](./08-input-touch-system.md) | **Next:** [10 — Building a Game →](./10-building-a-game.md)
