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

    // PixiJS rendering bridge
    app:     app,
    renderToTexture: (displayObject, renderTexture, clear = false) => {
      if (app) {
        app.renderer.render({
          container: displayObject,
          renderTexture: renderTexture,
          clear: clear
        });
      }
    },

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
        const targetScaleX = entity.scale.y;
        await animateEntity(entity, { scaleX: 0 }, 0.15, 'easeIn');
        if (entity.texture) {
          entity.texture = PIXI.Assets.get(newTexture) || entity.texture;
        }
        await animateEntity(entity, { scaleX: targetScaleX }, 0.15, 'easeOut');
      },
      async pop(entity) {
        const base = entity._baseScale ?? entity.scale.x;
        await animateEntity(entity, { scale: base * 1.4 }, 0.1, 'easeOut');
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
    let texture = PIXI.Assets.get(options.asset);
    let isProcedural = false;
    if (!texture) {
      texture = getCachedTexture(options.asset);
      if (!texture) {
        texture = generateProceduralTexture(options.asset);
        if (texture) {
          setCachedTexture(options.asset, texture);
          isProcedural = true;
        }
      } else {
        isProcedural = true;
      }
    }

    if (!texture) {
      console.warn(`[ToyBox] Asset not found: "${options.asset}". Did you list it in config.assets?`);
      entity = new PIXI.Container();
    } else {
      entity = new PIXI.Sprite(texture);
      
      // If procedural and is an animal/object, draw centered label
      if (isProcedural && (options.asset.startsWith('animal_') || options.asset.startsWith('obj_') || options.asset.startsWith('reveal_'))) {
        const name = options.asset.replace('animal_', '').replace('obj_', '').replace('reveal_', '').toUpperCase();
        const textVal = name.length > 3 ? name.substring(0, 3) : name;
        const textLabel = new PIXI.Text({
          text: textVal,
          style: new PIXI.TextStyle({
            fontFamily: 'Nunito, sans-serif',
            fontSize: 22,
            fill: '#ffffff',
            fontWeight: 'bold',
          })
        });
        textLabel.anchor.set(0.5);
        entity.addChild(textLabel);
      }
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
      } else if (key === 'scaleX') {
        startProps.scaleX = entity.scale.x;
        deltaProps.scaleX = targetProps.scaleX - entity.scale.x;
      } else if (key === 'scaleY') {
        startProps.scaleY = entity.scale.y;
        deltaProps.scaleY = targetProps.scaleY - entity.scale.y;
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
        } else if (key === 'scaleX') {
          entity.scale.x = value;
        } else if (key === 'scaleY') {
          entity.scale.y = value;
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

  const promises = assetConfig.map(async (key) => {
    try {
      await PIXI.Assets.load({
        alias: key,
        src:   `/assets/sprites/${key}.png`,
      });
    } catch (err) {
      console.warn(`[ToyBox/Engine] Failed to load asset "${key}":`, err);
    }
  });

  await Promise.all(promises);
}

// ── Procedural Asset Fallback Subsystem ──

function getCachedTexture(key) {
  try {
    if (PIXI.Cache && typeof PIXI.Cache.get === 'function' && PIXI.Cache.has(key)) {
      return PIXI.Cache.get(key);
    }
  } catch (e) {}
  try {
    if (PIXI.Assets.cache && typeof PIXI.Assets.cache.get === 'function' && PIXI.Assets.cache.has(key)) {
      return PIXI.Assets.cache.get(key);
    }
  } catch (e) {}
  return null;
}

function setCachedTexture(key, texture) {
  try {
    if (PIXI.Cache && typeof PIXI.Cache.set === 'function') {
      PIXI.Cache.set(key, texture);
    }
  } catch (e) {}
  try {
    if (PIXI.Assets.cache && typeof PIXI.Assets.cache.set === 'function') {
      PIXI.Assets.cache.set(key, texture);
    }
  } catch (e) {}
}

function getColorFromKey(key) {
  if (key.includes('red')) return 0xff3b30;
  if (key.includes('blue')) return 0x007aff;
  if (key.includes('green')) return 0x34c759;
  if (key.includes('yellow')) return 0xffcc00;
  if (key.includes('orange')) return 0xff9500;
  if (key.includes('pink')) return 0xff2d55;
  if (key.includes('purple')) return 0xaf52de;
  if (key.includes('gold') || key.includes('amber') || key.includes('yellow')) return 0xffd700;
  if (key.includes('teal')) return 0x30b0c0;
  if (key.includes('grey') || key.includes('gray')) return 0x8e8e93;
  if (key.includes('white') || key.includes('fog')) return 0xffffff;
  if (key.includes('dark')) return 0x1c1c1e;
  if (key.includes('brown')) return 0x8b4513;
  
  // Random/fallback colors based on key name hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [0xff3b30, 0x007aff, 0x34c759, 0xffcc00, 0xff9500, 0xff2d55, 0xaf52de, 0x30b0c0];
  return colors[Math.abs(hash) % colors.length];
}

function generateProceduralTexture(key) {
  const g = new PIXI.Graphics();
  const color = getColorFromKey(key);
  
  if (key.includes('bubble')) {
    // Shiny translucent bubble
    g.circle(0, 0, 48).fill({ color, alpha: 0.6 });
    g.circle(0, 0, 48).stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
    g.ellipse(-14, -14, 12, 6).fill({ color: 0xffffff, alpha: 0.7 });
  } else if (key.includes('star')) {
    // 5-pointed star
    drawStar(g, 0, 0, 5, 40, 18, color);
  } else if (key.includes('balloon')) {
    // Balloon
    g.ellipse(0, -10, 32, 40).fill(color);
    g.poly([-6, 30, 6, 30, 0, 24]).fill(color);
    g.moveTo(0, 30).lineTo(0, 50).stroke({ color: 0xffffff, width: 2 });
  } else if (key.includes('fruit_apple')) {
    // Apple
    g.circle(0, 4, 34).fill(0xff3b30);
    g.ellipse(0, -22, 4, 12).fill(0x8b4513); // stem
    g.ellipse(10, -26, 12, 6).fill(0x34c759); // leaf
  } else if (key.includes('fruit_orange')) {
    // Orange
    g.circle(0, 4, 34).fill(0xff9500);
    g.ellipse(0, -22, 4, 12).fill(0x8b4513); // stem
    g.ellipse(10, -26, 12, 6).fill(0x34c759); // leaf
  } else if (key.includes('fruit_banana')) {
    // Banana
    g.arc(0, 0, 32, Math.PI * 0.1, Math.PI * 0.9).stroke({ color: 0xffcc00, width: 12 });
  } else if (key.includes('cloud')) {
    // Cloud
    g.circle(-20, 0, 24).fill(0xffffff);
    g.circle(20, 0, 24).fill(0xffffff);
    g.circle(0, -12, 28).fill(0xffffff);
    g.rect(-20, 4, 40, 20).fill(0xffffff);
  } else if (key.includes('door_closed')) {
    // Wooden door
    g.roundRect(-40, -60, 80, 120, 8).fill(0x8b4513);
    g.roundRect(-40, -60, 80, 120, 8).stroke({ color: 0x5c2e0b, width: 4 });
    g.circle(24, 0, 6).fill(0xffd700); // knob
  } else if (key.includes('door_frame')) {
    // Door frame
    g.rect(-44, -64, 88, 128).stroke({ color: 0x5c2e0b, width: 8 });
  } else if (key.includes('ball_main') || key.includes('ball')) {
    // Ball
    g.circle(0, 0, 40).fill(color);
    g.circle(0, 0, 40).stroke({ color: 0xffffff, width: 4 });
    drawStar(g, 0, 0, 5, 20, 8, 0xffffff);
  } else if (key.includes('trail')) {
    // Small dot
    g.circle(0, 0, 8).fill({ color: 0xffffff, alpha: 0.5 });
  } else if (key.includes('scratch_surface')) {
    // Metallic surface
    g.rect(-150, -100, 300, 200).fill(0xc0c0c0);
    g.rect(-150, -100, 300, 200).stroke({ color: 0xa9a9a9, width: 8 });
  } else if (key.includes('scratch_chip')) {
    g.rect(-4, -4, 8, 8).fill(0x808080);
  } else if (key.includes('glow')) {
    // Radial glow
    for (let i = 5; i > 0; i--) {
      g.circle(0, 0, i * 20).fill({ color: 0xffffff, alpha: 0.15 });
    }
  } else if (key.includes('particle')) {
    g.circle(0, 0, 6).fill(color);
  } else if (key.includes('progress_bar_bg')) {
    g.roundRect(-150, -15, 300, 30, 15).fill(0x444444);
  } else if (key.includes('progress_bar_fill')) {
    g.roundRect(-150, -15, 300, 30, 15).fill(0x34c759);
  } else if (key.includes('prompt_bg')) {
    g.roundRect(-200, -30, 400, 60, 15).fill({ color: 0x000000, alpha: 0.5 });
  } else if (key.includes('overlay_white')) {
    g.rect(-50, -50, 100, 100).fill(0xffffff);
  } else if (key.includes('btn_')) {
    g.roundRect(-120, -30, 240, 60, 12).fill(0xe94560);
    g.roundRect(-120, -30, 240, 60, 12).stroke({ color: 0xffffff, width: 3 });
  } else if (key.startsWith('piece_') || key.startsWith('shape_') || key.startsWith('slot_')) {
    // Sorter shapes or Soundboard shapes
    const isSlot = key.startsWith('slot_') && !key.includes('glow');
    const shapeType = key.replace('piece_', '').replace('slot_', '').replace('shape_', '');
    drawShapeType(g, shapeType, color, isSlot);
  } else if (key.startsWith('scene_') || key.startsWith('bg_') || key.startsWith('reveal_')) {
    // Large background scene
    const w = 1024;
    const h = 768;
    g.rect(-w/2, -h/2, w, h).fill(color);
    if (key.includes('jungle')) {
      for (let i = 0; i < 20; i++) {
        g.ellipse(-w/2 + Math.random()*w, -h/2 + Math.random()*h, 20+Math.random()*40, 40+Math.random()*80).fill({ color: 0x1e5e2f, alpha: 0.3 });
      }
    } else if (key.includes('ocean')) {
      for (let i = 0; i < 25; i++) {
        g.circle(-w/2 + Math.random()*w, -h/2 + Math.random()*h, 10+Math.random()*20).fill({ color: 0xffffff, alpha: 0.15 });
      }
    } else if (key.includes('night') || key.includes('sky')) {
      for (let i = 0; i < 40; i++) {
        drawStar(g, -w/2 + Math.random()*w, -h/2 + Math.random()*h, 5, 4+Math.random()*6, 2, 0xffffff);
      }
    } else {
      g.circle(0, 0, 150).fill({ color: 0xffffff, alpha: 0.1 });
    }
  } else if (key.startsWith('obj_') || key.startsWith('animal_')) {
    // Object/animal card with a cute letter/emoji
    g.circle(0, 0, 56).fill(color);
    g.circle(0, 0, 56).stroke({ color: 0xffffff, width: 4 });
  } else {
    // Generic fallback
    g.roundRect(-32, -32, 64, 64, 8).fill(color);
    g.roundRect(-32, -32, 64, 64, 8).stroke({ color: 0xffffff, width: 2 });
  }

  let texture = null;
  try {
    texture = app.renderer.generateTexture({ target: g });
  } catch (e) {
    try {
      texture = app.renderer.generateTexture(g);
    } catch (e2) {
      console.warn(`[ToyBox/Engine] Failed to generate procedural texture for "${key}":`, e2);
    }
  }
  g.destroy({ children: true });
  return texture;
}

function drawStar(g, cx, cy, spikes, outerRadius, innerRadius, color) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  const points = [];
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    points.push(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    points.push(x, y);
    rot += step;
  }
  g.poly(points).fill(color);
}

