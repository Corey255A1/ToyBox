// games/memory_match.js
// ToyBox Mini-Game: Animal Memory Match
// Target age: 2–6 years | Interaction: Tap | Duration: ~3 min

const ANIMAL_IDS = ['cow', 'duck', 'frog', 'pig', 'cat', 'dog'];

export default {

  config: {
    background:      '#0f3460',
    interactionMode: 'tap',
    assets:          ['card_back', 'card_cow', 'card_duck', 'card_frog',
                      'card_pig', 'card_cat', 'card_dog', 'ui_star'],
    audio:           ['flip_card', 'match_success', 'match_fail', 'win_jingle'],
  },

  init(engine) {
    this.score        = 0;
    this.flippedCards = [];
    this.isLocked     = false;

    // Create a score label
    this.scoreLabel = engine.spawn({
      id: 'score_label',
      text: '⭐ 0',
      fontSize: 48,
      color: '#ffd700',
      x: engine.width / 2,
      y: 60,
      zIndex: 10,
    });

    // Create a shuffled deck (12 cards = 6 pairs)
    const pairs = [...ANIMAL_IDS, ...ANIMAL_IDS]
      .sort(() => Math.random() - 0.5);

    this.cards = pairs.map((animalId, index) => {
      const card = engine.spawn({
        id:      `card_${index}`,
        asset:   'card_back',
        x:       this._gridX(index, engine.width),
        y:       this._gridY(index, engine.height),
        scale:   1.0,
        onTouch: (self) => {
          if (!this.isLocked && !self._revealed) {
            this._flipCard(self, animalId, engine);
          }
        },
      });
      card._animalId  = animalId;
      card._revealed  = false;
      return card;
    });
  },

  update(engine, deltaTime) {
    if (this.score >= ANIMAL_IDS.length) {
      this.score = 0; // Prevent duplicate triggers
      engine.audio.play('win_jingle');
      engine.system.triggerWinState({
        title: 'YOU MATCHED THEM ALL!',
        message: 'Fantastic memory!',
        graphic: 'ui_star',
        onReplay: () => {
          // Re-init current game
          this.init(engine);
        },
        onExit: () => {
          engine.system.exit();
        }
      });
    }
  },

  onEvent(engine, eventName, payload) {
    if (eventName === 'match_check') {
      const [cardA, cardB] = this.flippedCards;
      this.flippedCards = [];

      if (cardA._animalId === cardB._animalId) {
        // Match!
        engine.audio.play('match_success');
        
        // Use engine fx pop animation
        engine.fx.pop(cardA);
        engine.fx.pop(cardB);

        this.score++;
        this.scoreLabel.text = `⭐ ${this.score}`;
        
        // Bounce score label
        engine.animate(this.scoreLabel, { scale: 1.3 }, 0.1, 'easeOut')
          .then(() => engine.animate(this.scoreLabel, { scale: 1.0 }, 0.1, 'bounce'));

        this.isLocked = false;
      } else {
        // No match — flip back
        engine.audio.play('match_fail');
        
        // Wiggle the cards on fail
        engine.fx.wiggle(cardA);
        engine.fx.wiggle(cardB).then(() => {
          // Flip back after wiggle completes
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
        // Flip-in scale effect
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

  // Private grid calculation helpers
  _flipCard(card, animalId, engine) {
    this.isLocked = true;
    
    // Play sound and animate custom flip
    engine.audio.play('flip_card');
    
    engine.fx.flipCard(card, `card_${animalId}`).then(() => {
      card._revealed  = true;
      this.flippedCards.push(card);

      if (this.flippedCards.length === 2) {
        // Defer the match check by 600ms
        setTimeout(() => {
          engine.emit('match_check');
        }, 600);
      } else {
        this.isLocked = false;
      }
    });
  },

  _gridX(index, canvasWidth) {
    const col = index % 4;
    return canvasWidth / 2 - 225 + col * 150;
  },

  _gridY(index, canvasHeight) {
    const row = Math.floor(index / 4);
    return canvasHeight / 2 - 80 + row * 150;
  },

};
