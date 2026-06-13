// games/sound_board.js
// ToyBox Mini-Game: Sound Board
// Target age: 1–4 years | Interaction: Tap | Duration: Open-ended

const TILE_DATA = [
  { id: 'circle',   shape: 'shape_circle',   color: '#2196F3', sound: 'sound_boing', label: 'Circle' },
  { id: 'square',   shape: 'shape_square',   color: '#F44336', sound: 'sound_drum',  label: 'Square' },
  { id: 'triangle', shape: 'shape_triangle', color: '#4CAF50', sound: 'sound_chime', label: 'Triangle' },
  { id: 'star',     shape: 'shape_star',     color: '#FFC107', sound: 'sound_ding',  label: 'Star' },
  { id: 'heart',    shape: 'shape_heart',    color: '#E91E63', sound: 'sound_moo',   label: 'Heart' },
  { id: 'diamond',  shape: 'shape_diamond',  color: '#9C27B0', sound: 'sound_quack', label: 'Diamond' },
];

export default {

  config: {
    background:      '#1a1a2e',
    interactionMode: 'tap',
    assets: [
      'shape_circle', 'shape_square', 'shape_triangle', 'shape_star', 'shape_heart', 'shape_diamond'
    ],
    audio: ['sound_boing', 'sound_drum', 'sound_chime', 'sound_ding', 'sound_moo', 'sound_quack'],
  },

  init(engine) {
    this.tiles = [];

    // Title label
    this.titleLabel = engine.spawn({
      id: 'title',
      text: '🎵 Sound Board',
      fontSize: Math.max(20, Math.min(32, engine.height * 0.05)),
      color: '#e0e0e0',
      x: engine.width / 2,
      y: Math.max(25, engine.height * 0.04),
      zIndex: 10
    });

    const COLS = 2;
    const ROWS = 3;
    const padding = engine.width * 0.025;
    const titleH = engine.height * 0.08;
    const cellW = (engine.width - padding * (COLS + 1)) / COLS;
    const cellH = (engine.height - titleH - padding * (ROWS + 1)) / ROWS;

    TILE_DATA.forEach((data, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);

      const cellX = padding + col * (cellW + padding) + cellW / 2;
      const cellY = titleH + padding + row * (cellH + padding) + cellH / 2;

      // SB-2: Spawn background panel as a container with direct PIXI.Graphics (no renderer.generateTexture)
      const panel = engine.spawn({
        id: `tile_bg_${index}`,
        x: cellX,
        y: cellY,
        onTouch: (self) => this._onTileTapped(index, engine),
        zIndex: 2
      });

      const baseColor = parseInt(data.color.replace('#', ''), 16);
      const bgG = new PIXI.Graphics();
      bgG.roundRect(-cellW/2, -cellH/2, cellW, cellH, 18)
        .fill(baseColor)
        .stroke({ color: 0xffffff, width: 3, alpha: 0.3 });
      panel.addChild(bgG);

      // SB-4: Spawn a white overlay graphics for panel flash
      const flashOverlay = new PIXI.Graphics();
      flashOverlay.roundRect(-cellW/2, -cellH/2, cellW, cellH, 18)
        .fill({ color: 0xffffff, alpha: 1 });
      flashOverlay.alpha = 0;
      panel.addChild(flashOverlay);

      // 2. Spawn shape sprite centered inside panel
      const shape = engine.spawn({
        id: `tile_shape_${index}`,
        asset: data.shape,
        x: cellX,
        y: cellY - cellH * 0.08,
        zIndex: 3
      });
      // Scale shape relative to cell size
      const targetShapeH = cellH * 0.45;
      const shapeScale = targetShapeH / 100; // Generated shapes are roughly 100px size
      shape.scale.set(shapeScale);
      shape._baseScale = shapeScale;

      // SB-1: Make shape sprite touch-insensitive so taps pass through to the panel
      shape.eventMode = 'none';

      // 3. Spawn label text below shape
      const label = engine.spawn({
        id: `tile_label_${index}`,
        text: data.label,
        fontSize: Math.max(16, Math.min(26, cellH * 0.12)),
        color: '#ffffff',
        x: cellX,
        y: cellY + cellH * 0.3,
        zIndex: 4
      });

      // SB-1: Make label text touch-insensitive so taps pass through to the panel
      label.eventMode = 'none';

      // Store references
      this.tiles.push({
        panel,
        shape,
        label,
        flashOverlay,
        colorHex: baseColor,
        soundKey: data.sound
      });
    });
  },

  update(engine, deltaTime) {},

  onEvent(engine, eventName, payload) {},

  onResize(engine) {
    if (this.titleLabel) {
      this.titleLabel.x = engine.width / 2;
      this.titleLabel.y = Math.max(25, engine.height * 0.04);
      this.titleLabel.style.fontSize = Math.max(20, Math.min(32, engine.height * 0.05));
    }

    const COLS = 2;
    const ROWS = 3;
    const padding = engine.width * 0.025;
    const titleH = engine.height * 0.08;
    const cellW = (engine.width - padding * (COLS + 1)) / COLS;
    const cellH = (engine.height - titleH - padding * (ROWS + 1)) / ROWS;

    if (this.tiles) {
      this.tiles.forEach((tile, index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);

        const cellX = padding + col * (cellW + padding) + cellW / 2;
        const cellY = titleH + padding + row * (cellH + padding) + cellH / 2;

        if (tile.panel) {
          tile.panel.x = cellX;
          tile.panel.y = cellY;
          
          const bgG = tile.panel.children[0];
          if (bgG) {
            bgG.clear()
              .roundRect(-cellW/2, -cellH/2, cellW, cellH, 18)
              .fill(tile.colorHex)
              .stroke({ color: 0xffffff, width: 3, alpha: 0.3 });
          }
          const flashOverlay = tile.panel.children[1];
          if (flashOverlay) {
            flashOverlay.clear()
              .roundRect(-cellW/2, -cellH/2, cellW, cellH, 18)
              .fill({ color: 0xffffff, alpha: 1 });
          }
        }

        if (tile.shape) {
          tile.shape.x = cellX;
          tile.shape.y = cellY - cellH * 0.08;
          const targetShapeH = cellH * 0.45;
          const shapeScale = targetShapeH / 100;
          tile.shape.scale.set(shapeScale);
          tile.shape._baseScale = shapeScale;
        }

        if (tile.label) {
          tile.label.x = cellX;
          tile.label.y = cellY + cellH * 0.3;
          tile.label.style.fontSize = Math.max(16, Math.min(26, cellH * 0.12));
        }
      });
    }
  },

  _onTileTapped(index, engine) {
    const tile = this.tiles[index];
    if (!tile) return;

    // 1. Play immediate audio
    engine.audio.play(tile.soundKey);

    // 2. Panel flash feedback (SB-4: use overlay flash instead of tint inversion)
    if (tile.flashOverlay) {
      tile.flashOverlay.alpha = 0.7;
      engine.animate(tile.flashOverlay, { alpha: 0 }, 0.15, 'easeOut');
    }

    // Bounce panel scale (SB-3: 1.25x scale bounce)
    if (tile.panel) {
      engine.animate(tile.panel, { scale: 1.25 }, 0.1, 'easeOut')
        .then(() => engine.animate(tile.panel, { scale: 1.0 }, 0.1, 'bounce'));
    }

    // 3. Shape pop micro-animation
    if (tile.shape) {
      const origScale = tile.shape._baseScale;
      engine.animate(tile.shape, { scale: origScale * 1.35 }, 0.1, 'easeOut')
        .then(() => engine.animate(tile.shape, { scale: origScale }, 0.15, 'bounce'));
    }
  },

  preview(miniEngine) {
    this.t = 0;
    this.lastPopIdx = -1;

    // Spawn 6 small colored blocks for preview grid
    this.shapes = [];
    const colors = ['#2196F3', '#F44336', '#4CAF50', '#FFC107', '#E91E63', '#9C27B0'];
    const assets = ['shape_circle', 'shape_square', 'shape_triangle', 'shape_star', 'shape_heart', 'shape_diamond'];

    for (let i = 0; i < 6; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const s = miniEngine.spawn({
        asset: assets[i],
        color: colors[i],
        x: miniEngine.width * (0.28 + col * 0.44),
        y: miniEngine.height * (0.22 + row * 0.28),
        scale: 0.32
      });
      s._baseScale = 0.32;
      this.shapes.push(s);
    }
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    // Every 0.6s, pop a random shape in sequence
    const popIdx = Math.floor(this.t / 0.6) % 6;
    if (popIdx !== this.lastPopIdx) {
      this.lastPopIdx = popIdx;
      const s = this.shapes[popIdx];
      miniEngine.animate(s, { scale: 0.45 }, 0.1, 'easeOut')
        .then(() => miniEngine.animate(s, { scale: 0.32 }, 0.1, 'bounce'));
    }
  }

};
