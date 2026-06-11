// engine/engine.js

import { inputState, inputQueue } from './input.js';
import * as audio from './audio.js';
import { getSetting } from './settings.js';
import { controllerState, controllerPressed, clearPressedState } from './controller.js';
import { set, get } from './storage.js';

let app = null;           // PixiJS Application singleton
let currentGame = null;   // Active game module reference
let currentGameId = null; // Active game ID
let onExitCallback = null;

// Tween System
const activeTweens = new Map(); // entity → Set of tween descriptors

/**
 * Initialize the PixiJS Application and attach it to the canvas element.
 * Called once on first game boot; subsequent games reuse the same app instance.
 */
export async function initRuntime(canvas) {
  if (app) return app; // Reuse existing instance

  app = new PIXI.Application();

  await app.init({
    canvas,
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x1a1a2e,      // Match CSS background color
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,          // Auto-scale canvas for high-DPI displays
    antialias:       true,
    powerPreference: 'high-performance',
  });

  // Handle resize events (orientation change on tablet)
  window.addEventListener('resize', resizeRenderer);

  return app;
}

function resizeRenderer() {
  if (!app) return;

  const width  = window.innerWidth;
  const height = window.innerHeight;

  app.renderer.resize(width, height);

  // Notify the active game of the new dimensions
  if (currentGame?.onResize) {
    currentGame.onResize(buildEngineObject());
  }
}

/**
 * Build the engine bridge object for the current frame.
 * This is the API that every game module receives.
 */
export function buildEngineObject() {
  const width = app ? app.renderer.width / app.renderer.resolution : window.innerWidth;
  const height = app ? app.renderer.height / app.renderer.resolution : window.innerHeight;

  return {
    width,
    height,

    // Entity management
    spawn:   (options) => spawnEntity(options),
    destroy: (entity)  => destroyEntity(entity),

    // Animation / tweening
    animate: (entity, targetProps, duration, easing) =>
             animateEntity(entity, targetProps, duration, easing),

    // Audio subsystem
    audio: {
      play:      (assetId, options) => audio.play(assetId, options),
      stop:      (source)           => audio.stop(source),
      setVolume: (level)            => audio.setVolume(level),
      getVolume: ()                 => audio.getVolume(),
    },

    // Input state (read-only snapshot)
    input: {
      touches: [...inputState.touches],
      lastTap: inputState.lastTap,
      controller: {
        dpad: { ...controllerState.dpad },
        buttons: { ...controllerState.buttons },
        pressed: {
          dpad:    { ...controllerPressed.dpad },
          buttons: { ...controllerPressed.buttons },
        },
      },
    },

    // Event broker
    emit:  (eventName, payload) => emitEvent(eventName, payload),

    // System controls
    system: {
      exit:          () => triggerExit(),
      triggerWinState: (options = {}) => showWinState(options),
      triggerLoseState: (options = {}) => showLoseState(options),
      saveData:      async (key, value) => set('game_saves', value, `game:${currentGameId}:${key}`),
      loadData:      async (key) => get('game_saves', `game:${currentGameId}:${key}`),
    },

    // Micro-animations convenience helpers
    fx: {
      async flipCard(entity, newTexture) {
        await animateEntity(entity, { scale: 0 }, 0.15, 'easeIn');
        if (entity.texture) {
          entity.texture = PIXI.Assets.get(newTexture) || entity.texture;
        }
        await animateEntity(entity, { scale: 1 }, 0.15, 'easeOut');
      },
      async pop(entity) {
        await animateEntity(entity, { scale: 1.4 }, 0.1, 'easeOut');
        await animateEntity(entity, { scale: 0 }, 0.15, 'easeIn');
        destroyEntity(entity);
      },
      async wiggle(entity) {
        const origX = entity.x;
        for (let i = 0; i < 3; i++) {
          await animateEntity(entity, { x: origX + 12 }, 0.06, 'linear');
          await animateEntity(entity, { x: origX - 12 }, 0.06, 'linear');
        }
        await animateEntity(entity, { x: origX }, 0.06, 'linear');
      },
      async floatUp(entity) {
        await Promise.all([
          animateEntity(entity, { y: entity.y - 80 }, 0.6, 'easeOut'),
          animateEntity(entity, { alpha: 0 }, 0.6, 'easeIn'),
        ]);
        destroyEntity(entity);
      },
    }
  };
}

// Event Queue
const eventQueue = [];

function emitEvent(eventName, payload) {
  eventQueue.push({ name: eventName, payload });
}

function flushEventQueue(engine) {
  while (eventQueue.length > 0) {
    const { name, payload } = eventQueue.shift();
    if (currentGame?.onEvent) {
      currentGame.onEvent(engine, name, payload);
    }
  }
}

