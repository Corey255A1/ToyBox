// games/digital_coloring.js
// ToyBox Mini-Game: Digital Coloring
// Target age: 2–5 years | Interaction: Drag | Duration: ~3 min

const SCENE_KEYS = ['scene_dog', 'scene_cat', 'scene_elephant', 'scene_fish', 'scene_flower', 'scene_rainbow'];
const SCENE_NAMES = {
  scene_dog: 'Dog! 🐶',
  scene_cat: 'Cat! 🐱',
  scene_elephant: 'Elephant! 🐘',
  scene_fish: 'Fish! 🐟',
  scene_flower: 'Flower! 🌸',
  scene_rainbow: 'Rainbow! 🌈'
};
const SCENE_SOUNDS = {
  scene_dog: 'animal_sound_dog',
  scene_cat: 'animal_sound_cat',
  scene_elephant: 'animal_sound_elephant',
  scene_fish: 'reveal_whoosh',
  scene_flower: 'reveal_whoosh',
  scene_rainbow: 'reveal_whoosh'
};

export default {

  config: {
    background:      '#fef9e7',
    interactionMode: 'drag',
    assets: [
      ...SCENE_KEYS, 'scene_fog', 'particle_sparkle',
      'progress_bar_bg', 'progress_bar_fill'
    ],
    audio: ['brush_stroke', 'reveal_whoosh', 'animal_sound_dog', 'animal_sound_cat', 'animal_sound_elephant', 'win_jingle'],
  },

  init(engine) {
    this.sceneIndex = 0;
    this.sceneQueue = [...SCENE_KEYS].sort(() => Math.random() - 0.5);
    this.autoCompleted = false;
    this._completing = false;
    this.soundThrottle = 0;
    this.sparkleTimer = 0;
    this._subjectTimer = 0;
    this._nextSceneTimer = 0;
    
    this._loadScene(engine);

    // Prompt Header
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '🎨 Scratch to paint the picture!',
      fontSize: 28,
      color: '#4a3728',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
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
      x: engine.width / 2 - 150, // Start aligned left inside BG
      y: engine.height - 50,
      zIndex: 11
    });
    // Set anchor to left edge so scaling width stretches to the right
    if (this.progFill.anchor) {
      this.progFill.anchor.set(0, 0.5);
    }
    this.progFill.scale.x = 0;
  },

  update(engine, deltaTime) {
    if (this.isPreviewMode) return;

    if (this.soundThrottle > 0) {
      this.soundThrottle -= deltaTime;
    }

    // Update progress bar
    if (this.progFill) {
      const targetScale = Math.min(1, this.revealPercent / 0.3);
      this.progFill.scale.x = targetScale;
    }

    // Spawn random sparkles during auto-complete celebration
    if (this.autoCompleted && this.sparkleTimer > 0) {
      this.sparkleTimer -= deltaTime;
      if (Math.random() < 0.25) {
        this._spawnSparkle(engine, 100 + Math.random() * (engine.width - 200), 100 + Math.random() * (engine.height - 200));
      }
    }

    // Delta-time timers
    if (this._subjectTimer > 0) {
      this._subjectTimer -= deltaTime;
      if (this._subjectTimer <= 0) {
        this._announceSubject(engine);
      }
    }

    if (this._nextSceneTimer > 0) {
      this._nextSceneTimer -= deltaTime;
      if (this._nextSceneTimer <= 0) {
        this._nextScene(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isPreviewMode || this.autoCompleted) return;

    if (eventName === 'touch_down' || eventName === 'drag_start') {
      this._currentBrushR = this.brushSize;
      const { x, y } = payload;
      this._paintAt(x, y, engine);
    } else if (eventName === 'touch_move') {
      this._currentBrushR = Math.min(this.brushSize * 2.0, (this._currentBrushR || this.brushSize) * 1.08);
      const { x, y } = payload;
      this._paintAt(x, y, engine);
    } else if (eventName === 'drag_end') {
      this._currentBrushR = this.brushSize;
    }
  },

  onResize(engine) {
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
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
    if (this.bgSprite) {
      this.bgSprite.x = engine.width / 2;
      this.bgSprite.y = engine.height / 2;
      this.bgSprite.scale.set(scale);
    }

    if (this.fogSprite) {
      this.fogSprite.x = engine.width / 2;
      this.fogSprite.y = engine.height / 2;
      this.fogSprite.scale.set(scale);
    }

    if (this.nameLabel) {
      this.nameLabel.x = engine.width / 2;
      this.nameLabel.y = engine.height / 2;
    }

    if (!this.isPreviewMode && this.maskTexture) {
      this.maskTexture.resize(engine.width, engine.height);

      const clearG = new PIXI.Graphics();
      clearG.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(clearG, this.maskTexture, true);
      clearG.destroy();

      this.brushSize = engine.width * 0.09;

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
              this.brushGraphics.circle(cx, cy, this.brushSize);
            }
          }
        }
        this.brushGraphics.fill(0xffffff);
        engine.renderToTexture(this.brushGraphics, this.maskTexture, false);
      }
    }
  },

  _loadScene(engine) {
    this.autoCompleted = false;
    this._completing = false;
    this.cellsRevealed = 0;
    this.revealPercent = 0;
    this._subjectTimer = 0;
    this._nextSceneTimer = 0;

    const currentKey = this.sceneQueue[this.sceneIndex];

    // Spawn colorful revealed layer (zIndex 1)
    this.bgSprite = engine.spawn({
      id: 'bg_sprite',
      asset: currentKey,
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 1
    });
    // Scale to fill screen fully (both bgSprite and fogSprite)
    const scale = Math.max(engine.width / 1024, engine.height / 768);
    this.bgSprite.scale.set(scale);

    // Spawn background fog layer (gray/monochrome scene on top, zIndex 2)
    this.fogSprite = engine.spawn({
      id: 'fog_sprite',
      asset: 'scene_fog',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 2
    });
    this.fogSprite.tint = 0x999999; // grey fog
    this.fogSprite.scale.set(scale);

    // Setup reveal grid for tracking progress
    this.gridCols = 10;
    this.gridRows = 8;
    this.grid = new Array(this.gridCols * this.gridRows).fill(false);
    this.totalGridCells = this.gridCols * this.gridRows;

    // Check if we are running in full engine vs preview mode
    this.isPreviewMode = !engine.renderToTexture;
    
    if (!this.isPreviewMode) {
      // 1. Create WebGL render texture
      this.maskTexture = PIXI.RenderTexture.create({
        width: engine.width,
        height: engine.height
      });

      // 2. Create mask sprite (do NOT add to stage, just set as mask)
      this.maskSprite = new PIXI.Sprite(this.maskTexture);
      this.fogSprite.mask = this.maskSprite;

      // 3. Clear mask with solid white (fog opaque everywhere)
      const clearG = new PIXI.Graphics();
      clearG.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(clearG, this.maskTexture, true);
      clearG.destroy();

      // 4. Brush graphics object with erase blendMode
      this.brushGraphics = new PIXI.Graphics();
      this.brushGraphics.blendMode = 'erase';
      this.brushSize = engine.width * 0.09;
      this._currentBrushR = this.brushSize;
    } else {
      // In preview mode: simple overlay fade simulation
      this.bgSprite.alpha = 0;
    }
  },

  _paintAt(x, y, engine) {
    if (this.isPreviewMode || this.autoCompleted) return;

    // 1. Render eraser circles onto mask texture
    this.brushGraphics.clear();
    const offsets = [{ dx: 0, dy: 0 }, { dx: -14, dy: 8 }, { dx: 14, dy: 8 }];
    offsets.forEach(o => {
      this.brushGraphics.circle(x + o.dx, y + o.dy, this._currentBrushR);
    });
    this.brushGraphics.fill(0xffffff);
    engine.renderToTexture(this.brushGraphics, this.maskTexture, false);

    // 2. Play brush sound (throttled)
    if (this.soundThrottle <= 0) {
      engine.audio.play('brush_stroke', { volume: 0.4 });
      this.soundThrottle = 0.18;
    }

    // 3. Compute grid reveal
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
      this._triggerAutoComplete(engine);
    }
  },

  _triggerAutoComplete(engine) {
    if (this._completing) return;
    this._completing = true;
    this.autoCompleted = true;

    // Play reveal whoosh
    engine.audio.play('reveal_whoosh');

    if (!this.isPreviewMode) {
      // Tween fog alpha 0 over 600ms for melting effect
      engine.animate(this.fogSprite, { alpha: 0 }, 0.6, 'easeOut').then(() => {
        this._spawnSparkles(engine);
        // Subject name after 1.5s
        this._subjectTimer = 1.5;
        this._nextSceneTimer = 3.0;
      });
    } else {
      this.bgSprite.alpha = 1;
      this._spawnSparkles(engine);
      this._subjectTimer = 1.5;
      this._nextSceneTimer = 3.0;
    }
  },

  _spawnSparkles(engine) {
    // Sparkle burst celebration
    this.sparkleTimer = 2.0; // spawn sparkles for 2 seconds
    for (let i = 0; i < 15; i++) {
      this._spawnSparkle(engine, 100 + Math.random() * (engine.width - 200), 100 + Math.random() * (engine.height - 200));
    }

    // Animate bgSprite (slight pulse scale zoom)
    const baseScale = this.bgSprite.scale.x;
    engine.animate(this.bgSprite, { scale: baseScale * 1.05 }, 0.3, 'easeOut')
      .then(() => engine.animate(this.bgSprite, { scale: baseScale }, 0.2, 'bounce'));
  },

  _announceSubject(engine) {
    const sceneKey = this.sceneQueue[this.sceneIndex];
    const subjectName = SCENE_NAMES[sceneKey];

    // Spawn text label
    this.nameLabel = engine.spawn({
      id: 'subject_name',
      text: subjectName,
      fontSize: 54,
      color: '#d35400',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 15
    });
    this.nameLabel.scale.set(0);

    // Pop text label
    engine.animate(this.nameLabel, { scale: 1.2 }, 0.3, 'easeOut')
      .then(() => engine.animate(this.nameLabel, { scale: 1.0 }, 0.15, 'bounce'));

    // Play animal sound
    const animalSound = SCENE_SOUNDS[sceneKey];
    engine.audio.play(animalSound);
  },

  _nextScene(engine) {
    // Clean up current scene sprites
    engine.destroy(this.bgSprite);
    engine.destroy(this.fogSprite);
    if (this.nameLabel) engine.destroy(this.nameLabel);
    if (this.maskSprite) engine.destroy(this.maskSprite);
    if (this.brushGraphics) this.brushGraphics.destroy({ children: true });

    this.sceneIndex++;
    if (this.sceneIndex < this.sceneQueue.length) {
      this._loadScene(engine);
    } else {
      // All scenes finished
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({
        title: 'MASTER COLORIST!',
        message: 'You revealed all the beautiful pictures!',
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
    engine.animate(s, { y: y - 50, alpha: 0, angle: 180 }, 0.8, 'easeOut')
      .then(() => engine.destroy(s));
  },

  preview(miniEngine) {
    this.t = 0;
    this.bgSprite = miniEngine.spawn({ asset: 'scene_dog', color: '#ffb300', x: miniEngine.width/2, y: miniEngine.height/2, scale: 0.16 });
    this.fogSprite = miniEngine.spawn({ asset: 'scene_fog', color: '#7f8c8d', x: miniEngine.width/2, y: miniEngine.height/2, scale: 0.16, alpha: 0.8 });
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    // Simulate drag scratching by fading out the fog overlay
    if (this.t > 1 && this.t < 2.5) {
      this.fogSprite.alpha = Math.max(0, 0.8 - (this.t - 1) * 0.53);
    }
    if (this.t > 4) {
      this.t = 0;
      this.fogSprite.alpha = 0.8;
    }
  }

};
