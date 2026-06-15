// games/bubble_pop.js
// ToyBox Mini-Game: Bubble Pop
// Target age: 2–6 years | Interaction: Tap | Duration: ~2 min

const BUBBLE_COLORS = ['blue', 'green', 'pink', 'yellow', 'purple', 'orange'];
const THEME_DATA = {
  letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
  numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
  shapes:  ['●', '■', '▲', '★', '♥', '♦'],
  colors:  ['BLUE', 'GREEN', 'PINK', 'YELLOW', 'PURPLE', 'ORANGE'],
  animals: ['CAT', 'DOG', 'COW', 'PIG', 'DUCK', 'FROG', 'BEAR', 'BIRD'] // BP-1
};

export default {

  config: {
    background:      '#1b2a4a',
    interactionMode: 'tap',
    assets: [
      'bubble_blue', 'bubble_green', 'bubble_pink', 'bubble_yellow', 'bubble_purple', 'bubble_orange',
      'particle_glitter', 'ui_star', 'prompt_bg',
      'animal_cat', 'animal_dog', 'animal_cow', 'animal_pig', 'animal_duck', 'animal_frog', 'animal_bear', 'animal_bird' // BP-1
    ],
    audio: ['pop_sound', 'win_jingle', 'whoosh_fail', 'round_start'],
  },

  init(engine) {
    if (this.bgGraphic) engine.destroy(this.bgGraphic);
    if (this.ambientBubbles) {
      this.ambientBubbles.forEach(b => engine.destroy(b));
    }

    this.score          = 0;
    this.targetScore    = 10;
    this.bubbles        = [];
    this.particles      = [];
    this.ambientBubbles  = [];
    this.isRoundEnd     = false;
    this.spawnTimer     = 0;
    this.spawnInterval  = 0.9;
    this.spawnDelay     = 0;
    this._winTimer      = 0;
    this.lastWidth      = engine.width;

    // Pick a random theme for this round
    const themes = Object.keys(THEME_DATA);
    this.targetTheme = themes[Math.floor(Math.random() * themes.length)];
    
    // Choose a random target from the theme
    const options = THEME_DATA[this.targetTheme];
    this.targetChar = options[Math.floor(Math.random() * options.length)];

    // Play round start audio
    engine.audio.play('round_start');

    // Create Score Display
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '⭐ 0',
      fontSize: Math.max(28, Math.min(48, engine.height * 0.07)),
      color: '#ffd700',
      x: engine.width / 2,
      y: Math.max(35, engine.height * 0.08),
      zIndex: 10,
    });

    // Create prompt background
    this.promptBg = engine.spawn({
      id: 'prompt_bg',
      asset: 'prompt_bg',
      x: engine.width / 2,
      y: Math.max(85, engine.height * 0.18),
      scale: 1,
      zIndex: 9
    });

    // Create Prompt label
    let promptText = `Find the ${this.targetChar}!`;
    if (this.targetTheme === 'colors') {
      promptText = `Pop the ${this.targetChar} bubble!`;
    } else if (this.targetTheme === 'shapes') {
      const shapeNames = {'●':'Circle','■':'Square','▲':'Triangle','★':'Star','♥':'Heart','♦':'Diamond'};
      promptText = `Pop the ${shapeNames[this.targetChar]}!`;
    } else if (this.targetTheme === 'animals') {
      promptText = `Pop the ${this.targetChar}!`;
    }
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: promptText,
      fontSize: Math.max(22, Math.min(32, engine.height * 0.05)),
      color: '#ffffff',
      x: engine.width / 2,
      y: Math.max(85, engine.height * 0.18),
      zIndex: 10
    });

    // Adjust prompt background scale based on text width (approximate)
    if (this.promptBg) {
      this.promptBg.scale.x = (promptText.length * 14) / 400;
      this.promptBg.scale.y = 0.8;
    }

    // 0. Ambient ocean background setup (zIndex 0)
    this.bgGraphic = engine.spawn({
      id: 'bubble_pop_bg',
      x: 0,
      y: 0,
      zIndex: 0
    });
    this.bgGraphicsDraw = new PIXI.Graphics();
    this.bgGraphic.addChild(this.bgGraphicsDraw);
    this._drawBackground(engine);

    // Spawn first batch of bubbles immediately
    for (let i = 0; i < 4; i++) {
      this._spawnBubble(engine, true);
    }
  },

  _drawBackground(engine) {
    if (!this.bgGraphicsDraw) return;
    this.bgGraphicsDraw.clear();
    
    // Draw modern ocean gradient
    const steps = 15;
    const stepH = engine.height / steps;
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      const r = Math.floor(0x0e + (0x05 - 0x0e) * ratio);
      const g = Math.floor(0x24 + (0x0e - 0x24) * ratio);
      const b = Math.floor(0x4a + (0x1f - 0x4a) * ratio);
      const hexColor = (r << 16) | (g << 8) | b;
      this.bgGraphicsDraw.rect(0, i * stepH, engine.width, stepH + 1).fill(hexColor);
    }
    
    // Wavy Kelp silhouettes at the bottom
    this.bgGraphicsDraw.moveTo(0, engine.height)
                       .bezierCurveTo(engine.width * 0.1, engine.height - 40, engine.width * 0.2, engine.height - 80, engine.width * 0.35, engine.height)
                       .bezierCurveTo(engine.width * 0.5, engine.height - 30, engine.width * 0.6, engine.height - 90, engine.width * 0.75, engine.height)
                       .bezierCurveTo(engine.width * 0.85, engine.height - 20, engine.width * 0.95, engine.height - 50, engine.width, engine.height)
                       .fill({ color: 0x030d1b, alpha: 0.5 });
  },

  update(engine, deltaTime) {
    // Move bubbles upward + wobble
    this.bubbles = this.bubbles.filter((b) => {
      b.y -= b._speed * deltaTime;
      b._wobble += b._wobbleSpeed * deltaTime;
      b.x = b._startX + Math.sin(b._wobble) * b._wobbleAmp;

      // Rotate bubble slightly
      b.angle += 10 * deltaTime;

      // Check if off screen
      if (b.y < -80) {
        engine.destroy(b);
        return false;
      }
      return true;
    });

    // Move ambient background bubbles
    if (this.ambientBubbles) {
      this.ambientBubbles = this.ambientBubbles.filter((ab) => {
        ab.y -= ab._speed * deltaTime;
        ab._wobble += ab._wobbleSpeed * deltaTime;
        ab.x = ab._startX + Math.sin(ab._wobble) * ab._wobbleAmp;
        if (ab.y < -50) {
          engine.destroy(ab);
          return false;
        }
        return true;
      });

      // Periodically spawn ambient background bubbles
      if (!this.isRoundEnd && Math.random() < 0.04 && this.ambientBubbles.length < 8) {
        const abScale = 0.15 + Math.random() * 0.25;
        const abX = Math.random() * engine.width;
        const ab = engine.spawn({
          id: `ambient_bubble_${Date.now()}_${Math.random()}`,
          asset: 'bubble_blue',
          x: abX,
          y: engine.height + 40,
          scale: abScale,
          zIndex: 1
        });
        ab.alpha = 0.12 + Math.random() * 0.12;
        ab._speed = 18 + Math.random() * 20;
        ab._wobble = Math.random() * Math.PI * 2;
        ab._wobbleSpeed = 0.4 + Math.random() * 0.4;
        ab._wobbleAmp = 4 + Math.random() * 6;
        ab._startX = abX;
        this.ambientBubbles.push(ab);
      }
    }

    // Move and fade particles
    this.particles = this.particles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      if (p._isConfetti) {
        p.angle += p._vx * 0.05 * deltaTime;
        p.alpha -= 0.35 * deltaTime;
      } else {
        p.alpha -= 2.0 * deltaTime;
      }
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });

    // Handle bubble spawning (BP-5 spawn guard)
    if (!this.isRoundEnd) {
      if (this.spawnDelay > 0) {
        this.spawnDelay -= deltaTime;
      } else {
        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= this.spawnInterval && this.bubbles.length < 6) {
          this.spawnTimer = 0;
          this._spawnBubble(engine, false);
        }
      }
    }

    // Check win condition
    if (this.score >= this.targetScore && !this.isRoundEnd) {
      this.isRoundEnd = true;
      engine.audio.play('win_jingle');
      this._spawnConfetti(engine);
      this._winTimer = 2.5; // CX-1 / BP-5
    }

    if (this._winTimer > 0) {
      this._winTimer -= deltaTime;
      if (this._winTimer <= 0) {
        // Clean up background and ambient bubbles
        if (this.bgGraphic) engine.destroy(this.bgGraphic);
        if (this.ambientBubbles) {
          this.ambientBubbles.forEach(b => engine.destroy(b));
          this.ambientBubbles = [];
        }

        engine.system.triggerWinState({
          title: 'YOU POPPED THEM ALL!',
          message: `Fabulous work! You found 10 ${this.targetTheme}!`,
          onReplay: () => this.init(engine),
          onExit: () => engine.system.exit(),
        });
      }
    }
  },

  onEvent(engine, eventName, payload) {},

  onResize(engine) {
    const ratioX = engine.width / (this.lastWidth || engine.width);
    this.lastWidth = engine.width;

    if (this.bubbles) {
      this.bubbles.forEach((b) => {
        b._startX *= ratioX;
        b.x *= ratioX;
      });
    }

    if (this.ambientBubbles) {
      this.ambientBubbles.forEach((ab) => {
        ab._startX *= ratioX;
        ab.x *= ratioX;
      });
    }

    if (this.bgGraphic) {
      this._drawBackground(engine);
    }

    if (this.scoreLabel) {
      this.scoreLabel.x = engine.width / 2;
      this.scoreLabel.y = Math.max(35, engine.height * 0.08);
      this.scoreLabel.style.fontSize = Math.max(28, Math.min(48, engine.height * 0.07));
    }

    if (this.promptBg) {
      this.promptBg.x = engine.width / 2;
      this.promptBg.y = Math.max(85, engine.height * 0.18);
    }

    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
      this.promptLabel.y = Math.max(85, engine.height * 0.18);
      this.promptLabel.style.fontSize = Math.max(22, Math.min(32, engine.height * 0.05));
    }
  },

  _spawnBubble(engine, initialPlacement = false) {
    const colorKey = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
    const asset = `bubble_${colorKey}`;
    const x = 80 + Math.random() * (engine.width - 160);
    
    // BP-6: initialPlacement Y-Range fix
    const yMin = engine.height * 0.3;
    const yMax = engine.height * 0.85;
    const y = initialPlacement
      ? yMin + Math.random() * (yMax - yMin)
      : engine.height + 80;

    // Decide what character is placed inside the bubble
    let bubbleChar = '';
    const isTarget = Math.random() < 0.4; // 40% chance of spawning the target
    
    if (isTarget) {
      bubbleChar = this.targetChar;
    } else {
      // Pick decoy
      const themeOptions = THEME_DATA[this.targetTheme];
      const decoys = themeOptions.filter(o => o !== this.targetChar);
      bubbleChar = decoys[Math.floor(Math.random() * decoys.length)];
    }

    // If color theme, force bubble color to match character color if it's the target!
    let finalAsset = asset;
    if (this.targetTheme === 'colors') {
      if (bubbleChar === this.targetChar) {
        finalAsset = `bubble_${this.targetChar.toLowerCase()}`;
      } else {
        // Decoy colors must not match target color
        const decoys = BUBBLE_COLORS.filter(c => c.toUpperCase() !== this.targetChar);
        const decoyColor = decoys[Math.floor(Math.random() * decoys.length)];
        bubbleChar = decoyColor.toUpperCase();
        finalAsset = `bubble_${decoyColor}`;
      }
    }

    const scale = 0.85 + Math.random() * 0.3; // Generous size

    const bubble = engine.spawn({
      id: `bubble_${Date.now()}_${Math.random()}`,
      asset: finalAsset,
      x, y, scale,
      onTouch: (self) => this._onBubbleTapped(self, bubbleChar, engine)
    });

    // BP-2: Store color hex for glitter color extraction
    bubble._colorHex = getColorFromKeyName(colorKey);

    // BP-4: Compute hit radius based on bubble scale
    const assetRadius = 60;
    const hitRadius = Math.max(80, bubble.scale.x * assetRadius * 1.5);
    bubble.hitArea = new PIXI.Circle(0, 0, hitRadius);

    // Save motion info on entity
    bubble._speed = 45 + Math.random() * 45;
    bubble._wobble = Math.random() * Math.PI * 2;
    bubble._wobbleSpeed = 0.6 + Math.random() * 0.8;
    bubble._wobbleAmp = 15 + Math.random() * 15;
    bubble._startX = x;
    bubble._char = bubbleChar;

    // Add child label/sprites inside the bubble (BP-1 animals theme check)
    if (this.targetTheme === 'animals') {
      const animalAsset = `animal_${bubbleChar.toLowerCase()}`;
      const animalSprite = engine.spawn({
        asset: animalAsset,
        x: 0,
        y: -10,
        scale: 0.5
      });
      if (animalSprite.parent) animalSprite.parent.removeChild(animalSprite);
      bubble.addChild(animalSprite);
      animalSprite.x = 0;
      animalSprite.y = -10;

      const label = engine.spawn({
        text: bubbleChar,
        fontSize: 18,
        color: '#ffffff',
        x: 0,
        y: 20
      });
      if (label.parent) label.parent.removeChild(label);
      bubble.addChild(label);
      label.x = 0;
      label.y = 20;
    } else if (this.targetTheme !== 'colors') {
      const label = engine.spawn({
        text: bubbleChar,
        fontSize: 34,
        color: '#ffffff',
        x: 0,
        y: 0,
      });
      // Detach label from stage and add as child of bubble so it moves/rotates/scales with it!
      if (label.parent) label.parent.removeChild(label);
      bubble.addChild(label);
      label.x = 0;
      label.y = 0;
    } else {
      // Display the color name label inside the bubble
      const label = engine.spawn({
        text: bubbleChar,
        fontSize: 18,
        color: '#ffffff',
        x: 0,
        y: 0,
      });
      if (label.parent) label.parent.removeChild(label);
      bubble.addChild(label);
      label.x = 0;
      label.y = 0;
    }

    this.bubbles.push(bubble);
  },

  _onBubbleTapped(bubble, char, engine) {
    if (bubble._popping || this.isRoundEnd) return;
    bubble._popping = true;

    const isCorrect = char === this.targetChar;

    if (isCorrect) {
      engine.audio.play('pop_sound');
      
      // Update score
      this.score++;
      this.scoreLabel.text = `⭐ ${this.score}`;
      
      // Pop score label as feedback
      engine.animate(this.scoreLabel, { scale: 1.3 }, 0.1, 'easeOut')
        .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

      // Remove bubble from track list
      this.bubbles = this.bubbles.filter(b => b !== bubble);

      // Pop anim (scale up and fade)
      engine.animate(bubble, { scale: bubble.scale.x * 1.6, alpha: 0 }, 0.2, 'easeOut')
        .then(() => engine.destroy(bubble));

      // Burst particles (BP-2: Use stored color hex)
      this._burstGlitter(bubble.x, bubble.y, bubble._colorHex, engine);

      // Short delay before spawning new one
      this.spawnDelay = 0.3;
    } else {
      // BP-3: Wrong Tap Has Screen Shake
      engine.audio.play('whoosh_fail');
      const stage = engine.app.stage;
      engine.animate(stage, { x: -10 }, 0.05, 'easeOut')
        .then(() => engine.animate(stage, { x: 10  }, 0.05, 'linear'))
        .then(() => engine.animate(stage, { x: -8  }, 0.05, 'linear'))
        .then(() => engine.animate(stage, { x: 0   }, 0.05, 'easeOut'));

      engine.fx.wiggle(bubble).then(() => {
        bubble._popping = false; // re-enable tapping
      });
    }
  },

  _burstGlitter(x, y, colorHex, engine) {
    const numParticles = 10;
    for (let i = 0; i < numParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 150;
      const p = engine.spawn({
        id: `glitter_${Date.now()}_${Math.random()}`,
        asset: 'particle_glitter',
        x, y,
        scale: 0.4 + Math.random() * 0.4,
        zIndex: 5
      });
      p._vx = Math.cos(angle) * speed;
      p._vy = Math.sin(angle) * speed;
      p.tint = colorHex;
      this.particles.push(p);
    }
  },

  _spawnConfetti(engine) {
    const colors = [0xff3b30, 0x007aff, 0x34c759, 0xffcc00, 0xff9500, 0xff2d55, 0xaf52de];
    const numParticles = 45;
    for (let i = 0; i < numParticles; i++) {
      const p = engine.spawn({
        id: `confetti_${Date.now()}_${Math.random()}`,
        asset: 'particle_glitter',
        x: Math.random() * engine.width,
        y: -20 - Math.random() * 120,
        scale: 0.35 + Math.random() * 0.45,
        zIndex: 6
      });
      p._vx = (Math.random() - 0.5) * 120;
      p._vy = 120 + Math.random() * 180;
      p.tint = colors[Math.floor(Math.random() * colors.length)];
      p._isConfetti = true;
      p.alpha = 0.95;
      this.particles.push(p);
    }
  },

  preview(miniEngine) {
    this.t = 0;
    this.bubbles = [
      miniEngine.spawn({ asset: 'bubble_blue', color: '#2196F3', x: 60, y: 120, scale: 0.8 }),
      miniEngine.spawn({ asset: 'bubble_green', color: '#4CAF50', x: 120, y: 135, scale: 0.9 }),
      miniEngine.spawn({ asset: 'bubble_pink', color: '#E91E63', x: 180, y: 110, scale: 0.7 }),
    ];
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    this.bubbles.forEach((b, i) => {
      b.y -= 30 * dt;
      // wobble
      b.x += Math.sin(this.t * 3 + i) * 0.4;
    });

    if (this.t > 3) {
      this.t = 0;
      // reset positions
      this.bubbles[0].x = 60;  this.bubbles[0].y = 120;
      this.bubbles[1].x = 120; this.bubbles[1].y = 135;
      this.bubbles[2].x = 180; this.bubbles[2].y = 110;
    }
  }

};

function getColorFromKeyName(key) {
  if (key.includes('blue')) return 0x2196f3;
  if (key.includes('green')) return 0x4caf50;
  if (key.includes('pink')) return 0xe91e63;
  if (key.includes('yellow')) return 0xffc107;
  if (key.includes('purple')) return 0x9c27b0;
  if (key.includes('orange')) return 0xff9800;
  return 0xffffff;
}