// Input events dispatching
function processInputEvents(engine) {
  while (inputQueue.length > 0) {
    const event = inputQueue.shift();

    if (event.type === 'touch_move' || event.type === 'drag_start' || event.type === 'drag_end') {
      currentGame?.onEvent?.(engine, event.type, event);
    }

    if (event.type === 'tap') {
      currentGame?.onEvent?.(engine, 'touch_down', event);
    }
  }
}

// Entity implementation
function spawnEntity(options) {
  let entity;

  if (options.asset) {
    const texture = PIXI.Assets.get(options.asset);
    if (!texture) {
      console.warn(`[ToyBox] Asset not found: "${options.asset}". Did you list it in config.assets?`);
      entity = new PIXI.Container();
    } else {
      entity = new PIXI.Sprite(texture);
    }
  } else if (options.text) {
    entity = new PIXI.Text({
      text:  options.text,
      style: new PIXI.TextStyle({
        fontFamily: 'Nunito, sans-serif',
        fontSize:   options.fontSize ?? 48,
        fill:       options.color ?? '#ffffff',
        fontWeight: 'bold',
      }),
    });
  } else {
    entity = new PIXI.Container();
  }

  if (entity.anchor) entity.anchor.set(0.5);

  entity.x      = options.x     ?? (app.renderer.width  / app.renderer.resolution / 2);
  entity.y      = options.y     ?? (app.renderer.height / app.renderer.resolution / 2);
  entity.scale.set(options.scale ?? 1);
  entity.alpha  = options.alpha ?? 1;
  entity.angle  = options.angle ?? 0;
  if (options.tint !== undefined) entity.tint = options.tint;

  entity._toyboxId  = options.id ?? `entity_${Date.now()}`;
  entity._toyboxTag = options.tag;

  if (options.onTouch) {
    entity.eventMode = 'static';
    entity.cursor    = 'pointer';
    entity.hitArea   = options.hitArea ?? null;
    
    // For toddler-age users, pad hitArea to 96x96px minimum if not set
    if (!entity.hitArea) {
      const minSize = 96;
      const width = entity.width || 64;
      const height = entity.height || 64;
      if (width < minSize || height < minSize) {
        entity.hitArea = new PIXI.Rectangle(
          -(Math.max(minSize, width) / 2),
          -(Math.max(minSize, height) / 2),
          Math.max(minSize, width),
          Math.max(minSize, height)
        );
      }
    }

    entity.on('pointertap', (e) => {
      e.stopPropagation();
      options.onTouch(entity);
    });
  }

  if (options.zIndex !== undefined) {
    entity.zIndex = options.zIndex;
    app.stage.sortableChildren = true;
  }

  app.stage.addChild(entity);
  return entity;
}

function destroyEntity(entity) {
  if (!entity) return;

  if (entity.parent) entity.parent.removeChild(entity);
  cancelTweensFor(entity);
  entity.destroy({ children: true, texture: false, baseTexture: false });
}

// Tween updating and helpers
function animateEntity(entity, targetProps, duration, easing = 'easeOut') {
  return new Promise((resolve) => {
    const startProps = {};
    const deltaProps = {};

    for (const key of Object.keys(targetProps)) {
      if (key === 'scale') {
        startProps.scale = entity.scale.x;
        deltaProps.scale = targetProps.scale - entity.scale.x;
      } else {
        startProps[key] = entity[key];
        deltaProps[key] = targetProps[key] - entity[key];
      }
    }

    const startTime = performance.now();

    const tween = {
      entity,
      startProps,
      deltaProps,
      duration: duration * 1000, // convert to ms
      easing,
      startTime,
      resolve,
    };

    if (!activeTweens.has(entity)) activeTweens.set(entity, new Set());
    activeTweens.get(entity).add(tween);
  });
}

function cancelTweensFor(entity) {
  const tweens = activeTweens.get(entity);
  if (tweens) {
    for (const tween of tweens) {
      tween.resolve(entity);
    }
    activeTweens.delete(entity);
  }
}

function updateTweens(nowMs) {
  for (const [entity, tweenSet] of activeTweens) {
    for (const tween of tweenSet) {
      const elapsed  = nowMs - tween.startTime;
      const progress = Math.min(elapsed / tween.duration, 1);
      const eased    = applyEasing(progress, tween.easing);

      for (const key of Object.keys(tween.deltaProps)) {
        const value = tween.startProps[key] + tween.deltaProps[key] * eased;
        if (key === 'scale') {
          entity.scale.set(value);
        } else {
          entity[key] = value;
        }
      }

      if (progress >= 1) {
        tweenSet.delete(tween);
        tween.resolve(entity);
      }
    }
    if (tweenSet.size === 0) activeTweens.delete(entity);
  }
}

