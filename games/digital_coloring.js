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

export default {

  config: {
    background:      '#ffffff', // Clean white background canvas
    interactionMode: 'drag',    // Drag to draw, supports multi-touch
    assets: [],                 // Zero external assets for instant loading
    audio: [],                  // No sound at all to prevent audio context blockages
  },

  init(engine) {
    this.engine = engine;
    this.currentColorHex = COLORS[0].hex; // Default Red
    this.currentTool = 'brush';           // 'brush' | 'eraser'
    
    this.brushSize = Math.max(16, engine.width * 0.04);
    this.lastPositions = {}; // Touch ID -> { x, y }
    this.touchColors = {};   // Touch ID -> hex color
    this.touchTools = {};    // Touch ID -> 'brush' | 'eraser'

    this.isPreviewMode = (engine.app == null) || (engine.width < 250);
    this.isMobile = engine.width < 600;

    // 1. Solid white background canvas sprite
    this.bgCanvas = engine.spawn({
      id: 'bg_canvas',
      x: engine.width / 2,
      y: engine.height / 2,
      zIndex: 1
    });
    this.bgCanvasG = new PIXI.Graphics();
    this.bgCanvasG.rect(-engine.width/2, -engine.height/2, engine.width, engine.height).fill(0xffffff);
    this.bgCanvas.addChild(this.bgCanvasG);

    // 2. Create drawing canvas container and RenderTexture
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

      // Initialize canvas texture as solid white
      const bgRect = new PIXI.Graphics();
      bgRect.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(bgRect, this.canvasTexture, true);
      bgRect.destroy();
    }

    // 3. Create Header Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: '🎨 Free Paint! 🎨',
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
    // Drawing is now fully event-driven inside onEvent, so update is a no-op!
  },

  onEvent(engine, eventName, payload) {
    if (this.isPreviewMode || !this.canvasTexture) return;

    const barH = this.isMobile ? 120 : 160;
    const barY = engine.height - barH / 2;
    const topOfUI = barY - barH / 2;

    if (eventName === 'drag_start' || eventName === 'touch_down') {
      const { x, y, id } = payload;
      // Ignore drawing touches that land inside the bottom UI box
      if (y > topOfUI) return;

      this.touchColors[id] = this.currentTool === 'eraser' ? 0xffffff : this.currentColorHex;
      this.touchTools[id] = this.currentTool;
      this.lastPositions[id] = { x, y };

      // Draw initial touch dot
      const width = this.touchTools[id] === 'eraser' ? this.brushSize * 2.5 : this.brushSize;
      this.brushGraphics.clear()
        .circle(x, y, width / 2)
        .fill(this.touchTools[id] === 'eraser' ? 0xffffff : this.touchColors[id]);

      engine.renderToTexture(this.brushGraphics, this.canvasTexture, false);
    } else if (eventName === 'touch_move') {
      const { x, y, id } = payload;
      if (!this.lastPositions[id]) return;

      // If dragged into the UI box, cancel drawing for this pointer
      if (y > topOfUI) {
        delete this.lastPositions[id];
        return;
      }

      const prev = this.lastPositions[id];
      const color = this.touchColors[id];
      const tool = this.touchTools[id];
      const width = tool === 'eraser' ? this.brushSize * 2.5 : this.brushSize;

      this.brushGraphics.clear();
      this.brushGraphics.moveTo(prev.x, prev.y)
        .lineTo(x, y)
        .stroke({
          color: tool === 'eraser' ? 0xffffff : color,
          width: width,
          cap: 'round',
          join: 'round'
        });

      engine.renderToTexture(this.brushGraphics, this.canvasTexture, false);
      this.lastPositions[id] = { x, y };
    } else if (eventName === 'drag_end' || eventName === 'touch_up') {
      const { id } = payload;
      delete this.lastPositions[id];
      delete this.touchColors[id];
      delete this.touchTools[id];
    }
  },

  onResize(engine) {
    this.isMobile = engine.width < 600;

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

    this.brushSize = Math.max(16, engine.width * 0.04);

    // Backup, resize, and restore canvas drawing texture to prevent loss of artwork
    if (!this.isPreviewMode && this.canvasTexture) {
      const oldW = this.canvasTexture.width;
      const oldH = this.canvasTexture.height;
      const backupTexture = PIXI.RenderTexture.create({
        width: oldW,
        height: oldH
      });

      const backupSprite = new PIXI.Sprite(this.canvasTexture);
      engine.renderToTexture(backupSprite, backupTexture, true);
      backupSprite.destroy();

      this.canvasTexture.resize(engine.width, engine.height);

      const bgRect = new PIXI.Graphics();
      bgRect.rect(0, 0, engine.width, engine.height).fill(0xffffff);
      engine.renderToTexture(bgRect, this.canvasTexture, true);
      bgRect.destroy();

      const restoreSprite = new PIXI.Sprite(backupTexture);
      engine.renderToTexture(restoreSprite, this.canvasTexture, false);
      restoreSprite.destroy();

      backupTexture.destroy(true);
    }

    this._repositionUI(engine);
  },

  _createUI(engine) {
    this.colorButtons = [];

    // Bottom toolbar background panel
    this.toolbarBg = engine.spawn({
      id: 'toolbar_bg',
      zIndex: 5
    });
    this.toolbarGraphics = new PIXI.Graphics();
    this.toolbarBg.addChild(this.toolbarGraphics);

    // Large main tool buttons (Brush, Eraser, Clear)
    this.btnBrush = engine.spawn({
      id: 'btn_tool_brush',
      zIndex: 6
    });
    this.btnBrushGraphics = new PIXI.Graphics();
    this.btnBrush.addChild(this.btnBrushGraphics);
    this.btnBrush.eventMode = 'static';
    this.btnBrush.on('pointerdown', (e) => {
      e.stopPropagation();
      this._selectTool('brush');
    });

    this.btnEraser = engine.spawn({
      id: 'btn_tool_eraser',
      zIndex: 6
    });
    this.btnEraserGraphics = new PIXI.Graphics();
    this.btnEraser.addChild(this.btnEraserGraphics);
    this.btnEraser.eventMode = 'static';
    this.btnEraser.on('pointerdown', (e) => {
      e.stopPropagation();
      this._selectTool('eraser');
    });

    this.btnClear = engine.spawn({
      id: 'btn_tool_clear',
      zIndex: 6
    });
    this.btnClearGraphics = new PIXI.Graphics();
    this.btnClear.addChild(this.btnClearGraphics);
    this.btnClear.eventMode = 'static';
    this.btnClear.on('pointerdown', (e) => {
      e.stopPropagation();
      this._clearCanvas();
    });

    // Create Color Swatches
    COLORS.forEach((color, i) => {
      const btn = engine.spawn({
        id: `btn_color_${color.name.toLowerCase()}`,
        zIndex: 6
      });
      const swatchG = new PIXI.Graphics();
      btn.addChild(swatchG);
      btn._swatchG = swatchG;
      btn._colorHex = color.hex;
      
      btn.eventMode = 'static';
      btn.on('pointerdown', (e) => {
        e.stopPropagation();
        this._selectColor(color.hex);
      });
      
      this.colorButtons.push(btn);
    });

    this._repositionUI(engine);
    this._updateUIHighlighting();
  },

  _repositionUI(engine) {
    const barH = this.isMobile ? 120 : 160;
    const barY = engine.height - barH / 2;
    const uiBoxW = engine.width;

    // Position of toolbar background container (centered horizontally)
    this.toolbarBg.x = engine.width / 2;
    this.toolbarBg.y = barY;

    // Draw main toolbar background box to fill the whole width (dock style)
    this.toolbarGraphics.clear();
    // Drop shadow
    this.toolbarGraphics.rect(-uiBoxW / 2, -barH / 2, uiBoxW, barH)
                         .fill({ color: 0x000000, alpha: 0.1 });
    // Warm soft pastel beige background
    this.toolbarGraphics.rect(-uiBoxW / 2, -barH / 2, uiBoxW, barH)
                         .fill(0xf5ebe0);
    // Nice light wood-like top border line
    this.toolbarGraphics.rect(-uiBoxW / 2, -barH / 2, uiBoxW, 4)
                         .fill(0xd7ccc8);

    // Spacing and sizing calculations for toddler usability
    this.swatchR = this.isMobile ? 22 : 30;
    const swatchR = this.swatchR;
    const toolW = this.isMobile ? 100 : 150;
    const toolH = this.isMobile ? 42 : 58;

    // Row 1 Y (Colors) centered inside the UI box, leaving tight padding
    const row1Y = barY - barH * 0.22;
    const swatchSpacing = Math.min(swatchR * 2.6, (uiBoxW - swatchR * 3) / (COLORS.length - 1 || 1));
    const swatchesStartX = engine.width / 2 - ((COLORS.length - 1) * swatchSpacing) / 2;

    this.colorButtons.forEach((btn, i) => {
      btn.x = swatchesStartX + i * swatchSpacing;
      btn.y = row1Y;
      btn._swatchG.clear()
        .circle(0, 0, swatchR)
        .fill(btn._colorHex)
        .stroke({ color: 0xffffff, width: 3 });
      
      btn.hitArea = new PIXI.Circle(0, 0, swatchR * 1.4);
    });

    // Row 2 Y (Tools) centered inside the UI box, leaving tight padding
    const row2Y = barY + barH * 0.22;
    const numTools = 3;
    const toolSpacing = Math.min(toolW * 1.25, (uiBoxW - toolW * 1.5) / 2);
    const toolsStartX = engine.width / 2 - (2 * toolSpacing) / 2;

    this.btnBrush.x = toolsStartX + 0 * toolSpacing;
    this.btnBrush.y = row2Y;
    this.btnBrushGraphics.clear()
      .roundRect(-toolW/2, -toolH/2, toolW, toolH, 12)
      .fill(0xffffff)
      .stroke({ color: 0x8d6e63, width: 3 });
    this.btnBrush.hitArea = new PIXI.Rectangle(-toolW/2, -toolH/2, toolW, toolH);

    // Text label
    if (this.btnBrushText) this.btnBrush.removeChild(this.btnBrushText);
    this.btnBrushText = new PIXI.Text({
      text: '🖌 Paint',
      style: new PIXI.TextStyle({ fontSize: this.isMobile ? 14 : 20, fill: '#4a3728', fontWeight: 'bold' })
    });
    this.btnBrushText.anchor.set(0.5);
    this.btnBrush.addChild(this.btnBrushText);

    this.btnEraser.x = toolsStartX + 1 * toolSpacing;
    this.btnEraser.y = row2Y;
    this.btnEraserGraphics.clear()
      .roundRect(-toolW/2, -toolH/2, toolW, toolH, 12)
      .fill(0xffffff)
      .stroke({ color: 0x8d6e63, width: 3 });
    this.btnEraser.hitArea = new PIXI.Rectangle(-toolW/2, -toolH/2, toolW, toolH);

    // Text label
    if (this.btnEraserText) this.btnEraser.removeChild(this.btnEraserText);
    this.btnEraserText = new PIXI.Text({
      text: '🧽 Eraser',
      style: new PIXI.TextStyle({ fontSize: this.isMobile ? 14 : 20, fill: '#4a3728', fontWeight: 'bold' })
    });
    this.btnEraserText.anchor.set(0.5);
    this.btnEraser.addChild(this.btnEraserText);

    this.btnClear.x = toolsStartX + 2 * toolSpacing;
    this.btnClear.y = row2Y;
    this.btnClearGraphics.clear()
      .roundRect(-toolW/2, -toolH/2, toolW, toolH, 12)
      .fill(0xffe5e5)
      .stroke({ color: 0xd32f2f, width: 3 });
    this.btnClear.hitArea = new PIXI.Rectangle(-toolW/2, -toolH/2, toolW, toolH);

    // Text label
    if (this.btnClearText) this.btnClear.removeChild(this.btnClearText);
    this.btnClearText = new PIXI.Text({
      text: '🗑 Clear',
      style: new PIXI.TextStyle({ fontSize: this.isMobile ? 14 : 20, fill: '#d32f2f', fontWeight: 'bold' })
    });
    this.btnClearText.anchor.set(0.5);
    this.btnClear.addChild(this.btnClearText);
  },

  _updateUIHighlighting() {
    const swatchR = this.swatchR || (this.isMobile ? 24 : 32);

    this.btnBrush.scale.set(this.currentTool === 'brush' ? 1.12 : 1.0);
    this.btnEraser.scale.set(this.currentTool === 'eraser' ? 1.12 : 1.0);

    // Outline active swatch
    this.colorButtons.forEach((btn) => {
      const isActive = (btn._colorHex === this.currentColorHex) && (this.currentTool !== 'eraser');
      btn._swatchG.clear()
        .circle(0, 0, swatchR)
        .fill(btn._colorHex)
        .stroke({ color: isActive ? 0x2e1c0c : 0xffffff, width: isActive ? 5 : 3 });
      btn.scale.set(isActive ? 1.15 : 1.0);
    });
  },

  _selectTool(tool) {
    this.currentTool = tool;
    this._updateUIHighlighting();
    const btn = tool === 'brush' ? this.btnBrush : this.btnEraser;
    this.engine.animate(btn, { scale: 1.25 }, 0.08, 'easeOut')
      .then(() => this.engine.animate(btn, { scale: 1.12 }, 0.08, 'bounce'));
  },

  _selectColor(colorHex) {
    this.currentColorHex = colorHex;
    if (this.currentTool === 'eraser') {
      this.currentTool = 'brush';
    }
    this._updateUIHighlighting();
    
    const btn = this.colorButtons.find(b => b._colorHex === colorHex);
    if (btn) {
      this.engine.animate(btn, { scale: 1.3 }, 0.08, 'easeOut')
        .then(() => this.engine.animate(btn, { scale: 1.15 }, 0.08, 'bounce'));
    }
  },

  _clearCanvas() {
    if (this.canvasTexture) {
      const emptyG = new PIXI.Graphics();
      this.engine.renderToTexture(emptyG, this.canvasTexture, true);
      emptyG.destroy();
    }
    // Bounce clear button safely
    this.engine.animate(this.btnClear, { scale: 0.9 }, 0.08, 'easeOut')
      .then(() => this.engine.animate(this.btnClear, { scale: 1.0 }, 0.08, 'bounce'));
  },

  preview(miniEngine) {
    this.t = 0;
    this.previewBalls = [];

    const colors = ['#ff3b30', '#ffcc00', '#34c759', '#007aff'];
    const positions = [
      { x: miniEngine.width * 0.3, y: miniEngine.height * 0.4 },
      { x: miniEngine.width * 0.5, y: miniEngine.height * 0.6 },
      { x: miniEngine.width * 0.7, y: miniEngine.height * 0.35 },
      { x: miniEngine.width * 0.45, y: miniEngine.height * 0.3 }
    ];

    colors.forEach((color, i) => {
      const ball = miniEngine.spawn({
        asset: 'ball',
        color: color,
        x: positions[i].x,
        y: positions[i].y,
        scale: 0.1
      });
      this.previewBalls.push(ball);
      miniEngine.animate(ball, { scale: 1.4 }, 0.4 + i * 0.2, 'easeOut');
    });
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;
    this.previewBalls.forEach((ball, i) => {
      const angle = this.t * 1.5 + i * Math.PI / 2;
      ball.x += Math.cos(angle) * 0.15;
      ball.y += Math.sin(angle) * 0.15;
    });
  }

};
