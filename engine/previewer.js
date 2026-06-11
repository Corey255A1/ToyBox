// engine/previewer.js

import { evaluateModule } from './loader.js';

// All active preview contexts (canvas → PreviewContext)
const activeContexts = new Map();

// Global shared tween array or simple tween handler for preview animations
const activeTweens = [];

function animateEntity(entity, targetProps, duration, easing = 'easeOut') {
  const startProps = {};
  const startTime = performance.now();
  
  for (const key in targetProps) {
    startProps[key] = entity[key] ?? 0;
  }
  
  const tween = {
    entity,
    targetProps,
    startProps,
    startTime,
    duration: duration * 1000, // convert seconds to ms
    easing,
    resolved: false
  };
  
  activeTweens.push(tween);
  
  return new Promise((resolve) => {
    tween.resolve = resolve;
  });
}

function updateTweens() {
  const now = performance.now();
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    const t = activeTweens[i];
    if (t.entity._destroyed) {
      activeTweens.splice(i, 1);
      continue;
    }
    
    const elapsed = now - t.startTime;
    const progress = Math.min(elapsed / t.duration, 1);
    
    // Simple easing
    let easeProgress = progress;
    if (t.easing === 'easeOut') {
      easeProgress = 1 - Math.pow(1 - progress, 3); // cubic ease out
    } else if (t.easing === 'easeInOut') {
      easeProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    }
    
    for (const key in t.targetProps) {
      if (key === 'scale') {
        const val = t.startProps[key] + (t.targetProps[key] - t.startProps[key]) * easeProgress;
        t.entity.scale = val;
      } else {
        t.entity[key] = t.startProps[key] + (t.targetProps[key] - t.startProps[key]) * easeProgress;
      }
    }
    
    if (progress >= 1) {
      t.resolve?.();
      activeTweens.splice(i, 1);
    }
  }
}

/**
 * Initialize a preview animation in a given canvas element.
 *
 * @param {HTMLCanvasElement} canvas    - The tile's preview canvas
 * @param {Object}            gameEntry - Game manifest entry
 * @param {string}            source    - Raw JS source of the game module
 */
export async function initPreviewer(canvas, gameEntry, source) {
  // Stop any existing preview on this canvas
  stopPreviewer(canvas);

  let gameModule;
  try {
    gameModule = await evaluateModule(source);
  } catch (err) {
    console.warn(`[ToyBox/Preview] Failed to load module for ${gameEntry.id}:`, err);
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  // If no preview method, show fallback
  if (typeof gameModule.preview !== 'function') {
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  // Set up Canvas 2D preview context (strictly avoiding WebGL context limit)
  const miniEngine = buildCanvas2DMiniEngine(canvas);

  // Initialize the game's preview
  try {
    const bindModule = gameModule.default || gameModule;
    await bindModule.preview(miniEngine);
  } catch (err) {
    console.warn(`[ToyBox/Preview] preview() threw for ${gameEntry.id}:`, err);
    renderFallbackPreview(canvas, gameEntry);
    return;
  }

  let lastTime = performance.now();
  const context = {
    gameModule: gameModule.default || gameModule,
    miniEngine,
    tickHandle: null,
  };

  function tick() {
    const now      = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
    lastTime = now;

    // Update tweens
    updateTweens();

    if (context.gameModule.previewUpdate) {
      try {
        context.gameModule.previewUpdate(miniEngine, deltaTime);
      } catch (err) {
        // Silently ignore preview update errors
      }
    }

    miniEngine._render();
  }

  context.tickHandle = setInterval(tick, 33); // Run at ~30fps
  activeContexts.set(canvas, context);
}

/**
 * Stop a preview animation and free its resources.
 * @param {HTMLCanvasElement} canvas
 */
export function stopPreviewer(canvas) {
  const context = activeContexts.get(canvas);
  if (!context) return;

  clearInterval(context.tickHandle);
  activeContexts.delete(canvas);
}

/**
 * Stop all active preview animations.
 * Called when the launcher transitions to a game.
 */
export function stopAllPreviewers() {
  for (const canvas of activeContexts.keys()) {
    stopPreviewer(canvas);
  }
}

/**
 * Fallback preview renderer using Canvas 2D
 */
export function renderFallbackPreview(canvas, gameEntry) {
  const ctx    = canvas.getContext('2d');
  const width  = canvas.width;
  const height = canvas.height;

  // Gradient background using the game's theme color
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f3460');
  grad.addColorStop(1, '#16213e');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Game title initial letter (large)
  const initials = (gameEntry.title || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font      = `bold ${height * 0.45}px Nunito, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, width / 2, height / 2);

  // Subtle border glow
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}

/**
 * Build a pure Canvas 2D mini engine to bypass Pixi WebGL limits
 */
function buildCanvas2DMiniEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const width  = canvas.width;
  const height = canvas.height;
  const entities = [];

  return {
    width,
    height,
    spawn(options) {
      const entity = {
        x:     options.x ?? width / 2,
        y:     options.y ?? height / 2,
        scale: options.scale ?? 1,
        alpha: options.alpha ?? 1,
        angle: options.angle ?? 0,
        color: options.color ?? '#ffffff',
        text:  options.text ?? null,
        asset: options.asset ?? null,
        tint:  options.tint ?? null,
        _destroyed: false,
      };
      entities.push(entity);
      return entity;
    },
    destroy(entity) {
      if (!entity) return;
      entity._destroyed = true;
      const index = entities.indexOf(entity);
      if (index !== -1) {
        entities.splice(index, 1);
      }
    },
    animate(entity, targetProps, duration, easing = 'easeOut') {
      return animateEntity(entity, targetProps, duration, easing);
    },
    audio:   { play: () => {}, stop: () => {}, setVolume: () => {} },
    emit:    () => {},
    system:  { exit: () => {}, triggerWinState: () => {}, triggerLoseState: () => {} },

    // Called each frame by the preview loop to render all entities
    _render() {
      ctx.clearRect(0, 0, width, height);

      // Background Fill
      ctx.fillStyle = '#16213e';
      ctx.fillRect(0, 0, width, height);

      for (const e of entities) {
        if (e._destroyed) continue;
        ctx.save();
        ctx.globalAlpha = e.alpha;
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle * Math.PI / 180);
        ctx.scale(e.scale, e.scale);

        if (e.text) {
          ctx.fillStyle = e.color;
          ctx.font      = `bold 14px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else if (e.asset) {
          // Asset placeholder block
          ctx.fillStyle = e.color || '#e94560';
          // Draw a card back shape with a design
          ctx.fillRect(-16, -24, 32, 48);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(-12, -20, 24, 40);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Draw generic colored block
          ctx.fillStyle = e.color || '#e94560';
          ctx.fillRect(-12, -12, 24, 24);
        }
        ctx.restore();
      }
    },
  };
}
