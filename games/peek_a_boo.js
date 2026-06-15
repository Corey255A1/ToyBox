// games/peek_a_boo.js
// ToyBox Mini-Game: Peek-a-Boo
// Target age: 1–4 years | Interaction: Tap | Duration: ~2 min

const ANIMAL_LIST = [
  { name: 'Cow! 🐄', asset: 'animal_cow', sound: 'sound_moo' },
  { name: 'Duck! 🦆', asset: 'animal_duck', sound: 'sound_quack' },
  { name: 'Frog! 🐸', asset: 'animal_frog', sound: 'sound_ribbit' },
  { name: 'Pig! 🐷', asset: 'animal_pig', sound: 'sound_oink' },
  { name: 'Cat! 🐱', asset: 'animal_cat', sound: 'sound_meow' },
  { name: 'Dog! 🐶', asset: 'animal_dog', sound: 'sound_woof' },
  { name: 'Elephant! 🐘', asset: 'animal_elephant', sound: 'sound_trumpet' },
  { name: 'Lion! 🦁', asset: 'animal_lion', sound: 'sound_roar' }
];

export default {

  config: {
    background:      '#fce4ec',
    interactionMode: 'tap',
    assets: [
      'door_closed', 'door_frame',
      'animal_cow', 'animal_duck', 'animal_frog', 'animal_pig',
      'animal_cat', 'animal_dog', 'animal_elephant', 'animal_lion',
      'ui_dot_empty', 'ui_dot_filled'
    ],
    audio: [
      'door_creak_open', 'door_close', 'door_knock', 'sound_boing',
      'sound_moo', 'sound_quack', 'sound_ribbit', 'sound_oink',
      'sound_meow', 'sound_woof', 'sound_trumpet', 'sound_roar',
      'win_jingle'
    ],
  },

  init(engine) {
    if (this.bgGraphic) engine.destroy(this.bgGraphic);

    this.doorAngle = 0;
    this.angularVelocity = 0;
    this.doorState = 'CLOSED'; // 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING'
    this.openTimer = 0;
    this.animalBobTime = 0;
    
    // Setup animal queue
    this.animalQueue = [...ANIMAL_LIST].sort(() => Math.random() - 0.5);
    this.currentAnimalIdx = 0;
    this.revealedThisCycle = 0;
 
    // Dimensions
    this.doorH = Math.min(300, Math.min(engine.height * 0.45, engine.width * 0.52));
    this.doorW = this.doorH / 1.5;
 
    // Header Prompt
    this.promptLabel = engine.spawn({
      id: 'prompt_label',
      text: 'Who is there?',
      fontSize: 36,
      color: '#880e4f',
      x: engine.width / 2,
      y: Math.max(30, engine.height * 0.08),
      zIndex: 10
    });
    if (this.promptLabel.style) {
      this.promptLabel.style.fontWeight = 'bold';
    }
 
    // Spawn Animal Sprite first (behind the door)
    this.animalBaseY = engine.height / 2;
    this.animalSprite = engine.spawn({
      id: 'animal_sprite',
      asset: this.animalQueue[this.currentAnimalIdx].asset,
      x: engine.width / 2,
      y: this.animalBaseY,
      scale: 1.0,
      zIndex: 2
    });
    this.animalSprite.alpha = 0;
    
    // Scale animal to fill ~60% of canvas height (PAB-2)
    const targetAnimalHeight = engine.height * 0.6;
    const animScale = targetAnimalHeight / 112; // Base animal asset is roughly 112px
    this.animalSprite.scale.set(animScale);
 
    // Spawn static door frame
    this.frameSprite = engine.spawn({
      id: 'door_frame',
      asset: 'door_frame',
      x: engine.width / 2,
      y: engine.height / 2,
      scale: 1.0,
      zIndex: 1
    });
    this.frameSprite.width = this.doorW + 16;
    this.frameSprite.height = this.doorH + 16;
 
    // Spawn rotating door (Pivot set to left edge: anchor = [0, 0.5])
    this.doorSprite = engine.spawn({
      id: 'door_sprite',
      asset: 'door_closed',
      x: engine.width / 2 - this.doorW / 2, // Left edge of door at center - width/2
      y: engine.height / 2,
      scale: 1.0,
      onTouch: (self) => this._onDoorTapped(engine),
      zIndex: 3
    });
    if (this.doorSprite.anchor) {
      this.doorSprite.anchor.set(0, 0.5);
    }
    this.doorSprite.width = this.doorW;
    this.doorSprite.height = this.doorH;
 
    // Giant toddler-forgiving tap hitarea covering the door frame
    const hitPadding = 40;
    this.doorSprite.hitArea = new PIXI.Rectangle(
      -hitPadding,
      -this.doorH / 2 - hitPadding,
      this.doorW + hitPadding * 2,
      this.doorH + hitPadding * 2
    );
 
    // Spawn tap hint label
    this.hintLabel = engine.spawn({
      id: 'hint_label',
      text: '👆 Tap the Door!',
      fontSize: 22,
      color: '#ad1457',
      x: engine.width / 2,
      y: engine.height / 2 + this.doorH / 2 + Math.max(15, engine.height * 0.05),
      zIndex: 10
    });
    if (this.hintLabel.style) {
      this.hintLabel.style.fontWeight = 'bold';
    }
 
    // Create progress dots at bottom
    this.progressDots = [];
    const dotSpacing = 30;
    const startDotX = engine.width / 2 - (ANIMAL_LIST.length - 1) * dotSpacing / 2;
    for (let i = 0; i < ANIMAL_LIST.length; i++) {
      const dot = engine.spawn({
        id: `dot_${i}`,
        asset: 'ui_dot_empty',
        x: startDotX + i * dotSpacing,
        y: engine.height - Math.max(25, engine.height * 0.06),
        scale: 0.8,
        zIndex: 10
      });
      this.progressDots.push(dot);
    }
 
    // Spawn background graphic node (zIndex 0)
    this.bgGraphic = engine.spawn({
      id: 'pab_bg',
      x: 0,
      y: 0,
      zIndex: 0
    });
    this.bgGraphicsDraw = new PIXI.Graphics();
    this.bgGraphic.addChild(this.bgGraphicsDraw);
    this._drawBackground(engine);

    this.nameLabelBig = null;
  },

  _drawBackground(engine) {
    if (!this.bgGraphicsDraw) return;
    this.bgGraphicsDraw.clear();
    
    // Cozy room wall wallpaper gradient (light pink to soft blue-indigo)
    const steps = 12;
    const stepH = engine.height / steps;
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      const r = Math.floor(0xfc - (0xfc - 0xe8) * ratio);
      const g = Math.floor(0xe4 + (0xea - 0xe4) * ratio);
      const b = Math.floor(0xec + (0xf6 - 0xec) * ratio);
      const hexColor = (r << 16) | (g << 8) | b;
      this.bgGraphicsDraw.rect(0, i * stepH, engine.width, stepH + 1).fill(hexColor);
    }
    
    // Vertical striped wallpaper pattern
    const numLines = 16;
    const lineSpacing = engine.width / numLines;
    for (let i = 0; i <= numLines; i++) {
      this.bgGraphicsDraw.rect(i * lineSpacing, 0, 2, engine.height).fill({ color: 0xffffff, alpha: 0.15 });
    }

    // Cozy brown baseboard & floor at the bottom
    const floorH = Math.max(60, engine.height * 0.18);
    this.bgGraphicsDraw.rect(0, engine.height - floorH, engine.width, floorH).fill(0x8d6e63); // warm wood floor
    this.bgGraphicsDraw.rect(0, engine.height - floorH, engine.width, 12).fill(0x6d4c41); // baseboard line
  },
 
  update(engine, deltaTime) {
    // 1. Spring physics for door rotation (Euler spring integration for bouncy snaps)
    const targetAngle = (this.doorState === 'OPEN' || this.doorState === 'OPENING') ? -Math.PI * 0.75 : 0;
    const stiffness = 160.0;
    const damping = 9.0;
 
    const acceleration = (targetAngle - this.doorAngle) * stiffness - this.angularVelocity * damping;
    this.angularVelocity += acceleration * deltaTime;
    this.doorAngle += this.angularVelocity * deltaTime;
    this.doorSprite.rotation = this.doorAngle;
 
    // 2. Door state machine
    if (this.doorState === 'OPENING') {
      // Transition to OPEN when close enough
      if (Math.abs(this.doorAngle - targetAngle) < 0.05 && Math.abs(this.angularVelocity) < 0.25) {
        this.doorState = 'OPEN';
        this.openTimer = 2.5; // Stay open for 2.5 seconds
 
        // Play animal sound when fully opened
        const animal = this.animalQueue[this.currentAnimalIdx];
        engine.audio.play(animal.sound);
 
        // Bounce animal scale on reveal
        const targetAnimalHeight = engine.height * 0.6;
        const animScale = targetAnimalHeight / 112;
        engine.animate(this.animalSprite, { scale: animScale * 1.25 }, 0.2, 'easeOut')
          .then(() => engine.animate(this.animalSprite, { scale: animScale }, 0.15, 'bounce'));
      }
    } else if (this.doorState === 'OPEN') {
      // bob the animal (PAB-4: sin(time * 4) * 8)
      this.animalBobTime += deltaTime;
      this.animalSprite.y = this.animalBaseY + Math.sin(this.animalBobTime * 4) * 8;
 
      // Count down timer
      this.openTimer -= deltaTime;
      if (this.openTimer <= 0) {
        this.doorState = 'CLOSING';
        engine.audio.play('door_close');
        
        // Destroy large label when door closes (PAB-3)
        if (this.nameLabelBig) {
          engine.destroy(this.nameLabelBig);
          this.nameLabelBig = null;
        }
      }
    } else if (this.doorState === 'CLOSING') {
      // Transition to CLOSED when door is back in place
      if (Math.abs(this.doorAngle) < 0.05 && Math.abs(this.angularVelocity) < 0.25) {
        this.doorAngle = 0;
        this.doorSprite.rotation = 0;
        this.doorState = 'CLOSED';
 
        // Prepare next animal
        this._nextAnimal(engine);
      }
    }
 
    // 3. Animal alpha fade based on door rotation
    const openFraction = Math.min(1, Math.abs(this.doorAngle) / (Math.PI * 0.75));
    this.animalSprite.alpha = openFraction;
  },
 
  onEvent(engine, eventName, payload) {},
 
  onResize(engine) {
    this.doorH = Math.min(300, Math.min(engine.height * 0.45, engine.width * 0.52));
    this.doorW = this.doorH / 1.5;
    this.animalBaseY = engine.height / 2;
 
    if (this.promptLabel) {
      this.promptLabel.x = engine.width / 2;
      this.promptLabel.y = Math.max(30, engine.height * 0.08);
    }
 
    if (this.bgGraphic) {
      this._drawBackground(engine);
    }

    if (this.animalSprite) {
      this.animalSprite.x = engine.width / 2;
      this.animalSprite.y = this.animalBaseY;
      const targetAnimalHeight = engine.height * 0.6;
      const animScale = targetAnimalHeight / 112;
      this.animalSprite.scale.set(animScale);
    }
 
    if (this.frameSprite) {
      this.frameSprite.x = engine.width / 2;
      this.frameSprite.y = engine.height / 2;
      this.frameSprite.width = this.doorW + 16;
      this.frameSprite.height = this.doorH + 16;
    }
 
    if (this.doorSprite) {
      this.doorSprite.x = engine.width / 2 - this.doorW / 2;
      this.doorSprite.y = engine.height / 2;
      this.doorSprite.width = this.doorW;
      this.doorSprite.height = this.doorH;
      const hitPadding = 40;
      this.doorSprite.hitArea = new PIXI.Rectangle(
        -hitPadding,
        -this.doorH / 2 - hitPadding,
        this.doorW + hitPadding * 2,
        this.doorH + hitPadding * 2
      );
    }
 
    if (this.hintLabel) {
      this.hintLabel.x = engine.width / 2;
      this.hintLabel.y = engine.height / 2 + this.doorH / 2 + Math.max(15, engine.height * 0.05);
    }
 
    if (this.nameLabelBig) {
      this.nameLabelBig.x = engine.width / 2;
      this.nameLabelBig.y = engine.height * 0.82;
      this.nameLabelBig.style.fontSize = Math.max(48, engine.height * 0.1);
    }
 
    if (this.progressDots) {
      const dotSpacing = 30;
      const startDotX = engine.width / 2 - (ANIMAL_LIST.length - 1) * dotSpacing / 2;
      this.progressDots.forEach((dot, i) => {
        dot.x = startDotX + i * dotSpacing;
        dot.y = engine.height - Math.max(25, engine.height * 0.06);
      });
    }
  },

  _onDoorTapped(engine) {
    // PAB-1: Allow taps during OPENING/OPEN/CLOSING to restart or give feedback
    if (this.doorState === 'OPENING' || this.doorState === 'OPEN') {
      engine.audio.play('door_knock');
      return;
    }
    if (this.doorState === 'CLOSING') {
      // Reverse! Start opening again
      this.doorState = 'OPENING';
      this.openTimer = 2.5;
      engine.audio.play('sound_boing');
      
      // Spawn large label again
      const animal = this.animalQueue[this.currentAnimalIdx];
      this._spawnLargeLabel(engine, animal);
      return;
    }

    // CLOSED
    this.doorState = 'OPENING';
    engine.audio.play('sound_boing');

    // Fade out tap hint after first tap
    if (this.hintLabel) {
      engine.animate(this.hintLabel, { alpha: 0 }, 0.4)
        .then(() => {
          if (this.hintLabel) {
            engine.destroy(this.hintLabel);
            this.hintLabel = null;
          }
        });
    }

    const animal = this.animalQueue[this.currentAnimalIdx];

    // Update prompt text to say the animal name
    this.promptLabel.text = animal.name;

    // Spawn a dedicated large label (PAB-3)
    this._spawnLargeLabel(engine, animal);

    // Update progress dot
    if (this.revealedThisCycle < ANIMAL_LIST.length) {
      const dot = this.progressDots[this.revealedThisCycle];
      if (dot) {
        dot.texture = PIXI.Assets.get('ui_dot_filled') || dot.texture;
        engine.animate(dot, { scale: 1.4 }, 0.15, 'easeOut')
          .then(() => engine.animate(dot, { scale: 0.8 }, 0.15, 'bounce'));
      }
      this.revealedThisCycle++;
    }
  },

  _spawnLargeLabel(engine, animal) {
    if (this.nameLabelBig) {
      engine.destroy(this.nameLabelBig);
    }
    this.nameLabelBig = engine.spawn({
      id: 'animal_name_big',
      text: animal.name,
      fontSize: Math.max(48, engine.height * 0.1),
      color: '#fff176',
      x: engine.width / 2,
      y: engine.height * 0.82,
      zIndex: 10
    });
    if (this.nameLabelBig.style) {
      this.nameLabelBig.style.stroke = '#880e4f';
      this.nameLabelBig.style.strokeThickness = 6;
    }
    this.nameLabelBig.scale.set(0);
    engine.animate(this.nameLabelBig, { scale: 1.2 }, 0.15, 'easeOut')
      .then(() => engine.animate(this.nameLabelBig, { scale: 1.0 }, 0.12, 'bounce'));
  },

  _nextAnimal(engine) {
    this.currentAnimalIdx++;
    this.promptLabel.text = 'Who is there?';

    // If we finished the cycle
    if (this.currentAnimalIdx >= this.animalQueue.length) {
      engine.audio.play('win_jingle');
      
      // Trigger win state celebration
      engine.system.triggerWinState({
        title: 'YOU FOUND THEM ALL!',
        message: 'Wonderful! You discovered all the cute animals!',
        onReplay: () => this.init(engine),
        onExit: () => engine.system.exit(),
      });
      return;
    }

    // Put new animal texture behind the door
    const nextAnim = this.animalQueue[this.currentAnimalIdx];
    this.animalSprite.texture = PIXI.Assets.get(nextAnim.asset) || this.animalSprite.texture;
    this.animalSprite.alpha = 0;
    this.animalSprite.y = this.animalBaseY;
    this.animalBobTime = 0;

    // Recalculate target scale (PAB-2)
    const targetAnimalHeight = engine.height * 0.6;
    const animScale = targetAnimalHeight / 112;
    this.animalSprite.scale.set(animScale);
  },

  preview(miniEngine) {
    this.t = 0;
    this.doorState = 'CLOSED';

    this.doorW = miniEngine.width * 0.35;
    this.doorH = this.doorW * 1.5;

    // Spawn animal
    this.animalSprite = miniEngine.spawn({
      asset: 'animal_cow',
      color: '#34c759',
      x: miniEngine.width / 2,
      y: miniEngine.height / 2,
      scale: 0.5
    });
    this.animalSprite.alpha = 0;

    // Spawn door
    this.doorSprite = miniEngine.spawn({
      asset: 'door_closed',
      color: '#8b4513',
      x: miniEngine.width / 2 - this.doorW / 2,
      y: miniEngine.height / 2,
      scale: 0.5
    });
    if (this.doorSprite.anchor) {
      this.doorSprite.anchor.set(0, 0.5);
    }
    this.doorSprite.width = this.doorW;
    this.doorSprite.height = this.doorH;
  },

  previewUpdate(miniEngine, dt) {
    this.t += dt;

    if (this.t > 0.5 && this.t < 1.0) {
      // Swings open
      this.doorState = 'OPEN';
    } else if (this.t > 2.5 && this.t < 3.0) {
      // Swings closed
      this.doorState = 'CLOSED';
    } else if (this.t > 4.0) {
      this.t = 0;
    }

    const targetAngle = this.doorState === 'OPEN' ? -Math.PI * 0.75 : 0;
    this.doorSprite.rotation += (targetAngle - this.doorSprite.rotation) * 8 * dt;

    // Bob animal if open
    if (this.doorState === 'OPEN') {
      this.animalSprite.alpha = Math.min(1, this.animalSprite.alpha + 4 * dt);
      this.animalSprite.y = miniEngine.height / 2 + Math.sin(this.t * 6) * 5;
    } else {
      this.animalSprite.alpha = Math.max(0, this.animalSprite.alpha - 4 * dt);
    }
  }

};
