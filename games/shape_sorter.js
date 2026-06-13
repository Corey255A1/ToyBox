// games/shape_sorter.js
// ToyBox Mini-Game: Shape Sorter
// Target age: 2–5 years | Interaction: Drag | Duration: ~3 min

const ALL_SHAPES = [
  { id: 'circle',   color: '#2196F3', key: 'circle' },
  { id: 'square',   color: '#F44336', key: 'square' },
  { id: 'triangle', color: '#4CAF50', key: 'triangle' },
  { id: 'star',     color: '#FFC107', key: 'star' },
  { id: 'heart',    color: '#E91E63', key: 'heart' },
  { id: 'diamond',  color: '#9C27B0', key: 'diamond' },
  { id: 'oval',     color: '#FF9800', key: 'oval' },
  { id: 'cross',    color: '#009688', key: 'cross' }
];

export default {

  config: {
    background:      '#e8f5e9', // Soft mint green background
    interactionMode: 'drag',
    assets: [
      'slot_glow', 'tray_bg', 'particle_sparkle' // SS-4: Removed 16 shape assets
    ],
    audio: ['snap_success', 'snap_fail', 'piece_pickup', 'win_jingle', 'round_complete'],
  },

  init(engine) {
    this.round = 1;
    this.sessionScore = 0;
    this.dragging = null;
    this.particles = [];
    this.glowPulsate = 0;
    this._progressTimer = 0;

    // Header Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '⭐ Drag shapes to match! ⭐',
      fontSize: 26,
      color: '#1b5e20',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
    });
    if (this.promptLabel.style) {
      this.promptLabel.style.stroke = '#ffffff';
      this.promptLabel.style.strokeThickness = 4;
    }

    this._startRound(engine);
  },

  update(engine, deltaTime) {
    // 1. Pulsate any visible glow highlights
    this.glowPulsate += deltaTime * 5;
    this.slots.forEach((slot) => {
      if (slot.glow && slot.glow.visible) {
        slot.glow.alpha = 0.45 + Math.sin(this.glowPulsate) * 0.25;
      }
    });

    // 2. Move sparkles
    this.particles = this.particles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      p.alpha -= 2.2 * deltaTime;
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });

    // 3. Delta-time progress timer (CX-1 / SS-5)
    if (this._progressTimer > 0) {
      this._progressTimer -= deltaTime;
      if (this._progressTimer <= 0) {
        this._doProgressRound(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (eventName === 'touch_down') {
      this._startDrag(payload, engine);
    } else if (eventName === 'touch_move') {
      this._continueDrag(payload, engine);
    } else if (eventName === 'touch_up') {
      this._endDrag(payload, engine);
    }
  },

  onResize(engine) {
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
    }

    const slotSize = Math.min(100, engine.width * 0.14);
    const spacingX = engine.width / ((this.totalPieces || 3) + 1);
    const slotsY = engine.height * 0.35;

    if (this.slots) {
      this.slots.forEach((slot, i) => {
        const x = spacingX * (i + 1);
        const y = slotsY;
        slot.x = x;
        slot.y = y;
        slot.size = slotSize;
        if (slot.glow) {
          slot.glow.x = x;
          slot.glow.y = y;
          slot.glow.scale.set((slotSize * 1.6) / 256);
        }
        if (slot.entity) {
          slot.entity.x = x;
          slot.entity.y = y;
          slot.entity.width = slotSize;
          slot.entity.height = slotSize;
          const slotColor = (slot.colorHex & 0xfefefe) >> 1 | 0x404040;
          if (slot.entity._graphics) {
            drawShape(slot.entity._graphics, slot.shapeKey, slot.filled ? slot.colorHex : slotColor, slotSize / 2, !slot.filled);
          }
        }
      });
    }

    this.trayH = engine.height * 0.28;
    if (this.traySprite) {
      this.traySprite.x = engine.width / 2;
      this.traySprite.y = engine.height - this.trayH / 2 - 5;
      this.traySprite.width = engine.width - 20;
      this.traySprite.height = this.trayH;
    }

    const trayY = engine.height - this.trayH / 2 - 5;
    if (this.pieces) {
      this.pieces.forEach((piece, i) => {
        piece.size = slotSize;
        piece.homeX = spacingX * (i + 1);
        piece.homeY = trayY;
        if (!piece.draggable) {
          const slot = this.slots ? this.slots.find(s => s.shapeId === piece.shapeId) : null;
          if (slot) {
            piece.entity.x = slot.x;
            piece.entity.y = slot.y;
          }
        } else {
          if (!this.dragging || this.dragging.piece !== piece) {
            piece.entity.x = piece.homeX;
            piece.entity.y = piece.homeY;
          }
        }
        piece.entity.width = slotSize * 0.95;
        piece.entity.height = slotSize * 0.95;

        const pieceG = piece.entity.children[0];
        if (pieceG && this.slots) {
          const slot = this.slots.find(s => s.shapeId === piece.shapeId);
          if (slot) {
            drawShape(pieceG, slot.shapeKey, slot.colorHex, slotSize / 2, false);
          }
        }
      });
    }
  },

  _startRound(engine) {
    // Clean up old pieces/slots
    if (this.pieces) this.pieces.forEach(p => engine.destroy(p.entity));
    if (this.slots) this.slots.forEach(s => {
      engine.destroy(s.entity);
      if (s.glow) engine.destroy(s.glow);
    });
    if (this.traySprite) engine.destroy(this.traySprite);

    this.piecesPlaced = 0;
    this.totalPieces = this.round === 1 ? 3 : 4;
    
    // Pick shapes for this round (SS-1 round novelty fix)
    let roundShapes = [];
    if (this.round === 1) {
      roundShapes = ALL_SHAPES.slice(0, 3); // Circle, Square, Triangle
    } else if (this.round === 2) {
      roundShapes = ALL_SHAPES.slice(3, 7); // Star, Heart, Diamond, Oval
    } else {
      // Round 3: Shuffled mix excluding Round 2 shapes
      const round2Ids = new Set(ALL_SHAPES.slice(3, 7).map(s => s.id));
      const eligible  = ALL_SHAPES.filter(s => !round2Ids.has(s.id));
      roundShapes = eligible.sort(() => Math.random() - 0.5).slice(0, 4);
    }

    // Positions & Grid
    const slotSize = Math.min(100, engine.width * 0.14);
    const spacingX = engine.width / (this.totalPieces + 1);
    const slotsY = engine.height * 0.35;

    // 1. Spawn Silhouette slots
    this.slots = roundShapes.map((shape, i) => {
      const x = spacingX * (i + 1);
      const y = slotsY;

      // Glow behind slot
      const glow = engine.spawn({
        id: `glow_${shape.id}`,
        asset: 'slot_glow',
        x, y,
        scale: (slotSize * 1.6) / 256,
        zIndex: 1
      });
      glow.visible = false;
      glow.tint = parseInt(shape.color.replace('#', ''), 16);

      // Slot silhouette outline (SS-4: draw with PIXI.Graphics directly)
      const entity = engine.spawn({
        id: `slot_${shape.id}`,
        x, y,
        zIndex: 2
      });
      const slotG = new PIXI.Graphics();
      // SS-3: Darkened variant of shape color instead of dark grey
      const slotColor = (parseInt(shape.color.replace('#', ''), 16) & 0xfefefe) >> 1 | 0x404040;
      drawShape(slotG, shape.key, slotColor, slotSize / 2, true);
      entity.addChild(slotG);

      entity.width = slotSize;
      entity.height = slotSize;
      entity._graphics = slotG;

      return {
        entity,
        shapeId: shape.id,
        shapeKey: shape.key,
        x, y,
        filled: false,
        glow,
        colorHex: parseInt(shape.color.replace('#', ''), 16),
        size: slotSize
      };
    });

    // 2. Spawn Tray background at bottom
    this.trayH = engine.height * 0.28;
    this.traySprite = engine.spawn({
      id: 'tray_bg',
      asset: 'tray_bg',
      x: engine.width / 2,
      y: engine.height - this.trayH / 2 - 5,
      zIndex: 1
    });
    this.traySprite.width = engine.width - 20;
    this.traySprite.height = this.trayH;
    this.traySprite.tint = 0xd7ccc8; // light wood/brown tray

    // 3. Spawn draggable pieces (shuffled horizontally in the tray, SS-4: draw directly)
    const shuffledShapes = [...roundShapes].sort(() => Math.random() - 0.5);
    const trayY = engine.height - this.trayH / 2 - 5;

    this.pieces = shuffledShapes.map((shape, i) => {
      const x = spacingX * (i + 1);
      const y = trayY;

      const entity = engine.spawn({
        id: `piece_${shape.id}`,
        x, y,
        zIndex: 4
      });
      const pieceG = new PIXI.Graphics();
      drawShape(pieceG, shape.key, parseInt(shape.color.replace('#', ''), 16), slotSize / 2, false);
      entity.addChild(pieceG);

      entity.width = slotSize * 0.95;
      entity.height = slotSize * 0.95;

      return {
        entity,
        shapeId: shape.id,
        homeX: x,
        homeY: y,
        draggable: true,
        size: slotSize
      };
    });
  },

  _startDrag(pointer, engine) {
    if (this.dragging) return;

    const { x, y } = pointer;
    const dragRadius = 70;

    // Find clicked piece
    for (const piece of this.pieces) {
      if (!piece.draggable) continue;

      const dx = piece.entity.x - x;
      const dy = piece.entity.y - y;
      if (dx * dx + dy * dy < dragRadius * dragRadius) {
        // Start dragging
        this.dragging = {
          piece,
          offsetX: piece.entity.x - x,
          offsetY: piece.entity.y - y
        };

        engine.audio.play('piece_pickup');
        piece.entity.zIndex = 10; // bring to top
        engine.animate(piece.entity, { scale: 1.18 }, 0.1, 'easeOut');
        break;
      }
    }
  },

  _continueDrag(pointer, engine) {
    if (!this.dragging) return;

    const { x, y } = pointer;
    const piece = this.dragging.piece;

    piece.entity.x = x + this.dragging.offsetX;
    piece.entity.y = y + this.dragging.offsetY;

    // Proximity checking for snap preview (glow)
    const slotSize = piece.size;
    const snapRadius = slotSize * 0.7;
    const autoSnapRadius = slotSize * 0.42; // Auto-snaps if toddler drags very close!

    for (const slot of this.slots) {
      if (slot.filled) continue;

      const dx = piece.entity.x - slot.x;
      const dy = piece.entity.y - slot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (slot.shapeId === piece.shapeId) {
        if (dist < autoSnapRadius) {
          // Trigger immediate auto-snap on drag!
          this.dragging = null;
          this._snapPiece(piece, slot, engine);
          return;
        }

        if (dist < snapRadius) {
          slot.glow.visible = true;
        } else {
          slot.glow.visible = false;
        }
      }
    }
  },

  _endDrag(pointer, engine) {
    if (!this.dragging) return;

    const piece = this.dragging.piece;
    this.dragging = null;

    const slotSize = piece.size;
    const snapRadius = slotSize * 0.7;

    // Find if correct slot is near
    let correctSlot = null;
    let wrongSlotNear = null;

    for (const slot of this.slots) {
      if (slot.filled) continue;

      const dx = piece.entity.x - slot.x;
      const dy = piece.entity.y - slot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < snapRadius) {
        if (slot.shapeId === piece.shapeId) {
          correctSlot = slot;
          break;
        } else {
          wrongSlotNear = slot;
        }
      }
    }

    if (correctSlot) {
      this._snapPiece(piece, correctSlot, engine);
    } else {
      // Scale back down
      engine.animate(piece.entity, { scale: 1.0 }, 0.15);

      if (wrongSlotNear) {
        // Play failed soft buzzer
        engine.audio.play('snap_fail');
        
        // Shake wrong slot
        engine.fx.wiggle(wrongSlotNear.entity);

        // Tween piece back home
        engine.animate(piece.entity, { x: piece.homeX, y: piece.homeY }, 0.3, 'easeOut')
          .then(() => {
            piece.entity.zIndex = 4;
          });
      } else {
        // Return home silently
        engine.animate(piece.entity, { x: piece.homeX, y: piece.homeY }, 0.3, 'easeOut')
          .then(() => {
            piece.entity.zIndex = 4;
          });
      }
    }
  },

  _snapPiece(piece, slot, engine) {
    piece.draggable = false;
    slot.filled = true;
    slot.glow.visible = false;
    piece.entity.zIndex = 3;

    // Lock position to slot center (SS-2: snap overshoot click anim)
    engine.animate(piece.entity, { x: slot.x, y: slot.y, scale: 1.1 }, 0.15, 'easeOut')
      .then(() => engine.animate(piece.entity, { scale: 1.2 }, 0.08, 'easeOut'))
      .then(() => engine.animate(piece.entity, { scale: 1.0 }, 0.12, 'bounce'));

    // Color fill the slot silhouette
    drawShape(slot.entity._graphics, slot.shapeKey, slot.colorHex, slot.size / 2, false);

    // Sparkle burst celebration
    this._spawnSparkleBurst(slot.x, slot.y, slot.colorHex, engine);

    // Audio
    engine.audio.play('snap_success');

    this.piecesPlaced++;
    this.sessionScore++;

    // Check round end
    if (this.piecesPlaced >= this.totalPieces) {
      this._progressRound(engine);
    }
  },

  _spawnSparkleBurst(x, y, tintColor, engine) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      const p = engine.spawn({
        id: `sparkle_${Date.now()}_${Math.random()}`,
        asset: 'particle_sparkle',
        x, y,
        scale: 0.3 + Math.random() * 0.4,
        zIndex: 5
      });
      p._vx = Math.cos(angle) * speed;
      p._vy = Math.sin(angle) * speed;
      p.tint = tintColor;
      this.particles.push(p);
    }
  },

  _progressRound(engine) {
    this._progressTimer = 1.0; // SS-5
  },

  _doProgressRound(engine) {
    this.round++;
    if (this.round <= 3) {
      engine.audio.play('round_complete');
      this._startRound(engine);
    } else {
      // Finished all rounds
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({
        title: 'SHAPE SHAPE CHAMPION!',
        message: `Incredible! You completed all shape matching puzzles!`,
        onReplay: () => this.init(engine),
        onExit: () => engine.system.exit(),
      });
    }
  },

  preview(miniEngine) {
    this.t = 0;
    
    // Spawn 1 slot (triangle) and 1 piece (triangle)
    this.slot = miniEngine.spawn({
      asset: 'slot_triangle',
      color: '#4caf50',
      x: miniEngine.width * 0.5,
      y: miniEngine.height * 0.32,
      scale: 0.5
    });
    this.slot.tint = 0x555555; // outlined silhouette look

    this.piece = miniEngine.spawn({
      asset: 'piece_triangle',
      color: '#4caf50',
      x: miniEngine.width * 0.5,
      y: miniEngine.height * 0.78,
      scale: 0.45
    });

    this.sparkles = [];
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;

    if (this.t < 1.8) {
      // Piece travels upward
      const frac = this.t / 1.8;
      this.piece.y = miniEngine.height * (0.78 - frac * 0.46);
    } else if (this.t >= 1.8 && this.t < 2.0) {
      // Snaps
      this.piece.y = miniEngine.height * 0.32;
      this.slot.tint = 0x4caf50; // filled
      
      // Sparkle simulated
      if (this.sparkles.length === 0) {
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const sp = miniEngine.spawn({
            asset: 'particle_sparkle',
            color: '#4caf50',
            x: miniEngine.width * 0.5,
            y: miniEngine.height * 0.32,
            scale: 0.2
          });
          sp._vx = Math.cos(angle) * 45;
          sp._vy = Math.sin(angle) * 45;
          this.sparkles.push(sp);
        }
      }
    }

    // Move sparkles
    this.sparkles.forEach((sp) => {
      sp.x += sp._vx * dt;
      sp.y += sp._vy * dt;
      sp.alpha -= 2.0 * dt;
    });

    if (this.t > 3.5) {
      this.t = 0;
      this.piece.y = miniEngine.height * 0.78;
      this.slot.tint = 0x555555;
      this.sparkles.forEach(sp => miniEngine.destroy(sp));
      this.sparkles = [];
    }
  }

};

