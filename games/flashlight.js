// games/flashlight.js
// ToyBox Mini-Game: Flashlight
// Target age: 2–5 years | Interaction: Drag | Duration: ~3 min

const SCENE_CONFIGS = {
  scene_jungle: {
    bg: 'bg_jungle',
    color: '#1e5e2f',
    label: '🌳 Jungle Adventure! 🌳',
    objects: [
      { id: 'fox',    asset: 'obj_fox',    x: 0.20, y: 0.32, sound: 'sound_fox', name: 'Fox! 🦊' },
      { id: 'frog',   asset: 'obj_frog',   x: 0.75, y: 0.58, sound: 'sound_frog', name: 'Frog! 🐸' },
      { id: 'parrot', asset: 'obj_parrot', x: 0.48, y: 0.22, sound: 'sound_parrot', name: 'Parrot! 🦜' },
      { id: 'snake',  asset: 'obj_snake',  x: 0.28, y: 0.68, sound: 'sound_snake', name: 'Snake! 🐍' },
      { id: 'monkey', asset: 'obj_monkey', x: 0.82, y: 0.30, sound: 'sound_monkey', name: 'Monkey! 🐵' }
    ]
  },
  scene_ocean: {
    bg: 'bg_ocean',
    color: '#0d47a1',
    label: '🌊 Deep Blue Sea! 🌊',
    objects: [
      { id: 'fish',     asset: 'obj_fish',     x: 0.18, y: 0.45, sound: 'sound_fish', name: 'Fish! 🐟' },
      { id: 'crab',     asset: 'obj_crab',     x: 0.72, y: 0.72, sound: 'sound_crab', name: 'Crab! 🦀' },
      { id: 'seahorse', asset: 'obj_seahorse', x: 0.48, y: 0.32, sound: 'sound_seahorse', name: 'Seahorse! 🦄' },
      { id: 'starfish', asset: 'obj_starfish', x: 0.30, y: 0.68, sound: 'sound_starfish', name: 'Starfish! ⭐' },
      { id: 'octopus',  asset: 'obj_octopus',  x: 0.80, y: 0.48, sound: 'sound_octopus', name: 'Octopus! 🐙' }
    ]
  },
  scene_night_sky: {
    bg: 'bg_night',
    color: '#1a1a2e',
    label: '🚀 Outer Space! 🚀',
    objects: [
      { id: 'rocket',   asset: 'obj_rocket',   x: 0.22, y: 0.28, sound: 'sound_rocket', name: 'Rocket! 🚀' },
      { id: 'ufo',      asset: 'obj_ufo',      x: 0.78, y: 0.25, sound: 'sound_ufo', name: 'UFO! 🛸' },
      { id: 'moon',     asset: 'obj_moon',     x: 0.50, y: 0.45, sound: 'sound_moon', name: 'Moon! 🌙' },
      { id: 'star_sky', asset: 'obj_shooting_star', x: 0.28, y: 0.65, sound: 'sound_shooting_star', name: 'Star! 🌠' },
      { id: 'astronaut',asset: 'obj_astronaut',x: 0.82, y: 0.62, sound: 'sound_astronaut', name: 'Astronaut! 👨‍🚀' }
    ]
  }
};

