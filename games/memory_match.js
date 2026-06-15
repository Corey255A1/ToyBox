// games/memory_match.js
// ToyBox Mini-Game: Animal Memory Match
// Target age: 2–6 years | Interaction: Tap | Duration: ~3 min

const ANIMAL_IDS = ['cow', 'duck', 'frog', 'pig', 'cat', 'dog'];

function applyCardScale(card, targetSize) {
  const tex = card.texture;
  if (!tex) return;

  const getWidth = () => {
    if (tex.source && tex.source.width > 1) return tex.source.width;
    if (tex.width > 1) return tex.width;
    return 0;
  };

  const getHeight = () => {
    if (tex.source && tex.source.height > 1) return tex.source.height;
    if (tex.height > 1) return tex.height;
    return 0;
  };

  let w = getWidth();
  let h = getHeight();

  if (w <= 1 || h <= 1) {
    if (card._assetName && card._assetName.startsWith('card_')) {
      w = 2048;
      h = 2048;
    } else {
      w = 64;
      h = 64;
    }

    // Listen to update to scale again when loaded
    tex.once('update', () => {
      applyCardScale(card, targetSize);
    });
  }

  const scale = targetSize / Math.max(w, h);
  card.scale.set(scale);
  card._baseScale = scale;
}

export default {

  config: {
    background:      '#0f3460',
    interactionMode: 'tap',
    assets:          ['card_back', 'card_cow', 'card_duck', 'card_frog',
                      'card_pig', 'card_cat', 'card_dog', 'ui_star'],
    audio:           ['flip_card', 'match_success', 'match_fail', 'win_jingle'],
  },

  init(engine) {
    if (this.bgGraphic) engine.destroy(this.bgGraphic);

    this.score        = 0;
    this.flippedCards = [];
    this.isLocked     = false;

    // Calculate responsive card size and grid spacing to maximize viewport usage
    const sideMargin = Math.max(40, engine.width * 0.08);
    const titleH = Math.max(60, engine.height * 0.15);
    const bottomMargin = Math.max(40, engine.height * 0.08);

    const availW = engine.width - 2 * sideMargin;
    const availH = engine.height - titleH - bottomMargin;

    // 4 columns, 3 rows.
    // Total grid width = 4 * cardSize + 3 * gap
    // Total grid height = 3 * cardSize + 2 * gap
    // Let's use a gap of 12% of cardSize (0.12 * cardSize)
    const cardSizeW = availW / 4.36;
    const cardSizeH = availH / 3.24;

    this.targetSize = Math.max(70, Math.min(cardSizeW, cardSizeH));
    this.gridGap = this.targetSize * 0.12;
    this.gridSpacing = this.targetSize + this.gridGap;

    // Centered alignment offsets
    const gamingCenterY = titleH + availH / 2;
    this.gridStartX = engine.width / 2 - (this.gridSpacing * 1.5);
    this.gridStartY = gamingCenterY - this.gridSpacing;

    // Create a responsive score label
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '⭐ 0',
      fontSize: Math.max(28, Math.min(48, engine.height * 0.07)),
      color: '#ffd700',
      x: engine.width / 2,
      y: Math.max(30, engine.height * 0.08),
      zIndex: 10,
    });

    // Create a shuffled deck (12 cards = 6 pairs)
    const pairs = [...ANIMAL_IDS, ...ANIMAL_IDS]
      .sort(() => Math.random() - 0.5);

    this.cards = pairs.map((animalId, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);

      const card = engine.spawn({
        id:      `card_${index}`,
        asset:   'card_back',
        x:       this.gridStartX + col * this.gridSpacing,
        y:       this.gridStartY + row * this.gridSpacing,
        scale:   1.0,
        onTouch: (self) => {
          if (!this.isLocked && !self._revealed) {
            this._flipCard(self, animalId, engine);
          }
        },
      });

      card._assetName = 'card_back';
      applyCardScale(card, this.targetSize);

      card._animalId  = animalId;
      card._revealed  = false;
      return card;
    });

    // 0. Setup tech gradient background (zIndex 0)
    this.bgGraphic = engine.spawn({
      id: 'memory_bg',
      x: 0,
      y: 0,
      zIndex: 0
    });
    this.bgGraphicsDraw = new PIXI.Graphics();
    this.bgGraphic.addChild(this.bgGraphicsDraw);
    this._drawBackground(engine);
  },

  _drawBackground(engine) {
    if (!this.bgGraphicsDraw) return;
    this.bgGraphicsDraw.clear();
    
    // Deeper cosmic purple-blue gradient
    const steps = 12;
    const stepH = engine.height / steps;
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      const r = Math.floor(0x11 + (0x07 - 0x11) * ratio);
      const g = Math.floor(0x1e + (0x0a - 0x1e) * ratio);
      const b = Math.floor(0x3e + (0x1b - 0x3e) * ratio);
      const hexColor = (r << 16) | (g << 8) | b;
      this.bgGraphicsDraw.rect(0, i * stepH, engine.width, stepH + 1).fill(hexColor);
    }
    
    // Draw subtle digital tech grid lines
    const size = 60;
    for (let x = 0; x < engine.width; x += size) {
      this.bgGraphicsDraw.rect(x, 0, 1, engine.height).fill({ color: 0xffffff, alpha: 0.04 });
    }
    for (let y = 0; y < engine.height; y += size) {
      this.bgGraphicsDraw.rect(0, y, engine.width, 1).fill({ color: 0xffffff, alpha: 0.04 });
    }
  },

  update(engine, deltaTime) {
    if (this.score >= ANIMAL_IDS.length) {
      this.score = 0; // Prevent duplicate triggers
      engine.audio.play('win_jingle');
      
      // Clean up background graphics
      if (this.bgGraphic) engine.destroy(this.bgGraphic);

      engine.system.triggerWinState({
        title: 'YOU MATCHED THEM ALL!',
        message: 'Fantastic memory!',
        graphic: 'ui_star',
        onReplay: () => {
          this.init(engine);
        },
        onExit: () => {
          engine.system.exit();
        }
      });
    }
  },

  _burstSparkles(x, y, engine) {
    const colors = [0xffd700, 0xffeb3b, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 80;
      const s = engine.spawn({
        id: `match_sparkle_${Date.now()}_${Math.random()}`,
        asset: 'ui_star',
        x, y,
        scale: 0.15 + Math.random() * 0.2,
        zIndex: 12
      });
      s.tint = colors[Math.floor(Math.random() * colors.length)];
      engine.animate(s, {
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        angle: 180
      }, 0.6, 'easeOut').then(() => engine.destroy(s));
    }
  },

  onEvent(engine, eventName, payload) {
    if (eventName === 'match_check') {
      const [cardA, cardB] = this.flippedCards;
      this.flippedCards = [];

      if (cardA._animalId === cardB._animalId) {
        // Match!
        engine.audio.play('match_success');
        
        // Pop animations
        engine.fx.pop(cardA);
        engine.fx.pop(cardB);

        // Burst matching stars
        this._burstSparkles(cardA.x, cardA.y, engine);
        this._burstSparkles(cardB.x, cardB.y, engine);

        this.score++;
        this.scoreLabel.text = `⭐ ${this.score}`;
        
        // Bounce score label
        engine.animate(this.scoreLabel, { scale: 1.3 }, 0.1, 'easeOut')
          .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

        this.isLocked = false;
      } else {
        // No match — flip back
        engine.audio.play('match_fail');
        
        // Wiggle cards on fail
        engine.fx.wiggle(cardA);
        engine.fx.wiggle(cardB).then(() => {
          engine.fx.flipCard(cardA, 'card_back');
          engine.fx.flipCard(cardB, 'card_back').then(() => {
            cardA._revealed = false;
            cardB._revealed = false;
            this.isLocked = false;
          });
        });
      }
    }
  },

  onResize(engine) {
    // Re-calculate responsive card size and grid spacing on screen size changes
    const sideMargin = Math.max(40, engine.width * 0.08);
    const titleH = Math.max(60, engine.height * 0.15);
    const bottomMargin = Math.max(40, engine.height * 0.08);

    const availW = engine.width - 2 * sideMargin;
    const availH = engine.height - titleH - bottomMargin;

    const cardSizeW = availW / 4.36;
    const cardSizeH = availH / 3.24;

    this.targetSize = Math.max(70, Math.min(cardSizeW, cardSizeH));
    this.gridGap = this.targetSize * 0.12;
    this.gridSpacing = this.targetSize + this.gridGap;

    const gamingCenterY = titleH + availH / 2;
    this.gridStartX = engine.width / 2 - (this.gridSpacing * 1.5);
    this.gridStartY = gamingCenterY - this.gridSpacing;

    if (this.bgGraphic) {
      this._drawBackground(engine);
    }

    // Reposition score label
    if (this.scoreLabel) {
      this.scoreLabel.x = engine.width / 2;
      this.scoreLabel.y = Math.max(30, engine.height * 0.08);
      this.scoreLabel.style.fontSize = Math.max(28, Math.min(48, engine.height * 0.07));
    }

    // Reposition and scale cards
    if (this.cards) {
      this.cards.forEach((card, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);

        card.x = this.gridStartX + col * this.gridSpacing;
        card.y = this.gridStartY + row * this.gridSpacing;

        applyCardScale(card, this.targetSize);
      });
    }
  },

  preview(miniEngine) {
    this._previewTime = 0;
    this._cards = [];

    // Spawn a 3×2 grid of simplified card backs for preview
    const cols = 3, rows = 2;
    for (let i = 0; i < cols * rows; i++) {
      const card = miniEngine.spawn({
        id:    `prev_card_${i}`,
        asset: 'card_back',
        x:     (miniEngine.width  / (cols + 1)) * ((i % cols) + 1),
        y:     (miniEngine.height / (rows + 1)) * (Math.floor(i / cols) + 1),
        scale: 0.5,
      });
      card._delay = i * 0.15;
      card.scale = 0; // Starts hidden, scales up
      this._cards.push(card);
    }
  },

  previewUpdate(miniEngine, deltaTime) {
    this._previewTime += deltaTime;

    for (const card of this._cards) {
      const t = this._previewTime - card._delay;
      if (t > 0 && t < 0.3) {
        card.scale = Math.min(0.5, t / 0.3 * 0.5);
      }
    }

    // Loop reset
    if (this._previewTime > 3) {
      this._previewTime = 0;
      for (const card of this._cards) {
        card.scale = 0;
      }
    }
  },

  _flipCard(card, animalId, engine) {
    this.isLocked = true;
    engine.audio.play('flip_card');
    
    engine.fx.flipCard(card, `card_${animalId}`).then(() => {
      card._revealed  = true;
      this.flippedCards.push(card);

      if (this.flippedCards.length === 2) {
        setTimeout(() => {
          engine.emit('match_check');
        }, 600);
      } else {
        this.isLocked = false;
      }
    });
  },

};