function drawShape(g, type, colorHex, size, isSlot) {
  g.clear();
  if (type === 'circle') {
    if (isSlot) {
      g.circle(0, 0, size).stroke({ color: colorHex, width: 6 });
    } else {
      g.circle(0, 0, size).fill(colorHex);
    }
  } else if (type === 'square') {
    if (isSlot) {
      g.rect(-size, -size, size * 2, size * 2).stroke({ color: colorHex, width: 6 });
    } else {
      g.rect(-size, -size, size * 2, size * 2).fill(colorHex);
    }
  } else if (type === 'triangle') {
    const pts = [0, -size, size, size, -size, size];
    if (isSlot) {
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      g.poly(pts).fill(colorHex);
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
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      drawStar(g, 0, 0, 5, size * 1.1, size * 0.5, colorHex);
    }
  } else if (type === 'heart') {
    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += 0.05) {
      const x = 16 * Math.pow(Math.sin(t), 3) * (size / 16);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) * (size / 16);
      pts.push(x, y);
    }
    if (isSlot) {
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      g.poly(pts).fill(colorHex);
    }
  } else if (type === 'diamond') {
    const pts = [0, -size * 1.2, size, 0, 0, size * 1.2, -size, 0];
    if (isSlot) {
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      g.poly(pts).fill(colorHex);
    }
  } else if (type === 'oval') {
    if (isSlot) {
      g.ellipse(0, 0, size * 1.3, size * 0.8).stroke({ color: colorHex, width: 6 });
    } else {
      g.ellipse(0, 0, size * 1.3, size * 0.8).fill(colorHex);
    }
  } else if (type === 'cross') {
    const w = size * 0.4;
    const h = size * 1.2;
    if (isSlot) {
      g.poly([-w, -h, w, -h, w, -w, h, -w, h, w, w, w, w, h, -w, h, -w, w, -h, w, -h, -w, -w, -w]).stroke({ color: colorHex, width: 6 });
    } else {
      g.rect(-w, -h, w * 2, h * 2).fill(colorHex);
      g.rect(-h, -w, h * 2, w * 2).fill(colorHex);
    }
  }
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