export default {

  config: {
    background:      '#0a0a1a', // Dark blue background
    interactionMode: 'drag',
    assets: [
      'bg_jungle', 'bg_ocean', 'bg_night',
      'obj_fox', 'obj_frog', 'obj_parrot', 'obj_snake', 'obj_monkey',
      'obj_fish', 'obj_crab', 'obj_seahorse', 'obj_starfish', 'obj_octopus',
      'obj_rocket', 'obj_ufo', 'obj_moon', 'obj_shooting_star', 'obj_astronaut',
      'obj_glow', 'ui_dot_empty', 'ui_dot_filled', 'particle_sparkle'
    ],
    audio: [
      'sound_fox', 'sound_frog', 'sound_parrot', 'sound_snake', 'sound_monkey',
      'sound_fish', 'sound_crab', 'sound_seahorse', 'sound_starfish', 'sound_octopus',
      'sound_rocket', 'sound_ufo', 'sound_moon', 'sound_shooting_star', 'sound_astronaut',
      'win_jingle', 'scene_complete' // FL-2: added scene_complete
    ],
  },

  init(engine) {
    this.sceneIndex = 0;
    this.sceneQueue = Object.keys(SCENE_CONFIGS).sort(() => Math.random() - 0.5);
    this.beamRadius = Math.max(80, Math.min(220, engine.width * 0.18));
    this.lightX = engine.width / 2;
    this.lightY = engine.height / 2;
    this.particles = [];
    this.activeLabels = [];
    this.glowPulsate = 0;
    this._winTimer = 0;

    // Header Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '🔦 Find the hidden items! 🔦',
      fontSize: 26,
      color: '#ffffff',
      x: engine.width / 2,
      y: 42,
      zIndex: 15
    });
    if (this.promptLabel.style) {
      this.promptLabel.style.stroke = '#0a0a1a';
      this.promptLabel.style.strokeThickness = 4;
    }

    this._loadScene(engine);
  },

  update(engine, deltaTime) {
    if (this.isRoundEnd) return;

    this.glowPulsate += deltaTime * 4;

    // 1. Redraw darkness overlay with cutout hole
    if (this.darknessGraphics && !this.isPreviewMode) {
      this.darknessGraphics.clear();
      this.darknessGraphics.rect(0, 0, engine.width, engine.height).fill({ color: 0x070714, alpha: this.darknessAlpha });
      
      // Draw penumbra erase circles (FL-1: gradual center to edge penumbra)
      if (this.darknessAlpha > 0) {
        this.hole.clear();
        const RINGS = 10;
        for (let i = RINGS; i >= 0; i--) {
          const frac   = i / RINGS;
          const r      = this.beamRadius * frac;
          const eAlpha = 1.0 - frac; // full erase at centre, 0 at outer edge
          this.hole.circle(this.lightX, this.lightY, r)
            .fill({ color: 0xffffff, alpha: eAlpha });
        }
      }
    }

    // 2. Discover proximity updates
    this._updateDiscovery(engine, deltaTime);

    // 3. Move sparkles
    this.particles = this.particles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      p.alpha -= 2.0 * deltaTime;
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });

    // 4. Update active discovery labels (CX-1 / FL-6)
    if (this.activeLabels) {
      this.activeLabels = this.activeLabels.filter((lbl) => {
        lbl._lifetime -= deltaTime;
        if (lbl._lifetime <= 0 && !lbl._fading) {
          lbl._fading = true;
          engine.animate(lbl, { alpha: 0 }, 0.4)
            .then(() => engine.destroy(lbl));
        }
        return lbl._lifetime > -0.5; // keep in array until fade finishes
      });
    }

    // 5. Delta-time win scene transition timer (CX-1 / FL-6)
    if (this._winTimer > 0) {
      this._winTimer -= deltaTime;
      if (this._winTimer <= 0) {
        this._doWinTransition(engine);
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isPreviewMode || this.isTransitioning) return;

    if (eventName === 'touch_move' || eventName === 'touch_down' || eventName === 'drag_start') {
      this.lightX = payload.x;
      this.lightY = payload.y;
    }
  },

  onResize(engine) {
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
    }

    this.beamRadius = Math.max(80, Math.min(220, engine.width * 0.18));

    if (this.bgSprite) {
      this.bgSprite.x = engine.width / 2;
      this.bgSprite.y = engine.height / 2;
      this.bgSprite.scale.set(Math.max(engine.width / 1024, engine.height / 768));
    }

    const sceneKey = this.sceneQueue ? this.sceneQueue[this.sceneIndex] : null;
    const scene = sceneKey ? SCENE_CONFIGS[sceneKey] : null;
    const scale = Math.max(engine.width / 1024, engine.height / 768);
    const bgW = 1024 * scale;
    const bgH = 768 * scale;
    const bgLeft = engine.width / 2 - bgW / 2;
    const bgTop = engine.height / 2 - bgH / 2;
    const objScale = scale * 1.1;

    if (this.hiddenObjects && scene) {
      this.hiddenObjects.forEach((obj) => {
        const origObj = scene.objects.find(o => o.id === obj.id);
        if (origObj) {
          const x = bgLeft + origObj.x * bgW;
          const y = bgTop + origObj.y * bgH;
          obj.x = x;
          obj.y = y;
          obj.scale = objScale;
          if (obj.sprite) {
            obj.sprite.x = x;
            obj.sprite.y = y;
            obj.sprite.scale.set(objScale);
          }
          if (obj.glow) {
            obj.glow.x = x;
            obj.glow.y = y;
            obj.glow.scale.set(objScale * 0.7);
          }
        }
      });
    }

    if (this.progressDots) {
      const dotSpacing = 28;
      const startDotX = engine.width / 2 - (5 - 1) * dotSpacing / 2;
      this.progressDots.forEach((dot, i) => {
        dot.x = startDotX + i * dotSpacing;
        dot.y = engine.height - Math.max(25, engine.height * 0.06);
      });
    }
  },

  _loadScene(engine) {
    this.isTransitioning = false;
    this.discoveredCount = 0;
    this.darknessAlpha = 0.88;
    this._winTimer = 0;
    this.activeLabels = [];

    const sceneKey = this.sceneQueue[this.sceneIndex];
    const scene = SCENE_CONFIGS[sceneKey];

    // Clean up old scene entities
    if (this.bgSprite) engine.destroy(this.bgSprite);
    if (this.hiddenObjects) {
      this.hiddenObjects.forEach(obj => {
        engine.destroy(obj.sprite);
        engine.destroy(obj.glow);
      });
    }
    if (this.progressDots) this.progressDots.forEach(dot => engine.destroy(dot));
    if (this.darkness) engine.destroy(this.darkness);

    // 1. Scene Background
    this.bgSprite = engine.spawn({
      id: 'scene_bg',
      asset: scene.bg,
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 1
    });
    this.bgSprite.scale.set(Math.max(engine.width / 1024, engine.height / 768));

    const scale = Math.max(engine.width / 1024, engine.height / 768);
    const bgW = 1024 * scale;
    const bgH = 768 * scale;
    const bgLeft = engine.width / 2 - bgW / 2;
    const bgTop = engine.height / 2 - bgH / 2;
    const objScale = scale * 1.1;

    // 2. Hidden Objects Spawning
    this.hiddenObjects = scene.objects.map((obj, i) => {
      const x = bgLeft + obj.x * bgW;
      const y = bgTop + obj.y * bgH;

      // Glow behind object
      const glow = engine.spawn({
        id: `glow_${obj.id}`,
        asset: 'obj_glow',
        x, y,
        scale: objScale * 0.7,
        zIndex: 2
      });
      glow.visible = false;
      glow.tint = 0xffe082; // soft warm yellow glow

      // Main object sprite (initially transparent)
      const sprite = engine.spawn({
        id: `obj_${obj.id}`,
        asset: obj.asset,
        x, y,
        scale: objScale,
        zIndex: 3
      });
      sprite.alpha = 0;

      return {
        id: obj.id,
        sprite,
        glow,
        discovered: false,
        soundPlayed: false,
        x, y,
        sound: obj.sound,
        name: obj.name,
        scale: objScale
      };
    });

    // 3. Progress indicator dots
    this.progressDots = [];
    const dotSpacing = 28;
    const startDotX = engine.width / 2 - (5 - 1) * dotSpacing / 2;
    for (let i = 0; i < 5; i++) {
      const dot = engine.spawn({
        id: `dot_${i}`,
        asset: 'ui_dot_empty',
        x: startDotX + i * dotSpacing,
        y: engine.height - Math.max(25, engine.height * 0.06),
        scale: 0.7,
        zIndex: 15
      });
      this.progressDots.push(dot);
    }

    // FL-3: Robust preview mode detection
    this.isPreviewMode = (engine.app == null) || (engine.width < 250);

    if (!this.isPreviewMode) {
      // 4. Darkness layer
      this.darkness = engine.spawn({
        id: 'darkness_overlay',
        x: 0,
        y: 0,
        zIndex: 8
      });
      
      this.darknessGraphics = new PIXI.Graphics();
      this.darkness.addChild(this.darknessGraphics);

      this.darknessGraphics.rect(0, 0, engine.width, engine.height).fill({ color: 0x070714, alpha: this.darknessAlpha });

      // Hole Graphics added as child of darknessGraphics with ERASE blendMode
      this.hole = new PIXI.Graphics();
      this.hole.blendMode = 'erase';
      this.darknessGraphics.addChild(this.hole);
    }
  },

  _updateDiscovery(engine, dt) {
    let allDiscovered = true;

    this.hiddenObjects.forEach((obj) => {
      if (obj.discovered) return;

      allDiscovered = false;

      // Distance from flashlight center
      const dx = obj.x - this.lightX;
      const dy = obj.y - this.lightY;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < this.beamRadius * 0.85) {
        // Object is illuminated: fade in!
        obj.sprite.alpha = Math.min(1.0, obj.sprite.alpha + 3.0 * dt);

        // Show glow pulsate
        obj.glow.visible = true;
        obj.glow.alpha = 0.45 + Math.sin(this.glowPulsate * 2) * 0.2;

        // Trigger discovery when fully visible
        if (obj.sprite.alpha >= 0.95 && !obj.soundPlayed) {
          obj.soundPlayed = true;
          this._discoverItem(obj, engine);
        }
      } else {
        // FL-4: Fades back out if not discovered yet, with minimum alpha floor to prevent edge flicker
        obj.sprite.alpha = Math.max(0.05, obj.sprite.alpha - 1.5 * dt);
        obj.glow.visible = false;
      }
    });

    if (allDiscovered && !this.isTransitioning) {
      this._winScene(engine);
    }
  },

  _discoverItem(obj, engine) {
    obj.discovered = true;
    obj.sprite.alpha = 1.0;
    obj.glow.visible = true;

    // 1. Play animal sound
    engine.audio.play(obj.sound);

    // 2. Spawn text label above object
    const label = engine.spawn({
      text: obj.name,
      fontSize: 22,
      color: '#ffffff',
      x: obj.x,
      y: obj.y - obj.sprite.height / 2 - 20,
      zIndex: 16
    });
    if (label.style) {
      label.style.stroke = '#1a1a2e';
      label.style.strokeThickness = 4;
    }

    // Scale pop label
    label.scale.set(0);
    engine.animate(label, { scale: 1.15 }, 0.2, 'easeOut')
      .then(() => engine.animate(label, { scale: 1.0 }, 0.15, 'bounce'));

    // CX-1 / FL-6: Stash label in list for delta-time removal instead of raw setTimeout
    label._lifetime = 1.2;
    label._fading = false;
    this.activeLabels.push(label);

    // 3. Sparkle burst
    this._spawnSparkleBurst(obj.x, obj.y, engine);

    // 4. Update progress dot (FL-5: swap dot using tint instead of texture swap)
    if (this.discoveredCount < 5) {
      const dot = this.progressDots[this.discoveredCount];
      if (dot) {
        dot.tint = 0xffd700; // gold star colour
        engine.animate(dot, { scale: dot.scale.x * 1.3 }, 0.15, 'bounce');
      }
      this.discoveredCount++;
    }
  },

  _spawnSparkleBurst(x, y, engine) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 80;
      const p = engine.spawn({
        id: `sparkle_${Date.now()}_${Math.random()}`,
        asset: 'particle_sparkle',
        x, y,
        scale: 0.25 + Math.random() * 0.35,
        zIndex: 10
      });
      p._vx = Math.cos(angle) * speed;
      p._vy = Math.sin(angle) * speed;
      this.particles.push(p);
    }
  },

  _winScene(engine) {
    this.isTransitioning = true;
    
    // FL-2: win_jingle only on the last scene, otherwise scene_complete
    const isLastScene = this.sceneIndex >= this.sceneQueue.length - 1;
    engine.audio.play(isLastScene ? 'win_jingle' : 'scene_complete');

    // Turn lights on! (fade darkness alpha to 0)
    if (!this.isPreviewMode) {
      engine.animate(this, { darknessAlpha: 0.0 }, 0.8, 'easeOut');
    }

    // Keep all objects fully visible
    this.hiddenObjects.forEach(obj => {
      obj.sprite.alpha = 1.0;
      obj.glow.visible = true;
      obj.glow.alpha = 0.6;
    });

    // Wait 2.5s then progress using delta timer (FL-6)
    this._winTimer = 2.5;
  },

  _doWinTransition(engine) {
    this.sceneIndex++;
    if (this.sceneIndex < this.sceneQueue.length) {
      this._loadScene(engine);
    } else {
      // Finished all 3 scenes!
      engine.system.triggerWinState({
        title: 'SUPER DETECTIVE!',
        message: 'Splendid job! You found all the hidden items in the dark!',
        onReplay: () => this.init(engine),
        onExit: () => engine.system.exit(),
      });
    }
  },

  preview(miniEngine) {
    this.t = 0;
    this.lightX = miniEngine.width * 0.2;
    this.lightY = miniEngine.height * 0.5;

    // Spawn dark bg
    this.bg = miniEngine.spawn({
      color: '#1a1a2e',
      x: miniEngine.width/2,
      y: miniEngine.height/2,
      scale: 0.5
    });

    // Spawn 2 hidden objects
    this.obj1 = miniEngine.spawn({
      asset: 'obj_fox',
      color: '#ff5722',
      x: miniEngine.width * 0.35,
      y: miniEngine.height * 0.45,
      scale: 0.4
    });
    this.obj1.alpha = 0.1;

    this.obj2 = miniEngine.spawn({
      asset: 'obj_frog',
      color: '#4caf50',
      x: miniEngine.width * 0.70,
      y: miniEngine.height * 0.55,
      scale: 0.4
    });
    this.obj2.alpha = 0.1;
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    // Move flashlight beam left to right
    const cycle = (this.t % 4.0) / 4.0;
    this.lightX = miniEngine.width * (0.1 + cycle * 0.8);

    // Illuminate obj1
    const d1 = Math.abs(this.obj1.x - this.lightX);
    if (d1 < 40) {
      this.obj1.alpha = Math.min(1.0, this.obj1.alpha + 3.0 * dt);
    } else {
      this.obj1.alpha = Math.max(0.05, this.obj1.alpha - 1.5 * dt); // FL-4
    }

    // Illuminate obj2
    const d2 = Math.abs(this.obj2.x - this.lightX);
    if (d2 < 40) {
      this.obj2.alpha = Math.min(1.0, this.obj2.alpha + 3.0 * dt);
    } else {
      this.obj2.alpha = Math.max(0.05, this.obj2.alpha - 1.5 * dt); // FL-4
    }
  }

};