function drawShapeType(g, type, color, isSlot) {
  const size = 50;
  if (type === 'circle') {
    if (isSlot) {
      g.circle(0, 0, size).stroke({ color, width: 6 });
    } else {
      g.circle(0, 0, size).fill(color);
    }
  } else if (type === 'square') {
    if (isSlot) {
      g.rect(-size, -size, size * 2, size * 2).stroke({ color, width: 6 });
    } else {
      g.rect(-size, -size, size * 2, size * 2).fill(color);
    }
  } else if (type === 'triangle') {
    const pts = [0, -size, size, size, -size, size];
    if (isSlot) {
      g.poly(pts).stroke({ color, width: 6 });
    } else {
      g.poly(pts).fill(color);
    }
  } else if (type === 'star') {
    if (isSlot) {
      let rot = Math.PI / 2 * 3;
      const step = Math.PI / 5;
      const pts = [];
      for (let i = 0; i < 5; i++) {
        pts.push(Math.cos(rot) * size * 1.1, Math.sin(rot) * size * 1.1);
        rot += step;
        pts.push(Math.cos(rot) * size * 0.5, Math.sin(rot) * size * 0.5);
        rot += step;
      }
      g.poly(pts).stroke({ color, width: 6 });
    } else {
      drawStar(g, 0, 0, 5, size * 1.1, size * 0.5, color);
    }
  } else if (type === 'heart') {
    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += 0.05) {
      const x = 16 * Math.pow(Math.sin(t), 3) * (size / 16);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) * (size / 16);
      pts.push(x, y);
    }
    if (isSlot) {
      g.poly(pts).stroke({ color, width: 6 });
    } else {
      g.poly(pts).fill(color);
    }
  } else if (type === 'diamond') {
    const pts = [0, -size * 1.2, size, 0, 0, size * 1.2, -size, 0];
    if (isSlot) {
      g.poly(pts).stroke({ color, width: 6 });
    } else {
      g.poly(pts).fill(color);
    }
  } else if (type === 'oval') {
    if (isSlot) {
      g.ellipse(0, 0, size * 1.3, size * 0.8).stroke({ color, width: 6 });
    } else {
      g.ellipse(0, 0, size * 1.3, size * 0.8).fill(color);
    }
  } else if (type === 'cross') {
    const w = size * 0.4;
    const h = size * 1.2;
    if (isSlot) {
      g.poly([-w, -h, w, -h, w, -w, h, -w, h, w, w, w, w, h, -w, h, -w, w, -h, w, -h, -w, -w, -w]).stroke({ color, width: 6 });
    } else {
      g.rect(-w, -h, w * 2, h * 2).fill(color);
      g.rect(-h, -w, h * 2, w * 2).fill(color);
    }
  } else {
    if (isSlot) {
      g.circle(0, 0, size).stroke({ color, width: 6 });
    } else {
      g.circle(0, 0, size).fill(color);
    }
  }
}
