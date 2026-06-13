// games/ball_launch.js
// ToyBox Mini-Game: Ball Launch
// Target age: 2–5 years | Interaction: Tap | Duration: ~3 min

const TARGET_ASSETS = [
  'target_balloon_red', 'target_balloon_blue', 'target_balloon_green',
  'target_star_yellow', 'target_star_pink',
  'target_fruit_apple', 'target_fruit_orange', 'target_fruit_banana',
  'target_cloud'
];

export default {

  config: {
    background:      '#87ceeb', // Sky blue
    interactionMode: 'tap',
    assets: [
      'ball_main', 'trail_dot', 'btn_launch_bg',
      ...TARGET_ASSETS, 'particle_burst', 'ui_star'
    ],
    audio: ['launch_whoosh', 'target_pop', 'ball_bounce', 'win_jingle'],
  },

  init(engine) {
    this.score = 0;
    this.sessionHits = 0;
    this.targetScore = 20; // 20 target hits to win
    this.ballState = 'IDLE'; // 'IDLE' | 'FLYING' | 'LANDED'
    this.trail = [];
    this.particles = [];
    this.targets = [];
    this.isRoundEnd = false;
    this._winTimer = 0;
    this._returnTimer = 0;
    
    this.ballStartX = engine.width / 2;
    this.ballStartY = engine.height * 0.82; // BL-3

    // Score display (Top center)
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '⭐ 0',
      fontSize: 38,
      color: '#ffffff',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
    });
    // Add soft outline for readability against light sky background
    if (this.scoreLabel.style) {
      this.scoreLabel.style.stroke = '#2980b9';
      this.scoreLabel.style.strokeThickness = 4;
    }

    // Spawn 3x3 Grid of Targets
    const cols = 3;
    const rows = 3;
    const spacingX = engine.width * 0.28;
    const spacingY = engine.height * 0.14;
    const startX = engine.width / 2 - spacingX;
    const startY = 110;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX + (r % 2 === 1 ? spacingX * 0.25 : 0); // slight offset row stagger
        const y = startY + r * spacingY;
        this._spawnTarget(engine, x, y, r * cols + c);
      }
    }

    // Spawn ball
    this.ballX = this.ballStartX;
    this.ballY = this.ballStartY;
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
    // Set scale based on canvas size
    const ballScale = (engine.width * 0.08) / 80; // base ball size is 80px
    this.ballSprite.scale.set(ballScale);

    // Spawn Launch Button
    this.btnW = engine.width * 0.65;
    this.btnH = Math.max(50, engine.height * 0.11);
    this.launchButton = engine.spawn({
      id: 'btn_launch',
      asset: 'btn_launch_bg',
      x: engine.width / 2,
      y: engine.height - this.btnH / 2 - 15,
      zIndex: 6,
      onTouch: (self) => this._onLaunchTapped(engine)
    });
    this.launchButton.width = this.btnW;
    this.launchButton.height = this.btnH;

    // Button label
    this.btnLabel = engine.spawn({
      text: 'LAUNCH! 🚀',
      fontSize: 28,
      color: '#ffffff',
      x: engine.width / 2,
      y: engine.height - this.btnH / 2 - 15,
      zIndex: 7
    });
    if (this.btnLabel.style) {
      this.btnLabel.style.stroke = '#80091d';
      this.btnLabel.style.strokeThickness = 4;
    }
  },

  update(engine, deltaTime) {
    // 1. Target respawn timer updates (if not round end)
    if (!this.isRoundEnd) {
      this.targets.forEach((t) => {
        if (t._respawnTimer > 0) {
          t._respawnTimer -= deltaTime;
          if (t._respawnTimer <= 0) {
            // Fade back in
            t.visible = true;
            t.alpha = 0;
            engine.animate(t, { alpha: 1.0 }, 0.4);
          }
        }
      });
    }

    // 2. Trail logic
    this.trail = this.trail.filter((dot) => {
      dot.alpha -= 3.0 * deltaTime;
      if (dot.alpha <= 0) {
        engine.destroy(dot);
        return false;
      }
      return true;
    });

    // 3. Debris particles logic
    this.particles = this.particles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      const decay = p._isStar ? 0.4 : 2.0;
      p.alpha -= decay * deltaTime;
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });

    // 4. Ball physics & simulation
    if (this.ballState === 'FLYING' && !this.isRoundEnd) {
      const GRAVITY = 400; // BL-2
      this.ballVy += GRAVITY * deltaTime;

      // Magnet Assist
      this._applyMagnetAssist(engine, deltaTime);

      // Apply motion
      this.ballX += this.ballVx * deltaTime;
      this.ballY += this.ballVy * deltaTime;
      this.ballSprite.x = this.ballX;
      this.ballSprite.y = this.ballY;

      // Rotation during flight
      this.ballSprite.angle += this.ballVx * 0.4 * deltaTime;

      // Spawn trail dot
      this._spawnTrailDot(engine);

      // Collision checks: Walls
      const ballRadius = this.ballSprite.width / 2;
      if (this.ballX - ballRadius < 0) {
        this.ballX = ballRadius;
        this.ballVx = -this.ballVx * 0.85;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      } else if (this.ballX + ballRadius > engine.width) {
        this.ballX = engine.width - ballRadius;
        this.ballVx = -this.ballVx * 0.85;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      }

      // Ceiling
      if (this.ballY - ballRadius < 0) {
        this.ballY = ballRadius;
        this.ballVy = -this.ballVy * 0.85;
        engine.audio.play('ball_bounce', { volume: 0.5 });
      }

      // Floor / Out of bounds
      if (this.ballY > engine.height + 80) {
        this._returnBallToIdle(engine);
      }

      // Collision checks: Targets
      this._checkTargetCollisions(engine);
    }

    // Delta-time timers (CX-1 / BL-7 / BL-6)
    if (this._returnTimer > 0) {
      this._returnTimer -= deltaTime;
      if (this._returnTimer <= 0) {
        if (!this.isRoundEnd) {
          this.ballX = this.ballStartX;
          this.ballY = this.ballStartY;
          this.ballVx = 0;
          this.ballVy = 0;
          this.ballSprite.x = this.ballX;
          this.ballSprite.y = this.ballY;
          this.ballSprite.rotation = 0;
          this.ballState = 'IDLE';

          // Restore button UI (BL-5)
          engine.animate(this.launchButton, { alpha: 1.0 }, 0.2);
          engine.animate(this.btnLabel, { alpha: 1.0 }, 0.2);
        }
      }
    }

    if (this._winTimer > 0) {
      this._winTimer -= deltaTime;
      if (this._winTimer <= 0) {
        engine.system.triggerWinState({
          title: 'BALL LAUNCH CHAMPION!',
          message: 'Magnificent! You popped 20 flying targets!',
          onReplay: () => this.init(engine),
          onExit: () => engine.system.exit(),
        });
      }
    }
  },

  onEvent(engine, eventName, payload) {},

  onResize(engine) {
    this.ballStartX = engine.width / 2;
    this.ballStartY = engine.height * 0.82;

    if (this.scoreLabel) {
      this.scoreLabel.x = engine.width / 2;
    }

    if (this.targets) {
      const spacingX = engine.width * 0.28;
      const spacingY = engine.height * 0.14;
      const startX = engine.width / 2 - spacingX;
      const startY = 110;
      this.targets.forEach((t) => {
        const index = t._idSuffix;
        const r = Math.floor(index / 3);
        const c = index % 3;
        t.x = startX + c * spacingX + (r % 2 === 1 ? spacingX * 0.25 : 0);
        t.y = startY + r * spacingY;
      });
    }

    if (this.ballSprite) {
      const ballScale = (engine.width * 0.08) / 80;
      this.ballSprite.scale.set(ballScale);
      
      if (this.ballState === 'IDLE' || this.ballState === 'LANDED') {
        this.ballX = this.ballStartX;
        this.ballY = this.ballStartY;
        this.ballSprite.x = this.ballX;
        this.ballSprite.y = this.ballY;
      }
    }

    this.btnW = engine.width * 0.65;
    this.btnH = Math.max(50, engine.height * 0.11);
    if (this.launchButton) {
      this.launchButton.x = engine.width / 2;
      this.launchButton.y = engine.height - this.btnH / 2 - 15;
      this.launchButton.width = this.btnW;
      this.launchButton.height = this.btnH;
    }

    if (this.btnLabel) {
      this.btnLabel.x = engine.width / 2;
      this.btnLabel.y = engine.height - this.btnH / 2 - 15;
    }
  },

  _spawnTarget(engine, x, y, idSuffix) {
    const asset = TARGET_ASSETS[Math.floor(Math.random() * TARGET_ASSETS.length)];
    const target = engine.spawn({
      id: `target_${idSuffix}`,
      asset, x, y,
      scale: 1,
      zIndex: 2
    });
    target.width = 64;
    target.height = 64;
    target._respawnTimer = 0;
    target._idSuffix = idSuffix;

    this.targets.push(target);
  },

  _onLaunchTapped(engine) {
    if (this.ballState !== 'IDLE' || this.isRoundEnd) return;

    this.ballState = 'FLYING';
    engine.audio.play('launch_whoosh');

    // Button push bounce anim
    engine.animate(this.launchButton, { scale: 0.9 }, 0.08, 'easeOut')
      .then(() => engine.animate(this.launchButton, { scale: 1.0 }, 0.08, 'bounce'));

    // Hide button UI during flight (BL-5)
    engine.animate(this.launchButton, { alpha: 0 }, 0.2);
    engine.animate(this.btnLabel, { alpha: 0 }, 0.2);

    // Aim toward the nearest active target
    let nearest = null;
    let minDist = 99999;
    this.targets.forEach((t) => {
      if (t._respawnTimer <= 0 && t.visible) {
        const dx = t.x - this.ballX;
        const dy = t.y - this.ballY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = t;
        }
      }
    });

    // Launch vector: aim at nearest target with soft randomized variation
    let launchVx = 0;
    let launchVy = -600; // BL-2

    if (nearest) {
      const dx = nearest.x - this.ballX;
      const dy = nearest.y - this.ballY;
      const angle = Math.atan2(dy, dx);
      // Nudge launch angle slightly
      const offset = (Math.random() - 0.5) * 0.52; // BL-2: +/- 15 degrees
      launchVx = Math.cos(angle + offset) * 600; // BL-2
      launchVy = Math.sin(angle + offset) * 600; // BL-2
    } else {
      // Default upward left/right kick
      launchVx = (Math.random() - 0.5) * 350;
    }

    // Cap horizontal speed to keep it screen bounded
    this.ballVx = Math.max(-380, Math.min(380, launchVx)); // BL-2
    this.ballVy = Math.min(-380, launchVy); // BL-2
  },

  _applyMagnetAssist(engine, dt) {
    let nearest = null;
    let minDist = 99999;

    this.targets.forEach((t) => {
      if (t._respawnTimer <= 0 && t.visible) {
        const dx = t.x - this.ballX;
        const dy = t.y - this.ballY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = t;
        }
      }
    });

    const MAGNET_RADIUS = 120; // BL-4
    const MAGNET_STRENGTH = 500; // BL-4

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
      scale: 0.6,
      zIndex: 3
    });
    dot.alpha = 0.55;
    this.trail.push(dot);
  },

  _checkTargetCollisions(engine) {
    const hitRadius = 38; // Target width is 64

    this.targets.forEach((t) => {
      if (t._respawnTimer > 0 || !t.visible || t._popping) return;

      const dx = t.x - this.ballX;
      const dy = t.y - this.ballY;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < hitRadius) {
        this._popTarget(t, engine);
      }
    });
  },

  _popTarget(target, engine) {
    if (target._popping) return;
    target._popping = true;

    // 1. Play target pop audio
    engine.audio.play('target_pop');

    // 2. Animate scale and alpha (BL-1)
    const targetScale = target.scale.x;
    engine.animate(target, { scale: targetScale * 2.0, alpha: 0 }, 0.3, 'easeOut')
      .then(() => {
        // Deactivate target & start respawn timer
        target.visible = false;
        target.scale.set(targetScale);
        target.alpha = 1;
        target._respawnTimer = 1.6; // Respawn after 1.6s
        target._popping = false;
      });

    // 3. Score update
    this.score++;
    this.sessionHits++;
    this.scoreLabel.text = `⭐ ${this.score}`;
    engine.animate(this.scoreLabel, { scale: 1.3 }, 0.1, 'easeOut')
      .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

    // 4. Sparkle/burst effect
    this._burstDebris(target.x, target.y, engine);

    // 5. Deflect ball slightly for bounce visual feedback
    this.ballVy = -this.ballVy * 0.4;
    this.ballVx += (Math.random() - 0.5) * 150;

    // Check round end
    if (this.sessionHits >= this.targetScore) {
      this._triggerWinSequence(engine);
    }
  },

  _triggerWinSequence(engine) {
    this.isRoundEnd = true;
    engine.audio.play('win_jingle');

    // Spawn 25 star particles that rain from the top (BL-6)
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

  _burstDebris(x, y, engine) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 120;
      const p = engine.spawn({
        id: `debris_${Date.now()}_${Math.random()}`,
        asset: 'particle_burst',
        x, y,
        scale: 0.35 + Math.random() * 0.4,
        zIndex: 4
      });
      p._vx = Math.cos(angle) * speed;
      p._vy = Math.sin(angle) * speed;
      this.particles.push(p);
    }
  },

  _returnBallToIdle(engine) {
    this.ballState = 'LANDED';
    this._returnTimer = 0.3; // BL-7
  },

  preview(miniEngine) {
    this.t = 0;
    this.ballX = miniEngine.width / 2;
    this.ballY = miniEngine.height * 0.7;
    this.ballVx = 80;
    this.ballVy = -160;

    this.ball = miniEngine.spawn({
      asset: 'ball_main',
      color: '#e94560',
      x: this.ballX,
      y: this.ballY,
      scale: 0.4
    });

    this.target = miniEngine.spawn({
      asset: 'target_balloon_red',
      color: '#2196f3',
      x: miniEngine.width * 0.65,
      y: miniEngine.height * 0.35,
      scale: 0.4
    });
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;

    if (this.t < 2.0) {
      // Simulate ball arc
      this.ballVy += 130 * dt;
      this.ballX += this.ballVx * dt;
      this.ballY += this.ballVy * dt;
      
      this.ball.x = this.ballX;
      this.ball.y = this.ballY;

      // collision simulation
      const dx = this.target.x - this.ballX;
      const dy = this.target.y - this.ballY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 18 && this.target.visible) {
        this.target.visible = false;
        // bounce
        this.ballVy = -this.ballVy * 0.3;
      }
    } else {
      // Reset
      this.t = 0;
      this.ballX = miniEngine.width / 2;
      this.ballY = miniEngine.height * 0.7;
      this.ballVx = 80;
      this.ballVy = -160;
      this.ball.x = this.ballX;
      this.ball.y = this.ballY;
      this.target.visible = true;
    }
  }

};
