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
      'slot_glow', 'tray_bg', 'particle_sparkle', 'ui_dot_empty', 'ui_dot_filled'
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

    // Spawn soft decorative background elements to improve visual design
    this.bgDecorations = [];
    const decorColors = [0xc8e6c9, 0xa5d6a7, 0xe8f5e9];
    const decorPositions = [
      { x: engine.width * 0.15, y: engine.height * 0.2, size: 120 },
      { x: engine.width * 0.85, y: engine.height * 0.25, size: 160 },
      { x: engine.width * 0.1,  y: engine.height * 0.75, size: 180 },
      { x: engine.width * 0.9,  y: engine.height * 0.7, size: 140 }
    ];

    decorPositions.forEach((pos, idx) => {
      const entity = engine.spawn({
        id: `bg_decor_${idx}`,
        x: pos.x,
        y: pos.y,
        zIndex: 0 // Behind gameplay objects
      });
      const g = new PIXI.Graphics();
      const shapeType = ['circle', 'star', 'heart', 'diamond'][idx % 4];
      const color = decorColors[idx % decorColors.length];
      drawShape(g, shapeType, color, pos.size / 2, false);
      entity.addChild(g);
      entity.alpha = 0.35;
      this.bgDecorations.push(entity);
    });

    // Setup round progress dots at top of screen (6 rounds total)
    this.progressDots = [];
    const totalRounds = 6;
    const dotSpacing = 35;
    const startDotX = engine.width / 2 - (totalRounds - 1) * dotSpacing / 2;
    const dotsY = 85;

    for (let i = 0; i < totalRounds; i++) {
      const dot = engine.spawn({
        id: `dot_${i}`,
        asset: 'ui_dot_empty',
        x: startDotX + i * dotSpacing,
        y: dotsY,
        scale: 0.8,
        zIndex: 10
      });
      this.progressDots.push(dot);
    }

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
    if (eventName === 'touch_down' || eventName === 'drag_start') {
      this._startDrag(payload, engine);
    } else if (eventName === 'touch_move') {
      this._continueDrag(payload, engine);
    } else if (eventName === 'touch_up' || eventName === 'drag_end') {
      this._endDrag(payload, engine);
    }
  },

  onResize(engine) {
    if (!this.slots || !this.pieces) return;

    const headerHeight = Math.max(90, engine.height * 0.13);
    const dotsY = headerHeight * 0.72;

    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
      this.promptLabel.y = headerHeight * 0.35;
    }

    // Reposition background decorations
    if (this.bgDecorations) {
      const decorPositions = [
        { x: engine.width * 0.15, y: engine.height * 0.2 },
        { x: engine.width * 0.85, y: engine.height * 0.25 },
        { x: engine.width * 0.1,  y: engine.height * 0.75 },
        { x: engine.width * 0.9,  y: engine.height * 0.7 }
      ];
      this.bgDecorations.forEach((entity, idx) => {
        const pos = decorPositions[idx];
        if (pos) {
          entity.x = pos.x;
          entity.y = pos.y;
        }
      });
    }

    // Reposition progress dots
    if (this.progressDots) {
      const totalRounds = 6;
      const dotSpacing = 35;
      const startDotX = engine.width / 2 - (totalRounds - 1) * dotSpacing / 2;
      this.progressDots.forEach((dot, i) => {
        dot.x = startDotX + i * dotSpacing;
        dot.y = dotsY;
      });
    }

    // Define base spacing multipliers
    const slotSpacingMult = 1.45;
    const pieceSpacingMult = 1.35;
    
    // We want the tray width to fit within engine.width * 0.92
    const maxTrayWidth = engine.width * 0.92;
    const widthFactor = (this.totalPieces - 1) * pieceSpacingMult + 1.6;
    const maxSlotSizeByWidth = maxTrayWidth / widthFactor;
    
    // We also want slots and tray to fit vertically.
    const bottomMargin = Math.max(20, engine.height * 0.05);
    const availableHeight = engine.height - headerHeight - bottomMargin;
    const maxSlotSizeByHeight = availableHeight * 0.22;
    
    // Combine constraints and clamp between reasonable min/max values
    const slotSize = Math.max(65, Math.min(140, Math.min(maxSlotSizeByWidth, maxSlotSizeByHeight)));
    
    this.trayH = slotSize * 1.45;
    const trayY = engine.height - this.trayH / 2 - bottomMargin;
    
    const slotsY = headerHeight + (trayY - this.trayH / 2 - headerHeight) / 2;

    const slotSpacing = slotSize * slotSpacingMult;
    this.slotsStartX = engine.width / 2 - ((this.totalPieces - 1) * slotSpacing) / 2;

    const pieceSpacing = slotSize * pieceSpacingMult;
    this.piecesStartX = engine.width / 2 - ((this.totalPieces - 1) * pieceSpacing) / 2;

    const trayW = (this.totalPieces - 1) * pieceSpacing + slotSize * 1.6;

    if (this.slots) {
      this.slots.forEach((slot, i) => {
        const x = this.slotsStartX + i * slotSpacing;
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
          slot.entity.scale.set(1.0);
          const slotColor = (slot.colorHex & 0xfefefe) >> 1 | 0x404040;
          if (slot.entity._graphics) {
            drawShape(slot.entity._graphics, slot.shapeKey, slot.filled ? slot.colorHex : slotColor, slotSize / 2, !slot.filled);
          }
        }
      });
    }

    if (this.trayEntity) {
      this.trayEntity.x = engine.width / 2;
      this.trayEntity.y = trayY;
      
      const shadowG = this.trayEntity._shadow;
      const trayG = this.trayEntity._graphics;
      
      if (shadowG && trayG) {
        shadowG.clear();
        // Drop shadow for the tray box
        shadowG.roundRect(-trayW / 2, -this.trayH / 2, trayW, this.trayH, 24)
               .fill({ color: 0x000000, alpha: 0.12 });
        shadowG.y = 8; // Offset shadow vertically
        
        trayG.clear();
        // Wood-like outer tray frame
        trayG.roundRect(-trayW / 2, -this.trayH / 2, trayW, this.trayH, 24)
             .fill(0xd7ccc8); // warm soft wood background
        trayG.roundRect(-trayW / 2, -this.trayH / 2, trayW, this.trayH, 24)
             .stroke({ color: 0x8d6e63, width: 6 }); // nice bold wooden outline
             
        // Recessed inner bed
        const innerPadding = Math.max(10, slotSize * 0.12);
        const innerW = trayW - innerPadding * 2;
        const innerH = this.trayH - innerPadding * 2;
        trayG.roundRect(-innerW / 2, -innerH / 2, innerW, innerH, 16)
             .fill(0xa1887f); // slightly darker recessed tray bed
        trayG.roundRect(-innerW / 2, -innerH / 2, innerW, innerH, 16)
             .stroke({ color: 0x6d4c41, width: 2 });

        // Grooves under each piece
        const relPiecesStartX = - ((this.totalPieces - 1) * pieceSpacing) / 2;
        for (let j = 0; j < this.totalPieces; j++) {
          const grooveX = relPiecesStartX + j * pieceSpacing;
          const grooveSize = slotSize * 0.95;
          trayG.roundRect(grooveX - grooveSize / 2, -grooveSize / 2, grooveSize, grooveSize, 12)
               .fill({ color: 0x8d6e63, alpha: 0.25 });
        }
      }
    }

    if (this.pieces) {
      this.pieces.forEach((piece, i) => {
        piece.size = slotSize;
        piece.homeX = this.piecesStartX + i * pieceSpacing;
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
        if (!this.dragging || this.dragging.piece !== piece) {
          piece.entity.scale.set(0.95);
        }

        const shadowG = piece.entity.children[0];
        const pieceG = piece.entity.children[1];
        if (shadowG && this.slots) {
          const slot = this.slots.find(s => s.shapeId === piece.shapeId);
          if (slot) {
            drawShape(shadowG, slot.shapeKey, 0x000000, slotSize / 2, false);
          }
        }
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
    if (this.trayEntity) engine.destroy(this.trayEntity);

    this.piecesPlaced = 0;
    
    // Starts with 2 shapes for rounds 1-2, 3 shapes for rounds 3-4, 4 shapes for rounds 5-6
    this.totalPieces = this.round <= 2 ? 2 : (this.round <= 4 ? 3 : 4);
    
    // Pick unique random shapes from ALL_SHAPES so it's completely different each play
    const roundShapes = [...ALL_SHAPES]
      .sort(() => Math.random() - 0.5)
      .slice(0, this.totalPieces);

    // Update Header Prompt with round and count details
    if (this.promptLabel) {
      this.promptLabel.text = `⭐ Round ${this.round}: Match ${this.totalPieces} Shapes! ⭐`;
    }

    // Update progress indicator dots
    this._updateProgressDots(engine);

    // 1. Spawn Silhouette slots (without positions, will be placed in onResize)
    this.slots = roundShapes.map((shape) => {
      // Glow behind slot
      const glow = engine.spawn({
        id: `glow_${shape.id}`,
        asset: 'slot_glow',
        zIndex: 1
      });
      glow.visible = false;
      glow.tint = parseInt(shape.color.replace('#', ''), 16);

      // Slot silhouette outline
      const entity = engine.spawn({
        id: `slot_${shape.id}`,
        zIndex: 2
      });
      const slotG = new PIXI.Graphics();
      entity.addChild(slotG);
      entity._graphics = slotG;

      return {
        entity,
        shapeId: shape.id,
        shapeKey: shape.key,
        x: 0,
        y: 0,
        filled: false,
        glow,
        colorHex: parseInt(shape.color.replace('#', ''), 16),
        size: 80
      };
    });

    // 2. Spawn Tray container at bottom
    this.trayEntity = engine.spawn({
      id: 'tray_container',
      zIndex: 1
    });
    const shadowG = new PIXI.Graphics();
    const trayG = new PIXI.Graphics();
    this.trayEntity.addChild(shadowG);
    this.trayEntity.addChild(trayG);
    this.trayEntity._shadow = shadowG;
    this.trayEntity._graphics = trayG;

    // 3. Spawn draggable pieces (shuffled horizontally in the tray, will be placed in onResize)
    const shuffledShapes = [...roundShapes].sort(() => Math.random() - 0.5);

    this.pieces = shuffledShapes.map((shape) => {
      const entity = engine.spawn({
        id: `piece_${shape.id}`,
        zIndex: 4
      });

      // Add a soft drop shadow graphics child (drawn at bottom index 0)
      const shadowG = new PIXI.Graphics();
      shadowG.alpha = 0.2;
      shadowG.visible = false;
      entity.addChild(shadowG);

      // Add actual colored piece graphics (drawn at index 1)
      const pieceG = new PIXI.Graphics();
      entity.addChild(pieceG);

      return {
        entity,
        shapeId: shape.id,
        homeX: 0,
        homeY: 0,
        draggable: true,
        size: 80
      };
    });

    // Run positioning and initial draw
    this.onResize(engine);
  },

  _updateProgressDots(engine) {
    if (!this.progressDots) return;
    this.progressDots.forEach((dot, i) => {
      const isCompleted = this.round > (i + 1);
      const targetAsset = isCompleted ? 'ui_dot_filled' : 'ui_dot_empty';
      if (dot.texture) {
        dot.texture = PIXI.Assets.get(targetAsset) || dot.texture;
      }
      
      if (this.round === (i + 1)) {
        dot.scale.set(1.1);
        dot.tint = 0xFFC107; // gold active round tint
      } else {
        dot.scale.set(0.8);
        dot.tint = isCompleted ? 0xffffff : 0xbbbbbb;
      }
    });
  },

  _startDrag(pointer, engine) {
    if (this.dragging) return;

    const { x, y } = pointer;

    // Find clicked piece
    for (const piece of this.pieces) {
      if (!piece.draggable) continue;

      const dragRadius = piece.size * 0.75;
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
        
        // Show and offset drop shadow child
        const shadow = piece.entity.children[0];
        if (shadow) {
          shadow.visible = true;
          engine.animate(shadow, { x: 8, y: 12 }, 0.1, 'easeOut');
        }

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

    // Reset shadow offset and hide it
    const shadow = piece.entity.children[0];
    if (shadow) {
      engine.animate(shadow, { x: 0, y: 0 }, 0.15, 'easeOut').then(() => {
        shadow.visible = false;
      });
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

    // Hide shadow on snap
    const shadow = piece.entity.children[0];
    if (shadow) {
      shadow.visible = false;
    }

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
    // Fill the round progress star/dot with a beautiful bounce pop
    if (this.progressDots) {
      const currentDot = this.progressDots[this.round - 1];
      if (currentDot) {
        currentDot.texture = PIXI.Assets.get('ui_dot_filled') || currentDot.texture;
        currentDot.tint = 0xffffff;
        engine.animate(currentDot, { scale: 1.4 }, 0.15, 'easeOut')
          .then(() => engine.animate(currentDot, { scale: 0.8 }, 0.15, 'bounce'));
      }
    }
    this._progressTimer = 1.0; // SS-5
  },

  _doProgressRound(engine) {
    this.round++;
    if (this.round <= 6) { // 6 rounds total
      engine.audio.play('round_complete');
      this._startRound(engine);
    } else {
      // Finished all rounds
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({
        title: 'SHAPE CHAMPION! 🏆',
        message: `Outstanding! You solved all 6 shape matching puzzle rounds!`,
        graphic: 'ui_star',
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
      g.circle(0, 0, size).fill({ color: colorHex, alpha: 0.15 });
      g.circle(0, 0, size).stroke({ color: colorHex, width: 6 });
    } else {
      g.circle(0, 0, size).fill(colorHex);
    }
  } else if (type === 'square') {
    if (isSlot) {
      g.rect(-size, -size, size * 2, size * 2).fill({ color: colorHex, alpha: 0.15 });
      g.rect(-size, -size, size * 2, size * 2).stroke({ color: colorHex, width: 6 });
    } else {
      g.rect(-size, -size, size * 2, size * 2).fill(colorHex);
    }
  } else if (type === 'triangle') {
    const pts = [0, -size, size, size, -size, size];
    if (isSlot) {
      g.poly(pts).fill({ color: colorHex, alpha: 0.15 });
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
      g.poly(pts).fill({ color: colorHex, alpha: 0.15 });
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
      g.poly(pts).fill({ color: colorHex, alpha: 0.15 });
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      g.poly(pts).fill(colorHex);
    }
  } else if (type === 'diamond') {
    const pts = [0, -size * 1.2, size, 0, 0, size * 1.2, -size, 0];
    if (isSlot) {
      g.poly(pts).fill({ color: colorHex, alpha: 0.15 });
      g.poly(pts).stroke({ color: colorHex, width: 6 });
    } else {
      g.poly(pts).fill(colorHex);
    }
  } else if (type === 'oval') {
    if (isSlot) {
      g.ellipse(0, 0, size * 1.3, size * 0.8).fill({ color: colorHex, alpha: 0.15 });
      g.ellipse(0, 0, size * 1.3, size * 0.8).stroke({ color: colorHex, width: 6 });
    } else {
      g.ellipse(0, 0, size * 1.3, size * 0.8).fill(colorHex);
    }
  } else if (type === 'cross') {
    const w = size * 0.4;
    const h = size * 1.2;
    const pts = [-w, -h, w, -h, w, -w, h, -w, h, w, w, w, w, h, -w, h, -w, w, -h, w, -h, -w, -w, -w];
    if (isSlot) {
      g.poly(pts).fill({ color: colorHex, alpha: 0.15 });
      g.poly(pts).stroke({ color: colorHex, width: 6 });
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
