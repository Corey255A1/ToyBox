// games/ball_launch.js
// ToyBox Mini-Game: Ball Launch
// Target age: 2–5 years | Interaction: Drag Launcher & Tap to Launch | Duration: ~3 min

const TARGET_ASSETS = [
  'target_balloon_red', 'target_balloon_blue', 'target_balloon_green',
  'target_star_yellow', 'target_star_pink',
  'target_fruit_apple', 'target_fruit_orange', 'target_fruit_banana',
  'target_cloud'
];

export default {

  config: {
    background:      '#87ceeb', // Sky blue
    interactionMode: 'drag',    // Drag left track to adjust height, Tap right to fire
    assets: [
      'ball_main', 'trail_dot',
      ...TARGET_ASSETS, 'particle_burst', 'ui_star'
    ],
    audio: ['launch_whoosh', 'target_pop', 'ball_bounce', 'win_jingle', 'snap_success'],
  },

  init(engine) {
    this.score = 0;
    this.sessionHits = 0;
    this.targetScore = 20;
    this.ballState = 'IDLE'; // 'IDLE' | 'FLYING'
    this.trail = [];
    this.particles = [];
    this.targets = [];
    this.isRoundEnd = false;
    this._winTimer = 0;

    this.launcherX = 60;
    this.launcherY = engine.height / 2;

    this.isPreviewMode = (engine.app == null) || (engine.width < 250);

    // 1. Score Display
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '⭐ 0',
      fontSize: 38,
      color: '#ffffff',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
    });
    if (this.scoreLabel.style) {
      this.scoreLabel.style.stroke = '#2980b9';
      this.scoreLabel.style.strokeThickness = 4;
    }

    // 2. Launcher track guide
    this.trackBg = engine.spawn({
      id: 'launcher_track',
      zIndex: 1
    });
    this.trackGraphics = new PIXI.Graphics();
    this.trackBg.addChild(this.trackGraphics);

    // 3. Launcher Cannon
    this.launcherSprite = engine.spawn({
      id: 'launcher_cannon',
      x: this.launcherX,
      y: this.launcherY,
      zIndex: 4
    });
    this.launcherGraphics = new PIXI.Graphics();
    this.launcherSprite.addChild(this.launcherGraphics);
    // Draw initial launcher graphics
    this.launcherGraphics.roundRect(-15, -15, 50, 30, 8).fill(0x3e4a5e).stroke({ color: 0xffffff, width: 2 });
    this.launcherGraphics.circle(-10, 0, 12).fill(0x2c3e50);

    // 4. Draggable Y handle prompt label
    this.slidePrompt = engine.spawn({
      text: '↕ Slide to aim Y',
      fontSize: 14,
      color: '#2c3e50',
      x: this.launcherX + 5,
      y: 90,
      zIndex: 5
    });
    if (this.slidePrompt.style) {
      this.slidePrompt.style.fontWeight = 'bold';
    }

    // 5. Spawn targets and hoops layout
    this._spawnAllTargets(engine);

    // 6. Spawn projectile ball
    this.ballX = this.launcherX;
    this.ballY = this.launcherY;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballSprite = engine.spawn({
      id: 'ball',
      asset: 'ball_main',
      x: this.ballX,
      y: this.ballY,
      scale: 1,
      zIndex: 5
    });
    const ballScale = (engine.width * 0.08) / 80;
    this.ballSprite.scale.set(ballScale);
    this.ballSprite.visible = false;

    // Draw the track graphics initially
    this._drawTrack(engine);
  },

  update(engine, deltaTime) {
    // 1. Move and decay particles
    this.particles = this.particles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      const decay = p._isStar ? 0.45 : 2.0;
      p.alpha -= decay * deltaTime;
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });

    // 2. Move and fade projectile trail
    this.trail = this.trail.filter((dot) => {
      dot.alpha -= 3.0 * deltaTime;
      if (dot.alpha <= 0) {
        engine.destroy(dot);
        return false;
      }
      return true;
    });

    // 3. Target respawning wiggles
    if (!this.isRoundEnd) {
      this.targets.forEach((t) => {
        if (t._respawnTimer > 0) {
          t._respawnTimer -= deltaTime;
          if (t._respawnTimer <= 0) {
            t.visible = true;
            t.entity.visible = true;
            t.entity.alpha = 0;
            engine.animate(t.entity, { alpha: 1.0 }, 0.4);
          }
        }
      });
    }

    // 4. Ball physics movement
    if (this.ballState === 'FLYING' && !this.isRoundEnd) {
      const GRAVITY = 350;
      this.ballVy += GRAVITY * deltaTime;

      // Apply magnet assist pulling toward closest target
      this._applyMagnetAssist(engine, deltaTime);

      this.ballX += this.ballVx * deltaTime;
      this.ballY += this.ballVy * deltaTime;

      this.ballSprite.x = this.ballX;
      this.ballSprite.y = this.ballY;
      this.ballSprite.angle += this.ballVx * 0.35 * deltaTime;

      // Spawn trail dot
      this._spawnTrailDot(engine);

      // Collisions: Left and right walls
      const ballRadius = this.ballSprite.width / 2;
      if (this.ballX - ballRadius < 0) {
        this.ballX = ballRadius;
        this.ballVx = -this.ballVx * 0.8;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      } else if (this.ballX + ballRadius > engine.width) {
        this.ballX = engine.width - ballRadius;
        this.ballVx = -this.ballVx * 0.8;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      }

      // Collisions: Ceiling
      if (this.ballY - ballRadius < 0) {
        this.ballY = ballRadius;
        this.ballVy = -this.ballVy * 0.8;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      }

      // Out of bounds: Fall below floor Y
      if (this.ballY > engine.height + 80) {
        this._resetBall();
      }

      // Check collisions with targets and hoops
      this._checkCollisions(engine);
    }

    // 5. Celebration win timer
    if (this._winTimer > 0) {
      this._winTimer -= deltaTime;
      if (this._winTimer <= 0) {
        engine.system.triggerWinState({
          title: 'BALL LAUNCH CHAMPION!',
          message: 'Splendid! You matched all balloons and hoops!',
          onReplay: () => this.init(engine),
          onExit: () => engine.system.exit(),
        });
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isRoundEnd) return;

    if (eventName === 'touch_down' || eventName === 'drag_start' || eventName === 'touch_move') {
      const { x, y } = payload;
      
      // If pointer is on the left side (cannon sliding range)
      if (x < 150) {
        this.launcherY = Math.max(120, Math.min(engine.height - 130, y));
        this.launcherSprite.y = this.launcherY;
        if (this.ballState === 'IDLE') {
          this.ballY = this.launcherY;
        }
      } else if (eventName === 'touch_down' || eventName === 'tap') {
        // Tapping on the right side launches the ball toward the tap position
        this._launchBall(x, y, engine);
      }
    }
  },

  onResize(engine) {
    this.launcherY = Math.max(120, Math.min(engine.height - 130, this.launcherY));
    this.launcherSprite.x = this.launcherX;
    this.launcherSprite.y = this.launcherY;

    if (this.scoreLabel) {
      this.scoreLabel.x = engine.width / 2;
    }

    if (this.slidePrompt) {
      this.slidePrompt.x = this.launcherX + 5;
    }

    const ballScale = (engine.width * 0.08) / 80;
    if (this.ballSprite) {
      this.ballSprite.scale.set(ballScale);
      if (this.ballState === 'IDLE') {
        this.ballX = this.launcherX;
        this.ballY = this.launcherY;
        this.ballSprite.x = this.ballX;
        this.ballSprite.y = this.ballY;
      }
    }

    // Resize targets
    this.targets.forEach((t) => {
      t.x = t.rx * engine.width;
      t.y = 80 + t.ry * (engine.height - 230);
      if (t.entity) {
        t.entity.x = t.x;
        t.entity.y = t.y;
      }
    });

    this._drawTrack(engine);
  },

  _drawTrack(engine) {
    this.trackGraphics.clear()
      .moveTo(this.launcherX, 100)
      .lineTo(this.launcherX, engine.height - 120)
      .stroke({ color: 0x3e4a5e, width: 8, alpha: 0.4 });
  },

  _spawnAllTargets(engine) {
    // 3 Hoops and 6 Standard targets placed at relative grid offsets
    const layout = [
      { rx: 0.35, ry: 0.20, isHoop: false },
      { rx: 0.60, ry: 0.15, isHoop: true },
      { rx: 0.85, ry: 0.25, isHoop: false },
      
      { rx: 0.40, ry: 0.50, isHoop: true },
      { rx: 0.65, ry: 0.45, isHoop: false },
      { rx: 0.88, ry: 0.55, isHoop: false },
      
      { rx: 0.30, ry: 0.78, isHoop: false },
      { rx: 0.55, ry: 0.72, isHoop: false },
      { rx: 0.80, ry: 0.75, isHoop: true }
    ];

    layout.forEach((node, i) => {
      const x = node.rx * engine.width;
      const y = 80 + node.ry * (engine.height - 230);

      const entity = engine.spawn({
        id: `target_launch_${i}`,
        x, y,
        zIndex: 2
      });

      if (node.isHoop) {
        // Draw basketball hoop procedurally
        const hoopG = new PIXI.Graphics();
        // back net lines
        hoopG.poly([-24, 0, 24, 0, 12, 35, -12, 35]).fill({ color: 0xffffff, alpha: 0.4 });
        hoopG.poly([-24, 0, 24, 0, 12, 35, -12, 35]).stroke({ color: 0xffffff, width: 2, alpha: 0.75 });
        // front ring
        hoopG.ellipse(0, 0, 26, 8).fill(0xe74c3c);
        hoopG.ellipse(0, 0, 20, 5).fill(0x87ceeb); // blend inside with sky bg
        entity.addChild(hoopG);
      } else {
        // Draw balloon or star procedurally
        const asset = TARGET_ASSETS[i % TARGET_ASSETS.length];
        const spr = new PIXI.Sprite(PIXI.Assets.get(asset));
        spr.anchor.set(0.5);
        entity.addChild(spr);
      }

      this.targets.push({
        entity,
        isHoop: node.isHoop,
        rx: node.rx,
        ry: node.ry,
        x, y,
        _respawnTimer: 0,
        _popping: false
      });
    });
  },

  _launchBall(tapX, tapY, engine) {
    // Set cannon rotation to point at tap coordinates
    const dx = tapX - this.launcherX;
    const dy = tapY - this.launcherY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist < 10) return;

    this.launcherSprite.rotation = Math.atan2(dy, dx);

    // Reset ball positions to launcher and launch toward tap coordinate
    this.ballX = this.launcherX;
    this.ballY = this.launcherY;
    
    const speed = 720;
    this.ballVx = (dx / dist) * speed;
    this.ballVy = (dy / dist) * speed;

    this.ballSprite.x = this.ballX;
    this.ballSprite.y = this.ballY;
    this.ballSprite.visible = true;
    this.ballState = 'FLYING';

    engine.audio.play('launch_whoosh');
  },

  _applyMagnetAssist(engine, dt) {
    let nearest = null;
    let minDist = 99999;

    this.targets.forEach((t) => {
      if (t._respawnTimer <= 0 && !t._popping) {
        const dx = t.x - this.ballX;
        const dy = t.y - this.ballY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = t;
        }
      }
    });

    const MAGNET_RADIUS = 130;
    const MAGNET_STRENGTH = 480;

    if (nearest && minDist < MAGNET_RADIUS) {
      const pull = (1 - minDist / MAGNET_RADIUS) * MAGNET_STRENGTH;
      const dx = nearest.x - this.ballX;
      const dy = nearest.y - this.ballY;
      this.ballVx += (dx / minDist) * pull * dt;
      this.ballVy += (dy / minDist) * pull * dt;
    }
  },

  _spawnTrailDot(engine) {
    const dot = engine.spawn({
      id: `trail_${Date.now()}_${Math.random()}`,
      asset: 'trail_dot',
      x: this.ballX,
      y: this.ballY,
      scale: 0.55,
      zIndex: 3
    });
    dot.alpha = 0.5;
    this.trail.push(dot);
  },

  _checkCollisions(engine) {
    this.targets.forEach((t) => {
      if (t._respawnTimer > 0 || t._popping) return;

      const dx = t.x - this.ballX;
      const dy = t.y - this.ballY;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (t.isHoop) {
        // Hoops score when ball goes directly through center hoop (narrower collision)
        if (dist < 26 && this.ballVy > 0) {
          this._scoreTarget(t, engine, true);
        }
      } else {
        // Standard balloons score on general outer touch bounds
        if (dist < 36) {
          this._scoreTarget(t, engine, false);
        }
      }
    });
  },

  _scoreTarget(target, engine, isHoopScore) {
    target._popping = true;

    // Play appropriate success audio
    if (isHoopScore) {
      engine.audio.play('snap_success');
      engine.fx.wiggle(target.entity);
      this._burstDebris(target.x, target.y, 0xff5252, engine);
    } else {
      engine.audio.play('target_pop');
      engine.animate(target.entity, { scale: 1.8, alpha: 0 }, 0.2, 'easeOut');
      this._burstDebris(target.x, target.y, 0xffffff, engine);
    }

    // Update score
    this.score++;
    this.sessionHits++;
    this.scoreLabel.text = `⭐ ${this.score}`;
    engine.animate(this.scoreLabel, { scale: 1.35 }, 0.1, 'easeOut')
      .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

    // Set target respawn properties
    setTimeout(() => {
      target.entity.visible = false;
      target._respawnTimer = 2.0; // Respawns in 2.0s
      target._popping = false;
      
      if (!isHoopScore) {
        // Restore standard target scales
        target.entity.scale.set(1);
        target.entity.alpha = 1;
      }
    }, 250);

    // Deflect ball slightly for action feedback
    this.ballVy = -Math.abs(this.ballVy) * 0.45;
    this.ballVx += (Math.random() - 0.5) * 120;

    // Check round win
    if (this.sessionHits >= this.targetScore && !this.isRoundEnd) {
      this._triggerWinSequence(engine);
    }
  },

  _burstDebris(x, y, tintColor, engine) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 100;
      const p = engine.spawn({
        id: `debris_${Date.now()}_${Math.random()}`,
        asset: 'particle_burst',
        x, y,
        scale: 0.35 + Math.random() * 0.35,
        zIndex: 4
      });
      p._vx = Math.cos(angle) * speed;
      p._vy = Math.sin(angle) * speed;
      p.tint = tintColor;
      this.particles.push(p);
    }
  },

  _resetBall() {
    this.ballState = 'IDLE';
    this.ballSprite.visible = false;
    this.ballX = this.launcherX;
    this.ballY = this.launcherY;
    this.ballSprite.x = this.ballX;
    this.ballSprite.y = this.ballY;
  },

  _triggerWinSequence(engine) {
    this.isRoundEnd = true;
    engine.audio.play('win_jingle');

    // Spawn falling celebrate stars
    for (let i = 0; i < 25; i++) {
      const star = engine.spawn({
        id: `win_star_${Date.now()}_${Math.random()}`,
        asset: 'ui_star',
        x: Math.random() * engine.width,
        y: -20 - Math.random() * 100,
        scale: 0.4 + Math.random() * 0.4,
        zIndex: 8
      });
      star._vx = (Math.random() - 0.5) * 100;
      star._vy = 150 + Math.random() * 150;
      star._isStar = true;
      this.particles.push(star);
    }

    this._winTimer = 2.5;
  },

  preview(miniEngine) {
    this.t = 0;
    this.cannon = miniEngine.spawn({
      color: '#3e4a5e',
      x: 30,
      y: miniEngine.height / 2,
      scale: 0.4
    });
    const tubeG = new PIXI.Graphics();
    tubeG.roundRect(-20, -10, 40, 20, 4).fill(0x3e4a5e);
    this.cannon.addChild(tubeG);
  },

  previewUpdate(miniEngine, dt) {}

};
