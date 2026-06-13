// games/scratcher.js
// ToyBox Mini-Game: Scratcher
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

    // Image Progress Counter (SC-5)
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

    // Update progress bar
    if (this.progFill) {
      const targetScale = Math.min(1, this.revealPercent / 0.3);
      this.progFill.scale.x = targetScale;
    }

    // Spawn random sparkles during win celebration
    if (this.autoCompleting && this.sparkleTimer > 0) {
      this.sparkleTimer -= deltaTime;
      if (Math.random() < 0.2) {
        this._spawnSparkle(engine, 100 + Math.random() * (engine.width - 200), 100 + Math.random() * (engine.height - 200));
      }
    }

    // Update scratch particles (chips) (SC-2)
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
        this._nextScene(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isPreviewMode || this.autoCompleting) return;

    if (eventName === 'touch_down' || eventName === 'drag_start') {
      this._currentBrushR = this.brushR;
      const { x, y } = payload;
      this._scratchAt(x, y, engine);
    } else if (eventName === 'touch_move') {
      this._currentBrushR = Math.min(this.brushR * 2.0, (this._currentBrushR || this.brushR) * 1.08);
      const { x, y } = payload;
      this._scratchAt(x, y, engine);
    } else if (eventName === 'drag_end') {
      this._currentBrushR = this.brushR;
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
    if (this.revealSprite) {
      this.revealSprite.x = engine.width / 2;
      this.revealSprite.y = engine.height / 2;
      this.revealSprite.scale.set(scale);
    }

    if (this.scratchBg) {
      this.scratchBg.x = engine.width / 2;
      this.scratchBg.y = engine.height / 2;
      if (this.revealSprite) {
        this.scratchBg.width = this.revealSprite.width;
        this.scratchBg.height = this.revealSprite.height;
      } else {
        this.scratchBg.scale.set(Math.max(engine.width / 300, engine.height / 200));
      }
    }

    if (this.nameLabel) {
      this.nameLabel.x = engine.width / 2;
      this.nameLabel.y = engine.height / 2;
      this.nameLabel.style.fontSize = Math.max(64, engine.height * 0.12);
    }

    if (!this.isPreviewMode && this.maskTexture) {
      this.maskTexture.resize(engine.width, engine.height);

      const clearG = new PIXI.Graphics();
      clearG.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(clearG, this.maskTexture, true);
      clearG.destroy();

      this.brushR = engine.width * 0.07;

      if (this.brushGraphics && this.grid) {
        this.brushGraphics.clear();
        const cellW = engine.width / (this.gridCols || 10);
        const cellH = engine.height / (this.gridRows || 8);
        for (let c = 0; c < (this.gridCols || 10); c++) {
          for (let r = 0; r < (this.gridRows || 8); r++) {
            const idx = r * (this.gridCols || 10) + c;
            if (this.grid[idx]) {
              const cx = c * cellW + cellW / 2;
              const cy = r * cellH + cellH / 2;
              this.brushGraphics.circle(cx, cy, this.brushR);
            }
          }
        }
        this.brushGraphics.fill(0xffffff);
        engine.renderToTexture(this.brushGraphics, this.maskTexture, false);
      }
    }
  },

  _loadImage(engine) {
    this.autoCompleting = false;
    this.cellsRevealed = 0;
    this.revealPercent = 0;
    this._nextSceneTimer = 0;

    const currentKey = this.imageQueue[this.imageIndex];

    if (this.counterLabel) {
      this.counterLabel.text = `🖼 ${this.imageIndex + 1} / ${this.imageQueue.length}`;
    }

    // Background Layer: The colorful animal image to reveal (zIndex 1)
    this.revealSprite = engine.spawn({
      id: 'reveal_sprite',
      asset: currentKey,
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 1
    });
    const scale = Math.max(engine.width / 1024, engine.height / 768);
    this.revealSprite.scale.set(scale);

    // Foreground Layer: The scratch surface card on top (zIndex 2)
    this.scratchBg = engine.spawn({
      id: 'scratch_bg',
      asset: 'scratch_surface',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 2
    });
    // Scale scratchBg to match the revealSprite dimensions exactly
    this.scratchBg.width = this.revealSprite.width;
    this.scratchBg.height = this.revealSprite.height;

    // Grid tracking (10x8)
    this.gridCols = 10;
    this.gridRows = 8;
    this.grid = new Array(this.gridCols * this.gridRows).fill(false);
    this.totalGridCells = this.gridCols * this.gridRows;

    this.isPreviewMode = !engine.renderToTexture;

    if (!this.isPreviewMode) {
      // 1. Create WebGL render texture
      this.maskTexture = PIXI.RenderTexture.create({
        width: engine.width,
        height: engine.height
      });

      // 2. Create mask sprite (do NOT add to stage, just set as mask)
      this.maskSprite = new PIXI.Sprite(this.maskTexture);
      this.scratchBg.mask = this.maskSprite;

      // 3. Clear mask with solid white (scratchBg opaque everywhere)
      const clearG = new PIXI.Graphics();
      clearG.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(clearG, this.maskTexture, true);
      clearG.destroy();

      // 4. Brush settings with erase blendMode
      this.brushGraphics = new PIXI.Graphics();
      this.brushGraphics.blendMode = 'erase';
      this.brushR = engine.width * 0.07; // SC-3
      this._currentBrushR = this.brushR;
    } else {
      this.revealSprite.alpha = 0;
    }
  },

  _scratchAt(x, y, engine) {
    if (this.isPreviewMode || this.autoCompleting) return;

    // 1. Draw irregular brush onto mask texture
    this.brushGraphics.clear();
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: -this._currentBrushR * 0.35, dy: -this._currentBrushR * 0.25 },
      { dx: this._currentBrushR * 0.25, dy: this._currentBrushR * 0.35 },
    ];
    offsets.forEach(o => {
      this.brushGraphics.circle(x + o.dx, y + o.dy, this._currentBrushR * 0.85);
    });
    this.brushGraphics.fill(0xffffff);
    engine.renderToTexture(this.brushGraphics, this.maskTexture, false);

    // 2. Spawn scratch particles (debris)
    for (let i = 0; i < 2; i++) {
      const angle = Math.PI * 0.2 + Math.random() * Math.PI * 0.6; // downward arc
      const speed = 60 + Math.random() * 100;
      const chip = engine.spawn({
        id: `chip_${Date.now()}_${Math.random()}`,
        asset: 'scratch_chip',
        x, y,
        scale: 0.4 + Math.random() * 0.4,
        zIndex: 4
      });
      // Set random metallic tint
      chip.tint = Math.random() < 0.5 ? 0xc0c0c0 : 0xd4af37;
      chip._vx = Math.cos(angle) * speed;
      chip._vy = -(80 + Math.random() * 40); // upward velocity between -80 and -120 (SC-2)
      this.chips.push(chip);
    }

    // 3. Play scratch sound (throttled)
    if (this.scratchSoundTimer <= 0) {
      engine.audio.play('scratch_loop', { volume: 0.35 });
      this.scratchSoundTimer = 0.15;
    }

    // 4. Update reveal grid
    const cellW = engine.width / this.gridCols;
    const cellH = engine.height / this.gridRows;
    const brushR2 = this._currentBrushR * this._currentBrushR;

    for (let c = 0; c < this.gridCols; c++) {
      for (let r = 0; r < this.gridRows; r++) {
        const idx = r * this.gridCols + c;
        if (this.grid[idx]) continue;

        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;

        const dx = cx - x;
        const dy = cy - y;
        if (dx * dx + dy * dy < brushR2) {
          this.grid[idx] = true;
          this.cellsRevealed++;
        }
      }
    }

    this.revealPercent = this.cellsRevealed / this.totalGridCells;

    // Check threshold (30%)
    if (this.revealPercent >= 0.3) {
      this._triggerFlashWipe(engine);
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

    // 2. Animate flash: alpha 0 -> 1 -> 0
    engine.animate(flashOverlay, { alpha: 1.0 }, 0.2, 'easeOut')
      .then(() => {
        // At full flash opacity, remove the scratch overlay
        if (!this.isPreviewMode) {
          const fullG = new PIXI.Graphics();
          fullG.rect(0, 0, engine.width, engine.height).fill(0xffffff);
          engine.renderToTexture(fullG, this.maskTexture, true);
          fullG.destroy();
        } else {
          this.revealSprite.alpha = 1;
        }
        
        // Hide scratchBg instead of destroying (SC-4)
        this.scratchBg.visible = false;

        // Fade flash out
        return engine.animate(flashOverlay, { alpha: 0.0 }, 0.3, 'easeIn');
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
          fontSize: Math.max(64, engine.height * 0.12), // SC-6
          color: '#ffffff',
          x: engine.width / 2,
          y: engine.height / 2,
          zIndex: 15
        });
        this.nameLabel.scale.set(0);
        
        // Add soft drop shadow using outline
        if (this.nameLabel.style) {
          this.nameLabel.style.stroke = '#2c1810';
          this.nameLabel.style.strokeThickness = 8;
        }

        engine.animate(this.nameLabel, { scale: 1.25 }, 0.3, 'easeOut')
          .then(() => engine.animate(this.nameLabel, { scale: 1.0 }, 0.15, 'bounce'));

        // Load next image or exit after 2.5 seconds using delta timer
        this._nextSceneTimer = 2.5;
      });
  },

  _nextScene(engine) {
    if (this.nameLabel) engine.destroy(this.nameLabel);
    engine.destroy(this.revealSprite);
    engine.destroy(this.scratchBg); // Clean up the hidden scratchBg now
    if (this.maskContainer) engine.destroy(this.maskContainer);
    if (this.brushGraphics) this.brushGraphics.destroy({ children: true });

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
