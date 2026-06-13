// games/digital_coloring.js
// ToyBox Mini-Game: Digital Coloring
// Target age: 2–5 years | Interaction: Drag & Tap (Multi-touch) | Duration: Open-ended

const COLORS = [
  { hex: 0xff3b30, name: 'Red' },
  { hex: 0xff9500, name: 'Orange' },
  { hex: 0xffcc00, name: 'Yellow' },
  { hex: 0x34c759, name: 'Green' },
  { hex: 0x007aff, name: 'Blue' },
  { hex: 0xaf52de, name: 'Purple' },
  { hex: 0xff2d55, name: 'Pink' },
  { hex: 0x1c1c1e, name: 'Black' }
];

const STAMP_ASSETS = [
  { id: 'cat', asset: 'animal_cat', label: '🐱' },
  { id: 'dog', asset: 'animal_dog', label: '🐶' },
  { id: 'cow', asset: 'animal_cow', label: '🐄' },
  { id: 'pig', asset: 'animal_pig', label: '🐷' },
  { id: 'star', asset: 'ui_star', label: '⭐' }
];

export default {

  config: {
    background:      '#ffffff', // Clean white background canvas
    interactionMode: 'drag',    // Drag to draw, also handles tapping
    assets: [
      'animal_cat', 'animal_dog', 'animal_cow', 'animal_pig', 'ui_star',
      'particle_sparkle'
    ],
    audio: ['brush_stroke', 'reveal_whoosh', 'win_jingle'],
  },

  init(engine) {
    this.currentColorHex = COLORS[0].hex; // Default Red
    this.currentTool = 'brush';           // 'brush' | 'eraser' | 'stamp'
    this.selectedStamp = STAMP_ASSETS[0];  // Default Cat stamp
    
    this.brushSize = Math.max(16, engine.width * 0.04);
    this.lastPositions = {}; // Touch ID -> { x, y }
    this.sparkles = [];

    this.isPreviewMode = (engine.app == null) || (engine.width < 250);

    // 1. Solid white background canvas sprite (explicitly spawned to ensure correct zIndex)
    this.bgCanvas = engine.spawn({
      id: 'bg_canvas',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 1
    });
    this.bgCanvasG = new PIXI.Graphics();
    this.bgCanvasG.rect(-engine.width/2, -engine.height/2, engine.width, engine.height).fill(0xffffff);
    this.bgCanvas.addChild(this.bgCanvasG);

    // 2. Create drawing canvas container
    this.canvasContainer = engine.spawn({
      id: 'canvas_container',
      x: 0,
      y: 0,
      zIndex: 2
    });

    if (!this.isPreviewMode) {
      this.canvasTexture = PIXI.RenderTexture.create({
        width: engine.width,
        height: engine.height
      });
      this.canvasSprite = new PIXI.Sprite(this.canvasTexture);
      this.canvasContainer.addChild(this.canvasSprite);

      this.brushGraphics = new PIXI.Graphics();
    }

    // 3. Create Header Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '🎨 Color & Draw anything! 🎨',
      fontSize: 26,
      color: '#4a3728',
      x: engine.width / 2,
      y: 40,
      zIndex: 10
    });
    if (this.promptLabel.style) {
      this.promptLabel.style.stroke = '#ffffff';
      this.promptLabel.style.strokeThickness = 4;
    }

    // 4. Build UI controls
    this._createUI(engine);
  },

  update(engine, deltaTime) {
    if (this.isPreviewMode) return;

    // 1. Handle Multi-touch drawing
    const currentTouches = engine.input.touches || [];
    const activeIds = new Set();

    currentTouches.forEach((touch) => {
      // Toddler safety check: ignore touches that land on the bottom UI area
      if (touch.y > engine.height - 160) {
        return;
      }

      activeIds.add(touch.id);
      const prev = this.lastPositions[touch.id];
      
      if (this.currentTool === 'stamp') {
        // Stamp tool places a stamp once on touch start
        if (!prev) {
          this._placeStamp(touch.x, touch.y, engine);
        }
      } else {
        // Brush/Eraser draws continuous lines
        if (prev) {
          this._drawStroke(prev.x, prev.y, touch.x, touch.y, engine);
        } else {
          this._drawStroke(touch.x, touch.y, touch.x, touch.y, engine);
        }
      }
      this.lastPositions[touch.id] = { x: touch.x, y: touch.y };
    });

    // Remove touches that are no longer active
    for (const id in this.lastPositions) {
      if (!activeIds.has(Number(id))) {
        delete this.lastPositions[id];
      }
    }

    // 2. Move sparkles
    this.sparkles = this.sparkles.filter((p) => {
      p.x += p._vx * deltaTime;
      p.y += p._vy * deltaTime;
      p.alpha -= 2.0 * deltaTime;
      if (p.alpha <= 0) {
        engine.destroy(p);
        return false;
      }
      return true;
    });
  },

  onEvent(engine, eventName, payload) {},

  onResize(engine) {
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
    }

    if (this.bgCanvas) {
      this.bgCanvas.x = engine.width / 2;
      this.bgCanvas.y = engine.height / 2;
      if (this.bgCanvasG) {
        this.bgCanvasG.clear()
          .rect(-engine.width/2, -engine.height/2, engine.width, engine.height)
          .fill(0xffffff);
      }
    }

    // Backup, resize, and restore canvas drawing texture to prevent loss of artwork
    if (!this.isPreviewMode && this.canvasTexture) {
      const backupTexture = PIXI.RenderTexture.create({
        width: this.canvasTexture.width,
        height: this.canvasTexture.height
      });
      
      const backupSprite = new PIXI.Sprite(this.canvasTexture);
      engine.renderToTexture(backupSprite, backupTexture, true);
      backupSprite.destroy();

      this.canvasTexture.resize(engine.width, engine.height);

      const restoreSprite = new PIXI.Sprite(backupTexture);
      engine.renderToTexture(restoreSprite, this.canvasTexture, true);
      restoreSprite.destroy();
      backupTexture.destroy();
    }

    this.brushSize = Math.max(16, engine.width * 0.04);

    this._repositionUI(engine);
  },

  _createUI(engine) {
    this.colorButtons = [];
    this.stampOptionButtons = [];

    // Create a background panel for the bottom toolbar
    this.toolbarBg = engine.spawn({
      id: 'toolbar_bg',
      zIndex: 5
    });
    this.toolbarGraphics = new PIXI.Graphics();
    this.toolbarBg.addChild(this.toolbarGraphics);

    // Create main tool buttons (Brush, Eraser, Stamp, Clear)
    this.btnBrush = engine.spawn({
      id: 'btn_tool_brush',
      zIndex: 6,
      onTouch: () => this._selectTool('brush', engine)
    });
    this.btnBrushGraphics = new PIXI.Graphics();
    this.btnBrush.addChild(this.btnBrushGraphics);

    this.btnEraser = engine.spawn({
      id: 'btn_tool_eraser',
      zIndex: 6,
      onTouch: () => this._selectTool('eraser', engine)
    });
    this.btnEraserGraphics = new PIXI.Graphics();
    this.btnEraser.addChild(this.btnEraserGraphics);

    this.btnStamp = engine.spawn({
      id: 'btn_tool_stamp',
      zIndex: 6,
      onTouch: () => this._selectTool('stamp', engine)
    });
    this.btnStampGraphics = new PIXI.Graphics();
    this.btnStamp.addChild(this.btnStampGraphics);

    this.btnClear = engine.spawn({
      id: 'btn_tool_clear',
      zIndex: 6,
      onTouch: () => this._clearCanvas(engine)
    });
    this.btnClearGraphics = new PIXI.Graphics();
    this.btnClear.addChild(this.btnClearGraphics);

    // Create Color Swatches
    COLORS.forEach((color, i) => {
      const btn = engine.spawn({
        id: `btn_color_${color.name.toLowerCase()}`,
        zIndex: 6,
        onTouch: () => this._selectColor(color.hex, engine)
      });
      const swatchG = new PIXI.Graphics();
      btn.addChild(swatchG);
      btn._swatchG = swatchG;
      btn._colorHex = color.hex;
      this.colorButtons.push(btn);
    });

    // Create Secondary Stamp popup panel (initially hidden)
    this.stampPopupBg = engine.spawn({
      id: 'stamp_popup_bg',
      zIndex: 8
    });
    this.stampPopupGraphics = new PIXI.Graphics();
    this.stampPopupBg.addChild(this.stampPopupGraphics);
    this.stampPopupBg.visible = false;

    STAMP_ASSETS.forEach((stamp, i) => {
      const btn = engine.spawn({
        id: `btn_stamp_opt_${stamp.id}`,
        zIndex: 9,
        onTouch: () => this._selectStamp(stamp, engine)
      });
      const optG = new PIXI.Graphics();
      btn.addChild(optG);
      
      const textLabel = new PIXI.Text({
        text: stamp.label,
        style: new PIXI.TextStyle({ fontSize: 28 })
      });
      textLabel.anchor.set(0.5);
      btn.addChild(textLabel);

      btn._optG = optG;
      btn._stampInfo = stamp;
      this.stampOptionButtons.push(btn);
    });

    // Position everything initially
    this._repositionUI(engine);
    this._updateUIHighlighting();
  },

  _repositionUI(engine) {
    const isMobile = engine.width < 600;
    const barH = isMobile ? 80 : 100;
    const barY = engine.height - barH;

    // Draw main toolbar background
    this.toolbarGraphics.clear();
    this.toolbarGraphics.rect(0, 0, engine.width, barH).fill(0xf4ebe1).stroke({ color: 0xdfd5c6, width: 4 });
    this.toolbarBg.x = 0;
    this.toolbarBg.y = barY;

    // Position tool buttons
    const btnSize = isMobile ? 48 : 64;
    const margin = isMobile ? 12 : 24;

    this.btnBrush.x = margin + btnSize / 2;
    this.btnBrush.y = barY + barH / 2;
    this.btnBrushGraphics.clear()
      .roundRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 12)
      .fill(0xffffff)
      .stroke({ color: 0x4a3728, width: 3 });
    // draw a simple brush stroke preview inside
    this.btnBrushGraphics.circle(0, 0, btnSize * 0.2).fill(0xe94560);

    this.btnEraser.x = margin + btnSize * 1.5 + 8;
    this.btnEraser.y = barY + barH / 2;
    this.btnEraserGraphics.clear()
      .roundRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 12)
      .fill(0xffffff)
      .stroke({ color: 0x4a3728, width: 3 });
    // draw a pink rectangle inside for eraser representation
    this.btnEraserGraphics.roundRect(-btnSize * 0.25, -btnSize * 0.15, btnSize * 0.5, btnSize * 0.3, 4).fill(0xff2d55);

    this.btnStamp.x = margin + btnSize * 2.5 + 16;
    this.btnStamp.y = barY + barH / 2;
    this.btnStampGraphics.clear()
      .roundRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 12)
      .fill(0xffffff)
      .stroke({ color: 0x4a3728, width: 3 });
    // draw a little star shape inside
    this.btnStampGraphics.circle(0, 0, btnSize * 0.22).fill(0xffcc00);

    this.btnClear.x = engine.width - margin - btnSize / 2;
    this.btnClear.y = barY + barH / 2;
    this.btnClearGraphics.clear()
      .roundRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 12)
      .fill(0xffe5e5)
      .stroke({ color: 0xd32f2f, width: 3 });
    // draw a trash icon (red cross)
    this.btnClearGraphics.rect(-2, -12, 4, 24).fill(0xd32f2f);
    this.btnClearGraphics.rect(-12, -2, 24, 4).fill(0xd32f2f);
    this.btnClearGraphics.rotation = Math.PI / 4;

    // Position color swatches
    const leftBound = this.btnStamp.x + btnSize / 2 + (isMobile ? 12 : 24);
    const rightBound = this.btnClear.x - btnSize / 2 - (isMobile ? 12 : 24);
    const swatchAreaW = rightBound - leftBound;
    const swatchSpacing = swatchAreaW / (COLORS.length - 1);
    const swatchR = isMobile ? 14 : 22;

    this.colorButtons.forEach((btn, i) => {
      btn.x = leftBound + i * swatchSpacing;
      btn.y = barY + barH / 2;
      
      btn._swatchG.clear()
        .circle(0, 0, swatchR)
        .fill(btn._colorHex)
        .stroke({ color: 0xffffff, width: 3 });
    });

    // Position secondary stamp selection popup
    const popupH = isMobile ? 60 : 80;
    const popupY = barY - popupH - 10;
    const popupW = Math.min(360, engine.width * 0.85);

    this.stampPopupBg.x = engine.width / 2 - popupW / 2;
    this.stampPopupBg.y = popupY;
    this.stampPopupGraphics.clear()
      .roundRect(0, 0, popupW, popupH, 16)
      .fill(0xffffff)
      .stroke({ color: 0x4a3728, width: 3 });

    const optSpacing = popupW / (STAMP_ASSETS.length + 1);
    this.stampOptionButtons.forEach((btn, i) => {
      btn.x = this.stampPopupBg.x + optSpacing * (i + 1);
      btn.y = popupY + popupH / 2;

      btn._optG.clear()
        .roundRect(-24, -24, 48, 48, 8)
        .fill(0xf4f4f4)
        .stroke({ color: 0xcccccc, width: 2 });
    });
  },

  _updateUIHighlighting() {
    // Highlight active tool button by slightly scaling it up and adding thick outline
    const isMobile = this.promptLabel.style.fontSize < 24;
    const btnSize = isMobile ? 48 : 64;

    this.btnBrush.scale.set(this.currentTool === 'brush' ? 1.15 : 1.0);
    this.btnEraser.scale.set(this.currentTool === 'eraser' ? 1.15 : 1.0);
    this.btnStamp.scale.set(this.currentTool === 'stamp' ? 1.15 : 1.0);

    // Outline active swatch
    this.colorButtons.forEach((btn) => {
      const swatchR = isMobile ? 14 : 22;
      const isActive = (btn._colorHex === this.currentColorHex) && (this.currentTool !== 'eraser');
      btn._swatchG.clear()
        .circle(0, 0, swatchR)
        .fill(btn._colorHex)
        .stroke({ color: isActive ? 0x000000 : 0xffffff, width: isActive ? 4 : 2.5 });
      btn.scale.set(isActive ? 1.18 : 1.0);
    });

    // Show/hide stamp selection popup
    this.stampPopupBg.visible = (this.currentTool === 'stamp');
    this.stampOptionButtons.forEach(btn => btn.visible = (this.currentTool === 'stamp'));

    // Highlight active stamp selection option
    if (this.currentTool === 'stamp') {
      this.stampOptionButtons.forEach((btn) => {
        const isActive = (btn._stampInfo.id === this.selectedStamp.id);
        btn._optG.clear()
          .roundRect(-24, -24, 48, 48, 8)
          .fill(isActive ? 0xffcc00 : 0xf4f4f4)
          .stroke({ color: isActive ? 0x4a3728 : 0xcccccc, width: 3 });
        btn.scale.set(isActive ? 1.15 : 1.0);
      });
    }
  },

  _selectTool(tool, engine) {
    this.currentTool = tool;
    engine.audio.play('brush_stroke', { volume: 0.5 });
    
    // Scale bounce on click
    const btn = tool === 'brush' ? this.btnBrush : (tool === 'eraser' ? this.btnEraser : this.btnStamp);
    engine.animate(btn, { scale: 1.35 }, 0.1, 'easeOut')
      .then(() => this._updateUIHighlighting());
  },

  _selectColor(colorHex, engine) {
    this.currentColorHex = colorHex;
    // Auto switch back to brush if stamp or eraser was active but they select a color
    if (this.currentTool === 'eraser') {
      this.currentTool = 'brush';
    }
    engine.audio.play('brush_stroke', { volume: 0.5 });
    this._updateUIHighlighting();
  },

  _selectStamp(stamp, engine) {
    this.selectedStamp = stamp;
    engine.audio.play('brush_stroke', { volume: 0.5 });
    this._updateUIHighlighting();
  },

  _drawStroke(x1, y1, x2, y2, engine) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Interpolate points for solid round stroke coverage
    const steps = Math.ceil(dist / Math.max(2, this.brushSize * 0.15));
    
    this.brushGraphics.clear();
    
    if (this.currentTool === 'eraser') {
      this.brushGraphics.blendMode = 'erase';
    } else {
      this.brushGraphics.blendMode = 'normal';
    }

    const fillConfig = { color: this.currentTool === 'eraser' ? 0xffffff : this.currentColorHex };

    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      this.brushGraphics.circle(cx, cy, this.brushSize / 2).fill(fillConfig);
    }

    engine.renderToTexture(this.brushGraphics, this.canvasTexture, false);
  },

  _placeStamp(x, y, engine) {
    const stampSprite = new PIXI.Sprite(PIXI.Assets.get(this.selectedStamp.asset));
    stampSprite.anchor.set(0.5);
    stampSprite.x = x;
    stampSprite.y = y;
    stampSprite.scale.set(0.95);
    
    // Draw directly onto the texture
    engine.renderToTexture(stampSprite, this.canvasTexture, false);
    stampSprite.destroy();

    // Play pleasant discovery stamp sound
    engine.audio.play('brush_stroke');

    // Spawn tiny sparkles at stamp location
    this._burstSparkles(x, y, engine);
  },

  _clearCanvas(engine) {
    engine.audio.play('reveal_whoosh');

    // Clear graphics texture
    const emptyG = new PIXI.Graphics();
    engine.renderToTexture(emptyG, this.canvasTexture, true);
    emptyG.destroy();

    // Bounce trash button
    engine.animate(this.btnClear, { scale: 0.8 }, 0.08, 'easeOut')
      .then(() => engine.animate(this.btnClear, { scale: 1.0 }, 0.1, 'bounce'));
  },

  _burstSparkles(x, y, engine) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const s = engine.spawn({
        id: `sparkle_${Date.now()}_${Math.random()}`,
        asset: 'particle_sparkle',
        x, y,
        scale: 0.3 + Math.random() * 0.3,
        zIndex: 10
      });
      s._vx = Math.cos(angle) * speed;
      s._vy = Math.sin(angle) * speed;
      this.sparkles.push(s);
    }
  },

  preview(miniEngine) {
    this.t = 0;
    // Spawn simple colorful preview graphics
    this.prevG = new PIXI.Graphics();
    this.prevG.rect(0, 0, miniEngine.width, miniEngine.height).fill(0xffffff);
    this.prevG.circle(miniEngine.width/2, miniEngine.height/2, 40).fill(0x34c759);
    this.prevG.circle(miniEngine.width/2 - 50, miniEngine.height/2 - 20, 30).fill(0xff3b30);
    this.prevG.circle(miniEngine.width/2 + 50, miniEngine.height/2 + 20, 25).fill(0x007aff);
    
    const sprite = new PIXI.Sprite(miniEngine.app.renderer.generateTexture(this.prevG));
    miniEngine.app.stage.addChild(sprite);
  },

  previewUpdate(miniEngine, dt) {}

};
