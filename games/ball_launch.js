// games/ball_launch.js
// ToyBox Mini-Game: Basketball Shootout (Modernized & Challenging Edition)
// Target age: 2–5 years | Interaction: Drag Launcher & Tap to Launch | Duration: ~3 min

export default {

  config: {
    background:      '#87ceeb', // Sky blue fallback
    interactionMode: 'drag',    // Drag left track to adjust height, Tap right to fire
    assets: [
      'ball_main', 'trail_dot', 'target_cloud', 'particle_burst', 'ui_star'
    ],
    audio: ['launch_whoosh', 'target_pop', 'ball_bounce', 'win_jingle', 'snap_success'],
  },

  init(engine) {
    this.score = 0;
    this.sessionHits = 0;
    this.targetScore = 10;
    this.ballState = 'IDLE'; // 'IDLE' | 'FLYING'
    this.trail = [];
    this.particles = [];
    this.targets = [];
    this.clouds = [];
    this.isRoundEnd = false;
    this._winTimer = 0;
    this.flyTime = 0;
    
    // Aim / drag state
    this.isAiming = false;
    this.isDraggingSlider = false;
    this.aimX = 0;
    this.aimY = 0;
    this.hoopTime = 0;

    // Shot flags for feedback alerts
    this.isBankShot = false;
    this.isRimRattler = false;

    const titleH = Math.max(60, engine.height * 0.12);
    this.launcherX = 60;
    this.launcherY = Math.max(titleH + 30, Math.min(engine.height - 80, engine.height / 2));

    this.isPreviewMode = (engine.app == null) || (engine.width < 250);

    // 1. Background Graphics
    this.bgContainer = engine.spawn({
      id: 'court_background',
      x: 0,
      y: 0,
      zIndex: 0
    });
    this.bgGraphics = new PIXI.Graphics();
    this.bgContainer.addChild(this.bgGraphics);
    this._drawBackground(engine);

    // 2. Score Display
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '🏀 0',
      fontSize: 38,
      color: '#ffffff',
      x: engine.width / 2,
      y: Math.max(25, engine.height * 0.05),
      zIndex: 10
    });
    if (this.scoreLabel.style) {
      this.scoreLabel.style.stroke = '#2c3e50';
      this.scoreLabel.style.strokeThickness = 4;
    }

    // 3. Launcher track guide
    this.trackBg = engine.spawn({
      id: 'launcher_track',
      zIndex: 1
    });
    this.trackGraphics = new PIXI.Graphics();
    this.trackBg.addChild(this.trackGraphics);

    // 4. Launcher Cannon Container
    this.launcherSprite = engine.spawn({
      id: 'launcher_cannon',
      x: this.launcherX,
      y: this.launcherY,
      zIndex: 4
    });
    this.launcherGraphics = new PIXI.Graphics();
    this.launcherSprite.addChild(this.launcherGraphics);
    this._drawLauncher();

    // 5. Draggable Y handle prompt label
    this.slidePrompt = engine.spawn({
      text: '↕ Slide to aim Y',
      fontSize: 14,
      color: '#ffffff',
      x: this.launcherX + 5,
      y: titleH + 10,
      zIndex: 5
    });
    if (this.slidePrompt.style) {
      this.slidePrompt.style.fontWeight = 'bold';
      this.slidePrompt.style.stroke = '#2c3e50';
      this.slidePrompt.style.strokeThickness = 3;
    }

    // 6. Aiming Prediction Line Overlay
    this.aimGraphics = engine.spawn({
      id: 'aim_trajectory',
      zIndex: 4
    });
    this.aimGraphicsObj = new PIXI.Graphics();
    this.aimGraphics.addChild(this.aimGraphicsObj);

    // 7. Slowly drifting clouds
    for (let i = 0; i < 3; i++) {
      const cloud = engine.spawn({
        id: `bg_cloud_${i}`,
        asset: 'target_cloud',
        x: Math.random() * engine.width,
        y: Math.max(80, Math.random() * (engine.height * 0.25)),
        scale: 0.5 + Math.random() * 0.5,
        alpha: 0.3 + Math.random() * 0.3,
        zIndex: 1
      });
      cloud._speed = 8 + Math.random() * 12;
      this.clouds.push(cloud);
    }

    // 8. Spawn basketball hoops layout
    this._spawnAllTargets(engine);
    this._updateHoopColors();

    // 9. Spawn projectile basketball
    this.ballX = this.launcherX;
    this.ballY = this.launcherY;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballSprite = engine.spawn({
      id: 'ball',
      x: this.ballX,
      y: this.ballY,
      zIndex: 5
    });
    this.ballGraphics = new PIXI.Graphics();
    this.ballSprite.addChild(this.ballGraphics);
    this._drawBall();
    this.ballSprite.visible = false;

    // Draw track guide initially
    this._drawTrack(engine);
  },

  update(engine, deltaTime) {
    this.hoopTime += deltaTime;

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

    // 3. Move drifting clouds
    this.clouds.forEach((cloud) => {
      cloud.x -= cloud._speed * deltaTime;
      if (cloud.x < -120) {
        cloud.x = engine.width + 120;
        cloud.y = Math.max(80, Math.random() * (engine.height * 0.25));
      }
    });

    // 4. Update Progressive Hoop Positions
    if (!this.isRoundEnd) {
      this.targets.forEach((t) => {
        if (this.score < 3) {
          // Level 1: Stationary hoop
          t.x = t.baseX;
          t.y = t.baseY;
        } else if (this.score >= 3 && this.score <= 5) {
          // Level 2: Slowly sliding up and down
          t.x = t.baseX;
          t.y = t.baseY + Math.sin(this.hoopTime * 2.0) * 50;
        } else if (this.score >= 6 && this.score <= 8) {
          // Level 3: Faster horizontal waving
          t.x = t.baseX + Math.sin(this.hoopTime * 2.5) * 70;
          t.y = t.baseY + Math.cos(this.hoopTime * 1.5) * 30;
        } else {
          // Level 4 / Final Level: Fast figure-8 movement
          t.x = t.baseX + Math.sin(this.hoopTime * 3.5) * 85;
          t.y = t.baseY + Math.sin(this.hoopTime * 7.0) * 45;
        }

        // Apply updated coordinates to render entities
        if (t.entity) {
          t.entity.x = t.x;
          t.entity.y = t.y;
        }
        if (t.frontEntity) {
          t.frontEntity.x = t.x;
          t.frontEntity.y = t.y;
        }
      });
    }

    // 5. Draw interactive aim line overlay
    this._drawAimLine(engine);

    // 6. Ball physics movement
    if (this.ballState === 'FLYING' && !this.isRoundEnd) {
      this.flyTime += deltaTime;
      if (this.flyTime > 4.0) {
        this._resetBall();
      }

      const GRAVITY = 350;
      this.ballVy += GRAVITY * deltaTime;

      // Apply magnet assist pulling toward the hoop, only if the ball is falling/level and not extremely close
      this._applyMagnetAssist(engine, deltaTime);

      this.ballX += this.ballVx * deltaTime;
      this.ballY += this.ballVy * deltaTime;

      this.ballSprite.x = this.ballX;
      this.ballSprite.y = this.ballY;
      this.ballSprite.angle += this.ballVx * 0.35 * deltaTime;

      // Spawn trail dot
      this._spawnTrailDot(engine);

      // Collisions: Left and right walls
      const ballRadius = 20; // Fixed radius
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

      // Collisions: Floor
      const floorY = engine.height - 80;
      if (this.ballY + ballRadius > floorY) {
        this.ballY = floorY - ballRadius;
        this.ballVy = -this.ballVy * 0.55;
        this.ballVx = this.ballVx * 0.8;
        engine.audio.play('ball_bounce', { volume: 0.6 });

        if (Math.abs(this.ballVy) < 20 && Math.abs(this.ballVx) < 20) {
          this._resetBall();
        }
      }

      // Check collisions with backboard, rims, and scoring hoop
      this._checkCollisions(engine);
    }

    // 7. Celebration win timer
    if (this._winTimer > 0) {
      this._winTimer -= deltaTime;
      if (this._winTimer <= 0) {
        engine.system.triggerWinState({
          title: 'BASKETBALL CHAMPION!',
          message: 'Splendid! You scored all the baskets!',
          onReplay: () => this.init(engine),
          onExit: () => engine.system.exit(),
        });
      }
    }
  },

  onEvent(engine, eventName, payload) {
    if (this.isRoundEnd) return;

    if (eventName === 'drag_start') {
      const { x, y } = payload;
      if (x < 150) {
        this.isDraggingSlider = true;
        const titleH = Math.max(60, engine.height * 0.12);
        this.launcherY = Math.max(titleH + 30, Math.min(engine.height - 80, y));
        this.launcherSprite.y = this.launcherY;
        this._drawTrack(engine);
        if (this.ballState === 'IDLE') {
          this.ballY = this.launcherY;
        }
      } else {
        this.isAiming = true;
        this.aimX = x;
        this.aimY = y;
      }
    } else if (eventName === 'touch_move') {
      const { x, y } = payload;
      if (this.isDraggingSlider) {
        const titleH = Math.max(60, engine.height * 0.12);
        this.launcherY = Math.max(titleH + 30, Math.min(engine.height - 80, y));
        this.launcherSprite.y = this.launcherY;
        this._drawTrack(engine);
        if (this.ballState === 'IDLE') {
          this.ballY = this.launcherY;
        }
      } else if (this.isAiming) {
        this.aimX = x;
        this.aimY = y;
      }
    } else if (eventName === 'drag_end') {
      if (this.isDraggingSlider) {
        this.isDraggingSlider = false;
      } else if (this.isAiming) {
        this._launchBall(this.aimX, this.aimY, engine);
        this.isAiming = false;
      }
    } else if (eventName === 'touch_down') {
      // Direct instant tap launches immediately
      const { x, y } = payload;
      if (x < 150) {
        const titleH = Math.max(60, engine.height * 0.12);
        this.launcherY = Math.max(titleH + 30, Math.min(engine.height - 80, y));
        this.launcherSprite.y = this.launcherY;
        this._drawTrack(engine);
        if (this.ballState === 'IDLE') {
          this.ballY = this.launcherY;
        }
      } else {
        this.isAiming = false;
        this._launchBall(x, y, engine);
      }
    }
  },

  onResize(engine) {
    const titleH = Math.max(60, engine.height * 0.12);
    this.launcherY = Math.max(titleH + 30, Math.min(engine.height - 80, this.launcherY));
    this.launcherSprite.x = this.launcherX;
    this.launcherSprite.y = this.launcherY;

    if (this.scoreLabel) {
      this.scoreLabel.x = engine.width / 2;
      this.scoreLabel.y = Math.max(25, engine.height * 0.05);
    }

    if (this.slidePrompt) {
      this.slidePrompt.x = this.launcherX + 5;
      this.slidePrompt.y = titleH + 10;
    }

    if (this.ballSprite && this.ballState === 'IDLE') {
      this.ballX = this.launcherX;
      this.ballY = this.launcherY;
      this.ballSprite.x = this.ballX;
      this.ballSprite.y = this.ballY;
    }

    // Resize targets base coordinates
    const availableH = engine.height - titleH - 80;
    this.targets.forEach((t) => {
      t.baseX = 160 + t.rx * (engine.width - 240);
      t.baseY = titleH + t.ry * availableH;
      if (this.score < 3) {
        t.x = t.baseX;
        t.y = t.baseY;
        t.entity.x = t.x;
        t.entity.y = t.y;
        t.frontEntity.x = t.x;
        t.frontEntity.y = t.y;
      }
    });

    this._drawBackground(engine);
    this._drawTrack(engine);
  },

  _drawTrack(engine) {
    const titleH = Math.max(60, engine.height * 0.12);
    const g = this.trackGraphics;
    g.clear();

    const startY = titleH + 30;
    const endY = engine.height - 80;

    // Track backing
    g.moveTo(this.launcherX, startY)
     .lineTo(this.launcherX, endY)
     .stroke({ color: 0xffffff, width: 6, alpha: 0.25 });

    // Grid ticks along track Y range
    const ticks = 6;
    for (let i = 0; i < ticks; i++) {
      const ty = startY + (i / (ticks - 1)) * (endY - startY);
      g.moveTo(this.launcherX - 8, ty)
       .lineTo(this.launcherX + 8, ty)
       .stroke({ color: 0xffffff, width: 2, alpha: 0.3 });
    }

    // Slidable slider indicator orb
    g.circle(this.launcherX, this.launcherY, 13).fill({ color: 0xe67e22, alpha: 0.45 });
    g.circle(this.launcherX, this.launcherY, 8).fill(0xffffff);
  },

  _drawBackground(engine) {
    const g = this.bgGraphics;
    g.clear();

    const w = engine.width;
    const h = engine.height;
    const floorY = h - 80;

    // Sunset gradient sky
    const steps = 16;
    const stepH = floorY / steps;
    const cTop = { r: 41, g: 128, b: 185 };    // sky blue
    const cBottom = { r: 241, g: 196, b: 15 }; // gold sunset
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(cTop.r + (cBottom.r - cTop.r) * t);
      const gColor = Math.round(cTop.g + (cBottom.g - cTop.g) * t);
      const b = Math.round(cTop.b + (cBottom.b - cTop.b) * t);
      const colorHex = (r << 16) + (gColor << 8) + b;
      g.rect(0, i * stepH, w, stepH + 1).fill(colorHex);
    }

    // Setting sun
    g.circle(w * 0.75, floorY, 60).fill({ color: 0xffffff, alpha: 0.15 });
    g.circle(w * 0.75, floorY, 45).fill({ color: 0xffe066, alpha: 0.4 });

    // Distant mountain silhouettes
    g.moveTo(0, floorY);
    g.lineTo(w * 0.2, floorY - 50);
    g.lineTo(w * 0.4, floorY - 20);
    g.lineTo(w * 0.6, floorY - 80);
    g.lineTo(w * 0.8, floorY - 30);
    g.lineTo(w, floorY);
    g.fill({ color: 0x95a5a6, alpha: 0.3 });

    // Asphalt floor
    g.rect(0, floorY, w, 80).fill(0x2c3e50);

    // Red key painted area under hoop
    const keyWidth = w * 0.35;
    const keyHeight = 80;
    g.rect(w - keyWidth, floorY, keyWidth, keyHeight).fill(0xd35400);

    // White court lines
    g.rect(0, floorY, w, 4).fill(0xffffff);
    g.rect(w - keyWidth, floorY, 4, keyHeight).fill(0xffffff);

    // Three-point line arc
    const actualHoopX = 160 + 0.75 * (w - 240);
    g.circle(actualHoopX, floorY, 100).stroke({ color: 0xffffff, width: 3, alpha: 0.7 });
  },

  _drawLauncher() {
    const g = this.launcherGraphics;
    g.clear();
    // Base pivot mount
    g.circle(-10, 0, 16).fill(0xd35400).stroke({ color: 0xffffff, width: 2 });
    // Barrel launcher
    g.roundRect(-15, -12, 52, 24, 6).fill(0x2c3e50).stroke({ color: 0xe67e22, width: 2 });
    // Glowing firing tip
    g.rect(32, -10, 5, 20).fill(0xffcc00);
  },

  _drawBall() {
    const g = this.ballGraphics;
    g.clear();
    // Orange basketball circle
    g.circle(0, 0, 20).fill(0xff5722);
    // Outer black border
    g.circle(0, 0, 20).stroke({ color: 0x2c3e50, width: 2 });
    // Seams
    g.moveTo(0, -20).lineTo(0, 20).stroke({ color: 0x2c3e50, width: 1.5 });
    g.moveTo(-20, 0).lineTo(20, 0).stroke({ color: 0x2c3e50, width: 1.5 });
    g.arc(22, 0, 15, Math.PI * 0.65, Math.PI * 1.35).stroke({ color: 0x2c3e50, width: 1.5 });
    g.arc(-22, 0, 15, Math.PI * 1.65, Math.PI * 2.35).stroke({ color: 0x2c3e50, width: 1.5 });
  },

  _drawAimLine(engine) {
    const g = this.aimGraphicsObj;
    g.clear();

    if (!this.isAiming || this.ballState === 'FLYING' || this.isRoundEnd) {
      return;
    }

    const dx = this.aimX - this.launcherX;
    const dy = this.aimY - this.launcherY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 10) return;

    // Rotate cannon to point at current dragging finger
    this.launcherSprite.rotation = Math.atan2(dy, dx);

    const speed = 720;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    const GRAVITY = 350;
    const numDots = 12;
    const timeStep = 0.08;

    for (let i = 1; i <= numDots; i++) {
      const t = i * timeStep;
      const px = this.launcherX + vx * t;
      const py = this.launcherY + vy * t + 0.5 * GRAVITY * t * t;

      // Stop drawing path if it collides with floor or goes offscreen
      if (py > engine.height - 80 || px > engine.width || px < 0) {
        break;
      }

      g.circle(px, py, 6).fill({ color: 0xffffff, alpha: 0.25 });
      g.circle(px, py, 3.5).fill(0xffcc00);
    }
  },

  _spawnAllTargets(engine) {
    const layout = [
      { rx: 0.75, ry: 0.40, isHoop: true }
    ];

    const titleH = Math.max(60, engine.height * 0.12);
    const availableH = engine.height - titleH - 80;

    layout.forEach((node, i) => {
      const x = 160 + node.rx * (engine.width - 240);
      const y = titleH + node.ry * availableH;

      // 1. Hoop Back Entity (drawn behind ball at zIndex 2)
      const entity = engine.spawn({
        id: `target_launch_back_${i}`,
        x, y,
        zIndex: 2
      });

      const hoopBackG = new PIXI.Graphics();
      const poleHeight = 2000; // Deep pole extending below screen to support movement

      // Support pole
      hoopBackG.rect(34, -20, 8, poleHeight).fill(0x7f8c8d);
      // White backboard base
      hoopBackG.roundRect(26, -55, 8, 65, 4).fill(0xffffff).stroke({ color: 0xcccccc, width: 2 });
      // Metal bracket
      hoopBackG.rect(20, -3, 6, 6).fill(0xffffff);
      // Back net translucent mesh fill
      hoopBackG.poly([-23, 0, 23, 0, 11, 35, -11, 35]).fill({ color: 0xffffff, alpha: 0.15 });

      // Back net lines
      const netLefts = [-23, -15, -7, 0, 7, 15, 23];
      for (let i = 0; i < netLefts.length; i++) {
        const xStart = netLefts[i];
        const xEnd = -11 + (i / (netLefts.length - 1)) * 22;
        hoopBackG.moveTo(xStart, 0).lineTo(xEnd, 35).stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
      }
      entity.addChild(hoopBackG);

      // Separate tintable graphics for the backboard border, shooter square, and back rim
      const rimBackG = new PIXI.Graphics();
      rimBackG.roundRect(26, -55, 8, 65, 4).stroke({ color: 0xffffff, width: 2 });
      rimBackG.rect(26, -35, 4, 20).stroke({ color: 0xffffff, width: 2 });
      rimBackG.moveTo(23, 0);
      rimBackG.quadraticCurveTo(0, -12, -23, 0);
      rimBackG.stroke({ color: 0xffffff, width: 4 });
      entity.addChild(rimBackG);

      // 2. Hoop Front Entity (drawn in front of ball at zIndex 6)
      const frontEntity = engine.spawn({
        id: `target_launch_front_${i}`,
        x, y,
        zIndex: 6
      });

      const hoopFrontG = new PIXI.Graphics();
      // Front net lines crossing down
      for (let i = 0; i < netLefts.length; i++) {
        const xStart = netLefts[i];
        const xEnd = 11 - (i / (netLefts.length - 1)) * 22;
        hoopFrontG.moveTo(xStart, 0).lineTo(xEnd, 35).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
      }
      // Horizontal mesh rings
      hoopFrontG.ellipse(0, 12, 19, 3).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
      hoopFrontG.ellipse(0, 24, 15, 2).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
      frontEntity.addChild(hoopFrontG);

      // Separate tintable graphics for the front rim curve
      const rimFrontG = new PIXI.Graphics();
      rimFrontG.moveTo(-23, 0);
      rimFrontG.quadraticCurveTo(0, 12, 23, 0);
      rimFrontG.stroke({ color: 0xffffff, width: 4 });
      frontEntity.addChild(rimFrontG);

      this.targets.push({
        entity,
        frontEntity,
        rimBackG,
        rimFrontG,
        isHoop: node.isHoop,
        rx: node.rx,
        ry: node.ry,
        x, y,
        baseX: x,
        baseY: y,
        _respawnTimer: 0,
        _popping: false
      });
    });
  },

  _launchBall(tapX, tapY, engine) {
    const dx = tapX - this.launcherX;
    const dy = tapY - this.launcherY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist < 10) return;

    this.launcherSprite.rotation = Math.atan2(dy, dx);

    this.ballX = this.launcherX;
    this.ballY = this.launcherY;
    
    const speed = 720;
    this.ballVx = (dx / dist) * speed;
    this.ballVy = (dy / dist) * speed;

    this.ballSprite.x = this.ballX;
    this.ballSprite.y = this.ballY;
    this.ballSprite.angle = 0;
    this.ballSprite.visible = true;
    this.ballState = 'FLYING';
    this.flyTime = 0;
    
    this.isBankShot = false;
    this.isRimRattler = false;

    engine.audio.play('launch_whoosh');

    // Juice: Spring Recoil Animation on Cannon
    engine.animate(this.launcherSprite, { scaleX: 0.55 }, 0.05, 'easeIn')
      .then(() => engine.animate(this.launcherSprite, { scaleX: 1.0 }, 0.25, 'elastic'));
  },

  _applyMagnetAssist(engine, dt) {
    if (this.ballVy < -50) return;

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
    const MAGNET_MIN_DIST = 35;
    const MAGNET_STRENGTH = 480;

    if (nearest && minDist < MAGNET_RADIUS && minDist > MAGNET_MIN_DIST) {
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
      scale: 0.3 + Math.random() * 0.3,
      zIndex: 3
    });
    // Comet fire trail: orange or yellow
    dot.tint = Math.random() > 0.5 ? 0xff5722 : 0xffcc00;
    dot.alpha = 0.6;
    this.trail.push(dot);
  },

  _checkCollisions(engine) {
    const ballRadius = 20;

    this.targets.forEach((t) => {
      if (t._respawnTimer > 0 || t._popping) return;

      const dx = t.x - this.ballX;
      const dy = t.y - this.ballY;
      const dist = Math.sqrt(dx*dx + dy*dy);

      // 1. Scoring Check (Ball falls through center of hoop)
      if (dist < 26 && this.ballVy > 0 && Math.abs(dx) < 22) {
        this._scoreTarget(t, engine, true);
        return;
      }

      // 2. Backboard Collision
      const backboardX = t.x + 24;
      const backboardMinY = t.y - 55;
      const backboardMaxY = t.y + 10;
      
      if (this.ballY >= backboardMinY && this.ballY <= backboardMaxY) {
        if (this.ballX + ballRadius >= backboardX && this.ballX - ballRadius < backboardX + 8 && this.ballVx > 0) {
          this.ballX = backboardX - ballRadius;
          this.ballVx = -this.ballVx * 0.65;
          this.isBankShot = true; // Flag bank shot
          engine.audio.play('ball_bounce', { volume: 0.7 });
          return;
        }
      }

      // 3. Rim Bounces
      const leftRimX = t.x - 23;
      const rightRimX = t.x + 23;
      const rimY = t.y;
      
      const distToLeftRim = Math.sqrt((this.ballX - leftRimX)**2 + (this.ballY - rimY)**2);
      if (distToLeftRim < ballRadius) {
        const nx = (this.ballX - leftRimX) / distToLeftRim;
        const ny = (this.ballY - rimY) / distToLeftRim;
        const dot = this.ballVx * nx + this.ballVy * ny;
        this.ballVx = (this.ballVx - 2 * dot * nx) * 0.6;
        this.ballVy = (this.ballVy - 2 * dot * ny) * 0.6;
        this.ballX = leftRimX + nx * ballRadius;
        this.ballY = rimY + ny * ballRadius;
        this.isRimRattler = true; // Flag rim bounce
        engine.audio.play('ball_bounce', { volume: 0.6 });
        return;
      }
      
      const distToRightRim = Math.sqrt((this.ballX - rightRimX)**2 + (this.ballY - rimY)**2);
      if (distToRightRim < ballRadius) {
        const nx = (this.ballX - rightRimX) / distToRightRim;
        const ny = (this.ballY - rimY) / distToRightRim;
        const dot = this.ballVx * nx + this.ballVy * ny;
        this.ballVx = (this.ballVx - 2 * dot * nx) * 0.6;
        this.ballVy = (this.ballVy - 2 * dot * ny) * 0.6;
        this.ballX = rightRimX + nx * ballRadius;
        this.ballY = rimY + ny * ballRadius;
        this.isRimRattler = true; // Flag rim bounce
        engine.audio.play('ball_bounce', { volume: 0.6 });
        return;
      }

      // 4. Support Pole Collision
      const poleX = t.x + 34;
      const poleMinY = t.y - 20;
      if (this.ballY >= poleMinY) {
        if (this.ballX + ballRadius >= poleX && this.ballX - ballRadius < poleX + 8) {
          if (this.ballVx > 0) {
            this.ballX = poleX - ballRadius;
            this.ballVx = -this.ballVx * 0.5;
          } else if (this.ballVx < 0) {
            this.ballX = poleX + 8 + ballRadius;
            this.ballVx = -this.ballVx * 0.5;
          }
          engine.audio.play('ball_bounce', { volume: 0.5 });
        }
      }
    });
  },

  _scoreTarget(target, engine, isHoopScore) {
    target._popping = true;

    engine.audio.play('snap_success');
    engine.fx.wiggle(target.entity);
    if (target.frontEntity) {
      engine.fx.wiggle(target.frontEntity);
    }
    
    // Burst orange, white, and yellow celebration particles
    this._burstDebris(target.x, target.y, 0xff9500, engine);
    this._burstDebris(target.x, target.y, 0xffffff, engine);
    this._burstDebris(target.x, target.y, 0xffd700, engine);

    // Update score
    this.score++;
    this.sessionHits++;
    this.scoreLabel.text = `🏀 ${this.score}`;
    engine.animate(this.scoreLabel, { scale: 1.35 }, 0.1, 'easeOut')
      .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

    // Floating text alert messages
    let msgText = "+1";
    if (this.isBankShot) {
      msgText = "BANK SHOT! 🏀";
    } else if (this.isRimRattler) {
      msgText = "RIM RATTLER! 🏀";
    } else {
      const messages = ["SWISH! 🌟", "PERFECT! ⭐", "NICE SHOT! 🔥", "SPLASH! 💦"];
      msgText = messages[Math.floor(Math.random() * messages.length)];
    }
    
    const floatMsg = engine.spawn({
      text: msgText,
      fontSize: 24,
      color: '#ffcc00',
      x: target.x,
      y: target.y - 45,
      zIndex: 10
    });
    if (floatMsg.style) {
      floatMsg.style.stroke = '#2c3e50';
      floatMsg.style.strokeThickness = 4;
    }
    engine.fx.floatUp(floatMsg);

    // Trigger level alerts as score increases
    if (this.score === 3) {
      this._showLevelNotice(engine, "LEVEL 2: MOVING HOOP! ↕", 0x3498db);
    } else if (this.score === 6) {
      this._showLevelNotice(engine, "LEVEL 3: FAST WAVE! ↔", 0x9b59b6);
    } else if (this.score === 9) {
      this._showLevelNotice(engine, "FINAL LEVEL: CRAZY HOOP! 🔄", 0xe74c3c);
    }

    // Refresh hoop colors/glowing tints
    this._updateHoopColors();

    // Reset popping state shortly
    setTimeout(() => {
      target.entity.visible = true;
      if (target.frontEntity) target.frontEntity.visible = true;
      target._respawnTimer = 0;
      target._popping = false;
    }, 250);

    // Swish physics slowdown
    this.ballVx = this.ballVx * 0.35;
    this.ballVy = Math.max(160, this.ballVy * 0.45);

    // Check round win
    if (this.sessionHits >= this.targetScore && !this.isRoundEnd) {
      this._triggerWinSequence(engine);
    }
  },

  _updateHoopColors() {
    let color = 0xe74c3c; // Level 1: red-orange
    if (this.score >= 3 && this.score <= 5) {
      color = 0x3498db; // Level 2: neon blue
    } else if (this.score >= 6 && this.score <= 8) {
      color = 0x9b59b6; // Level 3: neon purple
    } else if (this.score >= 9) {
      color = 0xf1c40f; // Final Level: gold
    }

    this.targets.forEach((t) => {
      if (t.rimBackG) t.rimBackG.tint = color;
      if (t.rimFrontG) t.rimFrontG.tint = color;
    });
  },

  _showLevelNotice(engine, text, colorHex) {
    const notice = engine.spawn({
      text: text,
      fontSize: 28,
      color: '#ffffff',
      x: engine.width / 2,
      y: engine.height * 0.35,
      zIndex: 15
    });
    if (notice.style) {
      notice.style.stroke = '#2c3e50';
      notice.style.strokeThickness = 6;
      notice.style.fill = colorHex;
    }

    notice.scale.set(0);
    engine.animate(notice, { scale: 1.4 }, 0.3, 'elastic')
      .then(() => {
        setTimeout(() => {
          engine.animate(notice, { y: notice.y - 120, alpha: 0 }, 0.65, 'easeIn')
            .then(() => engine.destroy(notice));
        }, 1300);
      });

    engine.audio.play('win_jingle', { volume: 0.3 });
  },

  _burstDebris(x, y, tintColor, engine) {
    const count = 6;
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
    
    // 1. Cannon launcher
    this.previewCannon = miniEngine.spawn({
      x: 30,
      y: miniEngine.height / 2 + 10,
      render(ctx) {
        ctx.fillStyle = '#d35400';
        ctx.beginPath();
        ctx.arc(-5, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#2c3e50';
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-8, -5, 22, 10, 2);
        ctx.fill();
        ctx.stroke();
      }
    });

    // 2. Hoop
    this.previewHoop = miniEngine.spawn({
      x: miniEngine.width - 35,
      y: miniEngine.height / 2 - 10,
      render(ctx) {
        // Backboard
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 1.5;
        ctx.fillRect(8, -20, 3, 25);
        ctx.strokeRect(8, -20, 3, 25);
        
        // Rim
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Net
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(5, 15);
        ctx.lineTo(-5, 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });

    // 3. Basketball
    this.previewBall = miniEngine.spawn({
      x: 30,
      y: miniEngine.height / 2 + 10,
      render(ctx) {
        // Orange basketball
        ctx.fillStyle = '#ff5722';
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // lines
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();
      }
    });
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    
    // Cycle the ball flight every 2.0 seconds
    const cycle = this.t % 2.0;
    
    if (cycle < 1.4) {
      // Ball is flying in a parabolic arc from launcher (30, height/2+10) to hoop (width-35, height/2-10)
      const startX = 30;
      const startY = miniEngine.height / 2 + 10;
      const endX = miniEngine.width - 35;
      const endY = miniEngine.height / 2 - 10;
      
      const progress = cycle / 1.4;
      
      // Interpolate X linearly
      const px = startX + (endX - startX) * progress;
      // Interpolate Y quadratically to form an arc
      const py = startY + (endY - startY) * progress - Math.sin(progress * Math.PI) * 40;
      
      this.previewBall.x = px;
      this.previewBall.y = py;
      this.previewBall.angle = progress * 720;
      this.previewBall.alpha = 1.0;
      
      // Rotate cannon launcher to point at the ball
      const dx = px - startX;
      const dy = py - startY;
      this.previewCannon.angle = Math.atan2(dy, dx) * 180 / Math.PI;
    } else {
      // Reset ball and point launcher back up
      this.previewBall.alpha = 0;
      this.previewCannon.angle = -30;
    }
  }

};
