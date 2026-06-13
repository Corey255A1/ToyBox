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

        const color = e.color || '#e94560';

        if (e.text) {
          ctx.fillStyle = color;
          ctx.font      = `bold 14px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else if (e.asset) {
          const key = e.asset;
          ctx.fillStyle = color;
          ctx.strokeStyle = '#ffffff';

          if (key.includes('bubble')) {
            // Draw beautiful translucent bubble
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(color, 0.65);
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Highlight
            ctx.beginPath();
            ctx.arc(-5, -5, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fill();
          } else if (key.includes('star')) {
            // Draw star
            draw2DStar(ctx, 0, 0, 5, 18, 8, color);
          } else if (key.includes('balloon')) {
            // Draw balloon
            ctx.beginPath();
            ctx.ellipse(0, -4, 12, 16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // string
            ctx.beginPath();
            ctx.moveTo(0, 12);
            ctx.lineTo(0, 24);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.stroke();
          } else if (key.includes('door_closed')) {
            // Draw door
            ctx.fillRect(-15, -25, 30, 50);
            ctx.lineWidth = 2;
            ctx.strokeRect(-15, -25, 30, 50);
            // Knob
            ctx.beginPath();
            ctx.arc(8, 2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd700';
            ctx.fill();
          } else if (key.includes('door_frame')) {
            ctx.lineWidth = 4;
            ctx.strokeRect(-18, -28, 36, 56);
          } else if (key.includes('ball')) {
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (key.startsWith('piece_') || key.startsWith('shape_') || key.startsWith('slot_')) {
            const isSlot = key.startsWith('slot_') && !key.includes('glow');
            const shapeType = key.replace('piece_', '').replace('slot_', '').replace('shape_', '');
            draw2DShape(ctx, shapeType, color, isSlot);
          } else if (key.startsWith('animal_') || key.startsWith('obj_')) {
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
            // Draw label character inside
            const name = key.replace('animal_', '').replace('obj_', '').toUpperCase();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Nunito, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name.substring(0, 2), 0, 0);
          } else {
            // Card back or general block
            ctx.fillRect(-16, -24, 32, 48);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-12, -20, 24, 40);
          }
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(-12, -12, 24, 24);
        }
        ctx.restore();
      }
    },
  };
}

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function draw2DStar(ctx, cx, cy, spikes, outerRadius, innerRadius, color) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function draw2DShape(ctx, type, color, isSlot) {
  const size = 16;
  ctx.beginPath();
  if (type === 'circle') {
    ctx.arc(0, 0, size, 0, Math.PI * 2);
  } else if (type === 'square') {
    ctx.rect(-size, -size, size * 2, size * 2);
  } else if (type === 'triangle') {
    ctx.moveTo(0, -size);
    ctx.lineTo(size, size);
    ctx.lineTo(-size, size);
    ctx.closePath();
  } else if (type === 'star') {
    draw2DStar(ctx, 0, 0, 5, size * 1.1, size * 0.5, color);
    return;
  } else if (type === 'heart') {
    ctx.moveTo(0, -size * 0.4);
    ctx.bezierCurveTo(-size * 0.8, -size * 1.2, -size * 1.6, -size * 0.4, 0, size * 0.8);
    ctx.bezierCurveTo(size * 1.6, -size * 0.4, size * 0.8, -size * 1.2, 0, -size * 0.4);
  } else if (type === 'diamond') {
    ctx.moveTo(0, -size * 1.2);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size * 1.2);
    ctx.lineTo(-size, 0);
    ctx.closePath();
  } else if (type === 'oval') {
    ctx.ellipse(0, 0, size * 1.3, size * 0.8, 0, 0, Math.PI * 2);
  } else if (type === 'cross') {
    const w = size * 0.4;
    const h = size * 1.2;
    ctx.rect(-w, -h, w * 2, h * 2);
    ctx.rect(-h, -w, h * 2, w * 2);
  } else {
    ctx.arc(0, 0, size, 0, Math.PI * 2);
  }

  if (isSlot) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}
