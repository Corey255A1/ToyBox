// games/scratcher.js
// ToyBox Mini-Game: Scratcher (Random Location Edition)
// Target age: 2–5 years | Interaction: Drag | Duration: ~3 min

const REVEAL_KEYS = ['reveal_cow', 'reveal_duck', 'reveal_lion', 'reveal_rocket', 'reveal_butterfly', 'reveal_turtle'];
const SUBJECT_NAMES = {
  reveal_cow: 'Cow! 🐄',
  reveal_duck: 'Rubber Duck! 🦆',
  reveal_lion: 'Lion! 🦁',
  reveal_rocket: 'Rocket! 🚀',
  reveal_butterfly: 'Butterfly! 🦋',
  reveal_turtle: 'Turtle! 🐢'
};

export default {

  config: {
    background:      '#2c1810',
    interactionMode: 'drag',
    assets: [
      'scratch_surface', 'scratch_chip',
      ...REVEAL_KEYS, 'particle_sparkle', 'overlay_white',
      'progress_bar_bg', 'progress_bar_fill'
    ],
    audio: ['scratch_loop', 'reveal_flash', 'win_jingle'],
  },

  init(engine) {
    this.imageIndex = 0;
    this.imageQueue = [...REVEAL_KEYS].sort(() => Math.random() - 0.5);
    this.autoCompleting = false;
    this.scratchSoundTimer = 0;
    this.chips = [];
    this.sparkleTimer = 0;
    this._nextSceneTimer = 0;
    
    // Drag stroke tracking
    this.lastScratchX = null;
    this.lastScratchY = null;

    // Load first image
    this._loadImage(engine);

    // Title Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '✨ Scratch to reveal the surprise! ✨',
      fontSize: 26,
      color: '#fbe9e7',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
    });

    // Image Progress Counter
    this.counterLabel = engine.spawn({
      id: 'image_counter',
      text: `🖼 1 / ${this.imageQueue.length}`,
      fontSize: Math.max(16, engine.height * 0.03),
      color: '#e0e0e0',
      x: engine.width - 80,
      y: 30,
      zIndex: 12
    });

    // Progress bar BG
    this.progBg = engine.spawn({
      id: 'prog_bg',
      asset: 'progress_bar_bg',
      x: engine.width / 2,
      y: engine.height - 50,
      zIndex: 10
    });

    // Progress bar Fill
    this.progFill = engine.spawn({
      id: 'prog_fill',
      asset: 'progress_bar_fill',
      x: engine.width / 2 - 150,
      y: engine.height - 50,
      zIndex: 11
    });
    if (this.progFill.anchor) {
      this.progFill.anchor.set(0, 0.5);
    }
    this.progFill.scale.x = 0;
  },

  update(engine, deltaTime) {
    if (this.isPreviewMode) return;

    if (this.scratchSoundTimer > 0) {
      this.scratchSoundTimer -= deltaTime;
    }

    // Update progress bar scale relative to 75% reveal threshold
    if (this.progFill) {
      const targetScale = Math.min(1, this.revealPercent / 0.75);
      this.progFill.scale.x = targetScale;
    }

    // Spawn random sparkles during win celebration
    if (this.autoCompleting && this.sparkleTimer > 0) {
      this.sparkleTimer -= deltaTime;
      if (Math.random() < 0.2) {
        this._spawnSparkle(engine, 100 + Math.random() * (engine.width - 200), 100 + Math.random() * (engine.height - 200));
      }
    }

    // Update scratch particles (chips)
    this.chips = this.chips.filter((c) => {
      c._vy += 300 * deltaTime; // gravity
      c.x += c._vx * deltaTime;
      c.y += c._vy * deltaTime;
      c.alpha -= 2.5 * deltaTime;
      if (c.alpha <= 0) {
        engine.destroy(c);
        return false;
      }
      return true;
    });

    // Delta-time timers
    if (this._nextSceneTimer > 0) {
      this._nextSceneTimer -= deltaTime;
      if (this._nextSceneTimer <= 0) {
        this._doNextScene(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isPreviewMode || this.autoCompleting) return;

    const { x, y } = payload;

    if (eventName === 'touch_down' || eventName === 'drag_start') {
      this._currentBrushR = this.brushR;
      this.lastScratchX = x;
      this.lastScratchY = y;
      this._scratchAt(x, y, engine);
    } else if (eventName === 'touch_move') {
      this._scratchAt(x, y, engine);
    } else if (eventName === 'drag_end') {
      this.lastScratchX = null;
      this.lastScratchY = null;
    }
  },

  onResize(engine) {
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
    }

    if (this.counterLabel) {
      this.counterLabel.x = engine.width - 80;
      this.counterLabel.style.fontSize = Math.max(16, engine.height * 0.03);
    }

    if (this.progBg) {
      this.progBg.x = engine.width / 2;
      this.progBg.y = engine.height - 50;
    }

    if (this.progFill) {
      this.progFill.x = engine.width / 2 - 150;
      this.progFill.y = engine.height - 50;
    }

    const scale = Math.max(engine.width / 1024, engine.height / 768);
    const w = 1024 * scale;
    const h = 768 * scale;
    const left = engine.width / 2 - w / 2;
    const top = engine.height / 2 - h / 2;

    const cardW = w * 0.35;
    const cardH = h * 0.35;

    // Recalculate animal position from relative scale
    if (this.animalRx !== undefined) {
      this.animalX = left + cardW / 2 + this.animalRx * (w - cardW);
      this.animalY = top + cardH / 2 + this.animalRy * (h - cardH);
    }

    if (this.bgGraphic) {
      this.bgGraphicsDraw.clear();
      // Draw modern polished wood background floorboards
      this.bgGraphicsDraw.rect(0, 0, engine.width, engine.height).fill(0x2d1b13);
      const numPlanks = 8;
      const plankW = engine.width / numPlanks;
      for (let i = 1; i < numPlanks; i++) {
        this.bgGraphicsDraw.rect(i * plankW - 2, 0, 4, engine.height).fill({ color: 0x1e100a, alpha: 0.6 });
      }
      // Warm border vignettes
      for (let i = 1; i <= 6; i++) {
        const pad = i * 40;
        this.bgGraphicsDraw.rect(pad, pad, engine.width - pad * 2, engine.height - pad * 2)
                           .stroke({ color: 0x000000, width: 40, alpha: 0.06 });
      }
    }

    if (this.revealSprite) {
      if (this.autoCompleting) {
        this.revealSprite.x = engine.width / 2;
        this.revealSprite.y = engine.height / 2;
        this.revealSprite.scale.set(scale);
      } else {
        this.revealSprite.x = this.animalX;
        this.revealSprite.y = this.animalY;
        this.revealSprite.scale.set(scale * 0.35);
      }
    }

    if (this.scratchBg) {
      this.scratchBg.x = this.animalX;
      this.scratchBg.y = this.animalY;
      
      this.scratchGraphics.clear();
      
      // Beautiful card base
      this.scratchGraphics.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16).fill(0xbfbfbf); // metallic silver card
      
      // Double border: gold and white
      this.scratchGraphics.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16).stroke({ color: 0xd4af37, width: 6 }); // gold
      this.scratchGraphics.roundRect(-cardW / 2 + 5, -cardH / 2 + 5, cardW - 10, cardH - 10, 12).stroke({ color: 0xffffff, width: 2 }); // inner white
      
      // Subtle sparkles on the card surface
      this.scratchGraphics.circle(-cardW * 0.3, -cardH * 0.3, 4).fill(0xffffff);
      this.scratchGraphics.circle(cardW * 0.3, -cardH * 0.2, 3).fill(0xffffff);
      this.scratchGraphics.circle(-cardW * 0.2, cardH * 0.3, 5).fill(0xffffff);
      this.scratchGraphics.circle(cardW * 0.25, cardH * 0.25, 4).fill(0xffffff);
    }

    if (this.mysteryLabel) {
      this.mysteryLabel.x = 0;
      this.mysteryLabel.y = 0;
      this.mysteryLabel.style.fontSize = Math.max(20, Math.min(26, cardH * 0.16));
    }

    if (this.nameLabel) {
      this.nameLabel.x = engine.width / 2;
      this.nameLabel.y = engine.height / 2;
      this.nameLabel.style.fontSize = Math.max(64, engine.height * 0.12);
    }

    this.brushR = engine.width * 0.07;
    this._currentBrushR = this.brushR;
    this.cellW = cardW / this.gridCols;
    this.cellH = cardH / this.gridRows;

    // Redraw mask graphics scratches
    if (this.maskGraphics && this.scratches.length > 0) {
      this.maskGraphics.clear();
      this.scratches.forEach((s) => {
        this.maskGraphics.circle(s.x, s.y, s.r);
      });
      this.maskGraphics.fill(0xffffff);
    }
  },

  _loadImage(engine) {
    this.autoCompleting = false;
    this.cellsRevealed = 0;
    this.revealPercent = 0;
    this._nextSceneTimer = 0;
    this.scratches = [];

    // Generate relative coordinates inside the card boundaries
    this.animalRx = 0.05 + Math.random() * 0.9;
    this.animalRy = 0.05 + Math.random() * 0.9;

    const currentKey = this.imageQueue[this.imageIndex];

    if (this.counterLabel) {
      this.counterLabel.text = `🖼 ${this.imageIndex + 1} / ${this.imageQueue.length}`;
    }

    const scale = Math.max(engine.width / 1024, engine.height / 768);
    const w = 1024 * scale;
    const h = 768 * scale;
    const left = engine.width / 2 - w / 2;
    const top = engine.height / 2 - h / 2;

    const cardW = w * 0.35;
    const cardH = h * 0.35;

    // Calculate absolute positions using the random relative ratios
    this.animalX = left + cardW / 2 + this.animalRx * (w - cardW);
    this.animalY = top + cardH / 2 + this.animalRy * (h - cardH);

    // 0. Ambient wood vignette background (zIndex 0)
    this.bgGraphic = engine.spawn({
      id: 'scratcher_bg',
      x: 0,
      y: 0,
      zIndex: 0
    });
    this.bgGraphicsDraw = new PIXI.Graphics();
    this.bgGraphic.addChild(this.bgGraphicsDraw);

    this.bgGraphicsDraw.rect(0, 0, engine.width, engine.height).fill(0x2d1b13);
    const numPlanks = 8;
    const plankW = engine.width / numPlanks;
    for (let i = 1; i < numPlanks; i++) {
      this.bgGraphicsDraw.rect(i * plankW - 2, 0, 4, engine.height).fill({ color: 0x1e100a, alpha: 0.6 });
    }
    for (let i = 1; i <= 6; i++) {
      const pad = i * 40;
      this.bgGraphicsDraw.rect(pad, pad, engine.width - pad * 2, engine.height - pad * 2)
                         .stroke({ color: 0x000000, width: 40, alpha: 0.06 });
    }

    // 1. Bottom Layer: Solid grey card (zIndex 1)
    this.scratchBg = engine.spawn({
      id: 'scratch_bg',
      x: this.animalX,
      y: this.animalY,
      zIndex: 1
    });
    this.scratchGraphics = new PIXI.Graphics();
    this.scratchBg.addChild(this.scratchGraphics);

    this.scratchGraphics.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16).fill(0xbfbfbf);
    this.scratchGraphics.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16).stroke({ color: 0xd4af37, width: 6 });
    this.scratchGraphics.roundRect(-cardW / 2 + 5, -cardH / 2 + 5, cardW - 10, cardH - 10, 12).stroke({ color: 0xffffff, width: 2 });
    
    // Sparkles on card
    this.scratchGraphics.circle(-cardW * 0.3, -cardH * 0.3, 4).fill(0xffffff);
    this.scratchGraphics.circle(cardW * 0.3, -cardH * 0.2, 3).fill(0xffffff);
    this.scratchGraphics.circle(-cardW * 0.2, cardH * 0.3, 5).fill(0xffffff);
    this.scratchGraphics.circle(cardW * 0.25, cardH * 0.25, 4).fill(0xffffff);

    // Mystery Scratch Me label
    this.mysteryLabel = engine.spawn({
      id: 'mystery_label',
      text: '❓\nScratch Me!',
      fontSize: Math.max(20, Math.min(26, cardH * 0.16)),
      color: '#ffd700',
      x: 0,
      y: 0,
      zIndex: 10
    });
    if (this.mysteryLabel.style) {
      this.mysteryLabel.style.align = 'center';
      this.mysteryLabel.style.fontWeight = 'bold';
      this.mysteryLabel.style.stroke = '#1b1008';
      this.mysteryLabel.style.strokeThickness = 4;
    }
    if (this.mysteryLabel.parent) this.mysteryLabel.parent.removeChild(this.mysteryLabel);
    this.scratchBg.addChild(this.mysteryLabel);
    this.mysteryLabel.x = 0;
    this.mysteryLabel.y = 0;

    // 2. Top Layer: Colorful animal card (zIndex 2) - scaled down and placed randomly
    this.revealSprite = engine.spawn({
      id: 'reveal_sprite',
      asset: currentKey,
      x: this.animalX,
      y: this.animalY,
      zIndex: 2
    });
    this.revealSprite.scale.set(scale * 0.35);

    // 3. Stencil Mask Graphics Layer for revealSprite
    this.isPreviewMode = (engine.app == null) || (engine.width < 250);

    if (!this.isPreviewMode) {
      this.maskContainer = engine.spawn({
        id: 'scratch_mask_container',
        x: 0,
        y: 0,
        zIndex: 3
      });
      
      this.maskGraphics = new PIXI.Graphics();
      this.maskContainer.addChild(this.maskGraphics);

      // Mask revealSprite using maskContainer
      this.revealSprite.mask = this.maskContainer;

      this.brushR = engine.width * 0.07;
      this._currentBrushR = this.brushR;
    } else {
      this.revealSprite.alpha = 0;
    }

    // Grid tracking distributed over animal card bounds (8x6)
    this.gridCols = 8;
    this.gridRows = 6;
    this.grid = new Array(this.gridCols * this.gridRows).fill(false);
    this.totalGridCells = this.gridCols * this.gridRows;
    this.cellW = cardW / this.gridCols;
    this.cellH = cardH / this.gridRows;
  },

  _scratchAt(x, y, engine) {
    if (this.isPreviewMode || this.autoCompleting) return;

    // Smooth scratching: interpolate points if moving fast
    if (this.lastScratchX !== null && this.lastScratchY !== null) {
      const dist = Math.hypot(x - this.lastScratchX, y - this.lastScratchY);
      const steps = Math.max(1, Math.floor(dist / 8));
      
      for (let i = 1; i <= steps; i++) {
        const tx = this.lastScratchX + (x - this.lastScratchX) * (i / steps);
        const ty = this.lastScratchY + (y - this.lastScratchY) * (i / steps);
        this.scratches.push({ x: tx, y: ty, r: this._currentBrushR });
        this.maskGraphics.circle(tx, ty, this._currentBrushR);
        this._markGrid(tx, ty);
      }
      this.maskGraphics.fill(0xffffff);
    } else {
      this.scratches.push({ x, y, r: this._currentBrushR });
      this.maskGraphics.circle(x, y, this._currentBrushR).fill(0xffffff);
      this._markGrid(x, y);
    }

    this.lastScratchX = x;
    this.lastScratchY = y;

    // Spawn scratch metallic particles
    for (let i = 0; i < 2; i++) {
      const angle = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
      const speed = 60 + Math.random() * 100;
      const chip = engine.spawn({
        id: `chip_${Date.now()}_${Math.random()}`,
        asset: 'scratch_chip',
        x, y,
        scale: 0.4 + Math.random() * 0.4,
        zIndex: 4
      });
      chip.tint = Math.random() < 0.5 ? 0xc0c0c0 : 0xd4af37;
      chip._vx = Math.cos(angle) * speed;
      chip._vy = -(80 + Math.random() * 40);
      this.chips.push(chip);
    }

    // Play scratch sound (throttled)
    if (this.scratchSoundTimer <= 0) {
      engine.audio.play('scratch_loop', { volume: 0.35 });
      this.scratchSoundTimer = 0.15;
    }

    this.revealPercent = this.cellsRevealed / this.totalGridCells;

    // Check threshold (75% to auto-complete reveal)
    if (this.revealPercent >= 0.75) {
      this._triggerFlashWipe(engine);
    }
  },

  _markGrid(x, y) {
    const cardW = this.revealSprite.width;
    const cardH = this.revealSprite.height;
    const animLeft = this.animalX - cardW / 2;
    const animTop = this.animalY - cardH / 2;
    
    const brushR2 = this._currentBrushR * this._currentBrushR;

    for (let c = 0; c < this.gridCols; c++) {
      for (let r = 0; r < this.gridRows; r++) {
        const idx = r * this.gridCols + c;
        if (this.grid[idx]) continue;

        // Center coordinates of cell in screen space
        const cx = animLeft + c * this.cellW + this.cellW / 2;
        const cy = animTop + r * this.cellH + this.cellH / 2;

        const dx = cx - x;
        const dy = cy - y;
        if (dx * dx + dy * dy < brushR2) {
          this.grid[idx] = true;
          this.cellsRevealed++;
        }
      }
    }
  },

  _triggerFlashWipe(engine) {
    this.autoCompleting = true;
    engine.audio.play('reveal_flash');

    // 1. Spawn white overlay for camera flash
    const flashOverlay = engine.spawn({
      id: 'flash_overlay',
      asset: 'overlay_white',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 20
    });
    flashOverlay.width = engine.width;
    flashOverlay.height = engine.height;
    flashOverlay.alpha = 0;

    const scale = Math.max(engine.width / 1024, engine.height / 768);

    // 2. Animate flash: alpha 0 -> 1 -> 0
    engine.animate(flashOverlay, { alpha: 1.0 }, 0.2, 'easeOut')
      .then(() => {
        if (this.isPreviewMode) {
          this.revealSprite.alpha = 1;
        }
        
        // Remove mask from revealSprite
        this.revealSprite.mask = null;
        engine.destroy(this.maskContainer);

        // Hide bottom scratchBg card
        this.scratchBg.visible = false;

        // Slide and expand revealSprite to center full screen
        engine.animate(this.revealSprite, {
          x: engine.width / 2,
          y: engine.height / 2,
          scale: scale
        }, 0.4, 'easeOut');

        // Fade flash out
        return engine.animate(flashOverlay, { alpha: 0.0 }, 0.35, 'easeIn');
      })
      .then(() => {
        engine.destroy(flashOverlay);

        // Sparkle burst celebration
        this.sparkleTimer = 1.8;
        for (let i = 0; i < 12; i++) {
          this._spawnSparkle(engine, 150 + Math.random() * (engine.width - 300), 150 + Math.random() * (engine.height - 300));
        }

        // Subject Label Pop
        const currentKey = this.imageQueue[this.imageIndex];
        const subjectName = SUBJECT_NAMES[currentKey];

        this.nameLabel = engine.spawn({
          id: 'subject_name',
          text: subjectName,
          fontSize: Math.max(64, engine.height * 0.12),
          color: '#ffffff',
          x: engine.width / 2,
          y: engine.height / 2,
          zIndex: 15
        });
        this.nameLabel.scale.set(0);
        
        if (this.nameLabel.style) {
          this.nameLabel.style.stroke = '#2c1810';
          this.nameLabel.style.strokeThickness = 8;
        }

        engine.animate(this.nameLabel, { scale: 1.25 }, 0.3, 'easeOut')
          .then(() => engine.animate(this.nameLabel, { scale: 1.0 }, 0.15, 'bounce'));

        this._nextSceneTimer = 2.5;
      });
  },

  _doNextScene(engine) {
    if (this.nameLabel) engine.destroy(this.nameLabel);
    engine.destroy(this.revealSprite);
    engine.destroy(this.scratchBg);
    if (this.maskContainer) engine.destroy(this.maskContainer);
    if (this.bgGraphic) engine.destroy(this.bgGraphic);

    this.imageIndex++;
    if (this.imageIndex < this.imageQueue.length) {
      this._loadImage(engine);
    } else {
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({
        title: 'SCRATCH MASTER!',
        message: 'You revealed all 6 hidden animals and objects!',
        onReplay: () => this.init(engine),
        onExit: () => engine.system.exit(),
      });
    }
  },

  _spawnSparkle(engine, x, y) {
    const s = engine.spawn({
      id: `sparkle_${Date.now()}_${Math.random()}`,
      asset: 'particle_sparkle',
      x, y,
      scale: 0.3 + Math.random() * 0.4,
      zIndex: 10
    });
    engine.animate(s, { y: y - 60, alpha: 0, angle: 180 }, 0.7, 'easeOut')
      .then(() => engine.destroy(s));
  },

  preview(miniEngine) {
    this.t = 0;
    this.revealSprite = miniEngine.spawn({ asset: 'reveal_duck', color: '#ffeb3b', x: miniEngine.width/2, y: miniEngine.height/2, scale: 0.18 });
    this.scratchOverlay = miniEngine.spawn({ asset: 'scratch_surface', color: '#ffd700', x: miniEngine.width/2, y: miniEngine.height/2, scale: 0.18, alpha: 0.95 });
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    if (this.t > 1 && this.t < 2.5) {
      this.scratchOverlay.alpha = Math.max(0, 0.95 - (this.t - 1) * 0.63);
    }
    if (this.t > 4) {
      this.t = 0;
      this.scratchOverlay.alpha = 0.95;
    }
  }

};
