// engine/audio.js

import { getSetting } from './settings.js';

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
  // Restore initial volume level
  const initialVolume = getSetting('volume') ?? 1.0;
  masterGain.gain.value = initialVolume;
  masterGain.connect(audioContext.destination);

  // Resume context on any user gesture (required on iOS/Android)
  document.addEventListener('pointerdown', resumeContext, { once: false });
}

function resumeContext() {
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Preload a list of audio assets. Called by the Game Loader before game.init().
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
      try {
        response = await fetch(fallback);
        if (!response.ok) throw new Error(`Audio not found: ${id}`);
      } catch (err) {
        console.warn(`[ToyBox/Audio] Failed to load audio asset: ${id}. Attempting to use synthesizer fallback.`, err);
        return;
      }
    }

    try {
      const arrayBuffer  = await response.arrayBuffer();
      const audioBuffer  = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers.set(id, audioBuffer);
    } catch (err) {
      console.warn(`[ToyBox/Audio] Failed to decode audio data for: ${id}`, err);
    }
  });

  await Promise.all(promises);
}

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
 * @returns {AudioBufferSourceNode|null} - Can be stored to call .stop() later
 */
export function play(assetId, options = {}) {
  // Respect settings
  const isMusic = assetId.includes('music') || assetId.includes('bgm');
  const sfxEnabled = getSetting('sfxEnabled') ?? true;
  const musicEnabled = getSetting('musicEnabled') ?? true;

  if (isMusic && !musicEnabled) return null;
  if (!isMusic && !sfxEnabled) return null;

  if (!audioContext) {
    initAudio();
  }

  // Resume context if suspended (e.g., after app was backgrounded)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const buffer = audioBuffers.get(assetId);
  if (!buffer) {
    console.warn(`[ToyBox] Audio not preloaded: "${assetId}". Playing synthesizer fallback pop.`);
    return playSynthBeep(assetId, options);
  }

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

/**
 * Plays a simple synthesized beep if the audio file fails to load or isn't preloaded yet.
 * Ensures the app works nicely even without real sound assets.
 */
function playSynthBeep(type, options) {
  if (!audioContext || audioContext.state === 'suspended') return null;

  try {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(masterGain);

    const now = audioContext.currentTime;
    
    if (type.includes('fail') || type.includes('wrong')) {
      // descending buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.3);
      gainNode.gain.setValueAtTime((options.volume ?? 1) * 0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type.includes('win') || type.includes('success')) {
      // happy chirp
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      osc.frequency.setValueAtTime(800, now + 0.2);
      gainNode.gain.setValueAtTime((options.volume ?? 1) * 0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // standard pop beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gainNode.gain.setValueAtTime((options.volume ?? 1) * 0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
    
    return osc;
  } catch (e) {
    return null;
  }
}

/**
 * Stop a specific sound source node.
 * @param {AudioBufferSourceNode|OscillatorNode} source
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
 */
export function stopAll() {
  if (audioContext) {
    audioContext.suspend().then(() => audioContext.resume());
  }
}

/**
 * Set the master volume for all ToyBox audio.
 * @param {number} level - Volume from 0 (silent) to 1 (full)
 */
export function setVolume(level) {
  if (!audioContext) initAudio();
  if (!masterGain) return;

  const clamped = Math.max(0, Math.min(1, level));

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