function applyEasing(t, type) {
  switch (type) {
    case 'linear':    return t;
    case 'easeIn':    return t * t;
    case 'easeOut':   return t * (2 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'bounce':    return bounceEase(t);
    case 'elastic':   return elasticEase(t);
    default:          return t;
  }
}

function bounceEase(t) {
  let tempT = t;
  if (tempT < (1 / 2.75))      return 7.5625 * tempT * tempT;
  else if (tempT < (2 / 2.75)) { tempT -= 1.5 / 2.75;   return 7.5625 * tempT * tempT + 0.75; }
  else if (tempT < (2.5/2.75)) { tempT -= 2.25 / 2.75;  return 7.5625 * tempT * tempT + 0.9375; }
  else                      { tempT -= 2.625 / 2.75; return 7.5625 * tempT * tempT + 0.984375; }
}

function elasticEase(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}

// Runtime controls
const tickerCallback = () => {
  const deltaTime = app.ticker.deltaMS / 1000;
  const now = performance.now();

  updateTweens(now);

  const engine = buildEngineObject();

  processInputEvents(engine);

  if (currentGame?.update) {
    try {
      currentGame.update(engine, deltaTime);
    } catch (err) {
      console.error('[ToyBox] Game update crashed:', err);
    }
  }

  flushEventQueue(engine);

  // Clear single-frame controller pressed flags at the end of the frame
  clearPressedState();
};

export function startGameLoop(gameModule, gameId, onExit) {
  currentGame = gameModule.default || gameModule;
  currentGameId = gameId;
  onExitCallback = onExit;

  app.ticker.add(tickerCallback);
  app.ticker.start();
}

export function stopGameLoop() {
  if (app) {
    app.ticker.remove(tickerCallback);
    app.ticker.stop();
  }
  clearStage();
  currentGame = null;
  currentGameId = null;
}

function clearStage() {
  if (!app) return;
  
  // Destroy stage children cleanly
  while (app.stage.children.length > 0) {
    const child = app.stage.children[0];
    app.stage.removeChild(child);
    child.destroy({ children: true, texture: false, baseTexture: false });
  }

  // Cancel any running tweens
  activeTweens.clear();
}

function triggerExit() {
  stopGameLoop();
  audio.stopAll();
  if (onExitCallback) onExitCallback();
}

// Win/Lose Dialog Overlays
function showWinState(options) {
  triggerExit();

  const overlay = document.createElement('div');
  overlay.className = 'system-dialog-overlay';
  overlay.innerHTML = `
    <div class="system-dialog text-center animate-bounce-in">
      <h2>🎉 ${options.title || 'YOU WIN!'}</h2>
      <div class="dialog-graphic">🌟</div>
      <p class="dialog-score">${options.message || 'Fantastic Job!'}</p>
      <div class="dialog-buttons">
        <button id="btn-dialog-replay" class="dialog-btn dialog-btn--primary">Play Again</button>
        <button id="btn-dialog-exit" class="dialog-btn">Exit</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btn-dialog-replay').addEventListener('pointerdown', () => {
    overlay.remove();
    options.onReplay?.();
  });
  document.getElementById('btn-dialog-exit').addEventListener('pointerdown', () => {
    overlay.remove();
    options.onExit?.();
  });
}

function showLoseState(options) {
  triggerExit();

  const overlay = document.createElement('div');
  overlay.className = 'system-dialog-overlay';
  overlay.innerHTML = `
    <div class="system-dialog text-center animate-bounce-in">
      <h2>😢 ${options.title || 'TRY AGAIN!'}</h2>
      <div class="dialog-graphic">🎈</div>
      <p class="dialog-score">${options.message || 'Nice try, you can do it!'}</p>
      <div class="dialog-buttons">
        <button id="btn-dialog-replay" class="dialog-btn dialog-btn--primary">Try Again</button>
        <button id="btn-dialog-exit" class="dialog-btn">Exit</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btn-dialog-replay').addEventListener('pointerdown', () => {
    overlay.remove();
    options.onReplay?.();
  });
  document.getElementById('btn-dialog-exit').addEventListener('pointerdown', () => {
    overlay.remove();
    options.onExit?.();
  });
}

export async function preloadGameAssets(assetConfig) {
  if (!assetConfig || assetConfig.length === 0) return;

  const manifest = assetConfig.map(key => ({
    alias: key,
    src:   `/assets/sprites/${key}.png`,
  }));

  try {
    await PIXI.Assets.load(manifest);
  } catch (err) {
    console.warn('[ToyBox/Engine] Failed to load some texture assets. Dynamic fallback blocks will be spawned.', err);
  }
}
