// app.js

import { loadGame, exitGame, getAllGames, resolveGameSource } from './engine/loader.js';
import { initSettings, getSetting, setSetting, onSettingChange, SETTINGS_SCHEMA, startScreenTimer, stopScreenTimer } from './engine/settings.js';
import { initPreviewer, stopAllPreviewers } from './engine/previewer.js';
import { setVolume } from './engine/audio.js';

// ── Service Worker Registration ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[ToyBox] SW registered:', reg.scope))
      .catch(err => console.warn('[ToyBox] SW failed:', err));
  });
}

// ── DOM References ────────────────────────────────────────────────────────────
const appShell       = document.getElementById('app-shell');
const systemOverlay  = document.getElementById('system-overlay');
const btnExitGame    = document.getElementById('btn-exit-game');
const gameCanvas     = document.getElementById('game-canvas');

// ── Screen Router ─────────────────────────────────────────────────────────────
export function showLauncher() {
  appShell.classList.remove('hidden');
  systemOverlay.classList.add('hidden');
  gameCanvas.style.display = 'none';
  stopScreenTimer();
  renderLauncher(); // Refresh on return
}

export function showGame() {
  appShell.classList.add('hidden');
  systemOverlay.classList.remove('hidden');
  gameCanvas.style.display = 'block';

  // Start parental screen timer if configured
  startScreenTimer(
    () => {
      // Session Expired
      exitGame();
      showLauncher();
      alert('⏰ Play time is over! Time to take a break.');
    },
    (remainingMins) => {
      // Session Warning Toast
      showTimerWarningToast(remainingMins);
    }
  );
}

function showTimerWarningToast(remainingMins) {
  const toast = document.createElement('div');
  toast.className = 'timer-toast';
  toast.innerText = `⏰ Note: ${remainingMins} minutes left to play!`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Exit Button ───────────────────────────────────────────────────────────────
btnExitGame.addEventListener('pointerdown', () => {
  exitGame();
  showLauncher();
});

// ── Live Preview Bootstrapping ────────────────────────────────────────────────
async function initAllPreviews(games) {
  // Fetch game sources in parallel to maximize network/cache loading speed
  const sourcePromises = games.map(async (game) => {
    try {
      const source = await resolveGameSource(game);
      return { game, source };
    } catch (err) {
      console.warn(`[ToyBox] Failed to resolve game source for ${game.id}:`, err);
      return { game, source: null };
    }
  });

  const resolved = await Promise.all(sourcePromises);

  // Initialize previews sequentially with a small, flat 50ms stagger
  for (let i = 0; i < resolved.length; i++) {
    const { game, source } = resolved[i];
    if (!source) continue;

    const canvas = document.getElementById(`preview-canvas-${game.id}`);
    if (!canvas) continue;

    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
      initPreviewer(canvas, game, source);
    } catch (err) {
      console.warn(`[ToyBox] Preview initialization failed for ${game.id}:`, err);
    }
  }
}

// ── Launcher Render ───────────────────────────────────────────────────────────
async function renderLauncher() {
  // Initialize settings from IndexedDB first
  await initSettings();

  // Set master volume from loaded settings
  const masterVol = getSetting('volume') ?? 1.0;
  setVolume(masterVol);

  const games = await getAllGames();

  // Apply age range filtering in real-time
  const ageFilter = getSetting('ageFilter') || 'all';
  const filtered = ageFilter === 'all'
    ? games
    : games.filter(g => !g.ageRange || g.ageRange === ageFilter);

  appShell.innerHTML = `
    <header class="launcher-header">
      <span class="launcher-logo">🎮 ToyBox</span>
      <button id="btn-settings" class="btn-header-action" aria-label="Settings">⚙️ Settings</button>
    </header>
    <main class="game-grid" id="game-grid">
      ${filtered.map(buildGameTile).join('')}
    </main>
  `;

  // Wire up tile tap handler
  document.getElementById('game-grid').addEventListener('pointerdown', (e) => {
    const tile = e.target.closest('.game-tile');
    if (!tile) return;
    const gameId = tile.dataset.gameId;
    const game = filtered.find(g => g.id === gameId);
    if (game) onGameSelected(game);
  });

  // Wire up settings button with parental lock gate
  document.getElementById('btn-settings').addEventListener('pointerdown', () => {
    const pin = getSetting('parentalPin');
    if (pin) {
      showPinEntry(() => openSettingsPanel());
    } else {
      openSettingsPanel();
    }
  });

  // Stagger launch of previews
  requestAnimationFrame(() => initAllPreviews(filtered));
}

// ── Game Tile HTML Builder ────────────────────────────────────────────────────
function buildGameTile(game) {
  const PREVIEW_W = 240;
  const PREVIEW_H = 150; // 8:5 ratio
  
  const hasController = game.tags?.includes('controller') || (game.config && game.config.controller?.enabled);

  return `
    <div class="game-tile" data-game-id="${game.id}" role="button" tabindex="0"
         aria-label="Play ${game.title}">

      <div class="game-tile__preview-wrap">
        <canvas class="game-tile__preview-canvas"
                id="preview-canvas-${game.id}"
                width="${PREVIEW_W}" height="${PREVIEW_H}"
                aria-hidden="true"></canvas>
        <div class="game-tile__play-overlay" aria-hidden="true">
          <span class="game-tile__play-icon">▶</span>
        </div>
      </div>

      <div class="game-tile__footer">
        <span class="game-tile__title">${game.title}</span>
        ${game.sideloaded ? '<span class="game-tile__badge">Custom</span>' : ''}
        ${hasController ? '<span class="game-tile__badge game-tile__badge--ctrl">🎮</span>' : ''}
      </div>

    </div>
  `;
}

// ── Game Selection Handler ────────────────────────────────────────────────────
async function onGameSelected(game) {
  stopAllPreviewers();
  showLoadingScreen();
  try {
    await loadGame(game, {
      onReady: () => {
        hideLoadingScreen();
        showGame();
      },
      onExit: () => {
        showLauncher();
      }
    });
  } catch (err) {
    console.error('[ToyBox] Failed to load game:', err);
    hideLoadingScreen();
    showLauncher();
  }
}

// ── Loading Screen Helpers ────────────────────────────────────────────────────
function showLoadingScreen() {
  let screen = document.getElementById('loading-screen');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'loading-screen';
    screen.className = 'loading-screen';
    screen.innerHTML = `<div class="spinner"></div><p>Loading Game...</p>`;
    document.body.appendChild(screen);
  }
  screen.classList.remove('hidden');
}

function hideLoadingScreen() {
  document.getElementById('loading-screen')?.remove();
}

// ── Settings UI Panel Lifecycle ───────────────────────────────────────────────
function buildSettingsPanel() {
  return `
    <div id="settings-panel" class="settings-panel" role="dialog"
         aria-label="Settings" aria-modal="true">

      <header class="settings-header">
        <button id="btn-settings-back" class="settings-back-btn"
                aria-label="Back to games">
          ← Back
        </button>
        <h1 class="settings-title">⚙️ Settings</h1>
      </header>

      <div class="settings-body">
        <!-- Audio Group -->
        <section class="settings-group" aria-labelledby="group-audio">
          <h2 class="settings-group-title" id="group-audio">Audio</h2>
          ${buildRangeRow('volume',       'Volume')}
          ${buildToggleRow('musicEnabled','Music')}
          ${buildToggleRow('sfxEnabled',  'Sound FX')}
        </section>

        <!-- Input Group -->
        <section class="settings-group" aria-labelledby="group-input">
          <h2 class="settings-group-title" id="group-input">Controls</h2>
          ${buildToggleRow('controllerEnabled', 'On-Screen Controller',
            'Show D-pad & buttons for compatible games')}
          ${buildToggleRow('vibrationEnabled',  'Vibration',
            'Haptic feedback on button presses')}
        </section>

        <!-- Content Group -->
        <section class="settings-group" aria-labelledby="group-content">
          <h2 class="settings-group-title" id="group-content">Content</h2>
          ${buildSelectRow('ageFilter', 'Age Filter')}
          ${buildSelectRow('language',  'Language')}
        </section>

        <!-- Parental Group -->
        <section class="settings-group" aria-labelledby="group-parental">
          <h2 class="settings-group-title" id="group-parental">Parental</h2>
          ${buildPinRow('parentalPin', 'Parental Lock PIN')}
          ${buildRangeRow('screenTimerMinutes', 'Screen Timer (mins)')}
        </section>

        <!-- Danger Zone -->
        <section class="settings-group settings-group--danger">
          <button id="btn-reset-scores" class="settings-danger-btn">
            🗑️ Reset All High Scores
          </button>
          <p class="settings-version">ToyBox v1.0.0</p>
        </section>
      </div>
    </div>
  `;
}

function openSettingsPanel() {
  stopAllPreviewers();

  const settingsPanelEl = document.createElement('div');
  settingsPanelEl.innerHTML = buildSettingsPanel();
  document.body.appendChild(settingsPanelEl.firstElementChild);

  requestAnimationFrame(() => {
    document.getElementById('settings-panel').classList.add('open');
  });

  wireSettingsEvents();
}

function closeSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  panel.classList.remove('open');
  panel.addEventListener('transitionend', () => {
    panel.remove();
    // Restart launcher preview loops
    renderLauncher();
  }, { once: true });
}

function wireSettingsEvents() {
  const panel = document.getElementById('settings-panel');

  document.getElementById('btn-settings-back').addEventListener('pointerdown', closeSettingsPanel);

  panel.addEventListener('change', async (e) => {
    const key  = e.target.dataset.settingKey;
    if (!key) return;

    let value;
    if (e.target.type === 'checkbox') value = e.target.checked;
    else if (e.target.type === 'range') value = parseFloat(e.target.value);
    else value = e.target.value;

    await setSetting(key, value);
  });

  // Handle PIN row button tap
  document.getElementById('setting-parentalPin-btn')?.addEventListener('pointerdown', () => {
    const currentPin = getSetting('parentalPin');
    if (currentPin) {
      // Change or Clear PIN dialog
      if (confirm('Do you want to clear your parental PIN lock?')) {
        setSetting('parentalPin', null).then(() => {
          closeSettingsPanel();
          openSettingsPanel();
        });
      }
    } else {
      // Set new PIN
      showPinSetup((newPin) => {
        setSetting('parentalPin', newPin).then(() => {
          closeSettingsPanel();
          openSettingsPanel();
        });
      });
    }
  });

  document.getElementById('btn-reset-scores')?.addEventListener('pointerdown', async () => {
    if (confirm('Reset all high scores? This cannot be undone.')) {
      const { getAll, del } = await import('./engine/storage.js');
      const scores = await getAll('high_scores');
      for (const score of scores) {
        await del('high_scores', score.gameId);
      }
      alert('High scores reset successfully!');
    }
  });
}

// Row Builders
function buildToggleRow(key, label, description = '') {
  const value = getSetting(key);
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="toggle">
      <div class="settings-row__label-group">
        <span class="settings-row__label">${label}</span>
        ${description ? `<span class="settings-row__desc">${description}</span>` : ''}
      </div>
      <label class="toggle-switch" aria-label="${label}">
        <input type="checkbox" id="setting-${key}" ${value ? 'checked' : ''}
               data-setting-key="${key}" />
        <span class="toggle-track"></span>
      </label>
    </div>
  `;
}

function buildRangeRow(key, label) {
  const schema = SETTINGS_SCHEMA[key];
  const value  = getSetting(key);
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="range">
      <span class="settings-row__label">${label}</span>
      <input type="range" class="settings-range" id="setting-${key}"
             min="${schema.min}" max="${schema.max}" step="${schema.step}"
             value="${value}" data-setting-key="${key}" />
    </div>
  `;
}

function buildSelectRow(key, label) {
  const schema  = SETTINGS_SCHEMA[key];
  const current = getSetting(key);
  const options = schema.options
    .map(o => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`)
    .join('');
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="select">
      <span class="settings-row__label">${label}</span>
      <select class="settings-select" id="setting-${key}"
              data-setting-key="${key}">${options}</select>
    </div>
  `;
}

function buildPinRow(key, label) {
  const hasPin = getSetting(key) !== null;
  return `
    <div class="settings-row" data-setting-key="${key}" data-setting-type="pin">
      <div class="settings-row__label-group">
        <span class="settings-row__label">${label}</span>
        <span class="settings-row__desc">${hasPin ? 'PIN is set' : 'No PIN — settings are unlocked'}</span>
      </div>
      <button class="settings-back-btn" id="setting-${key}-btn">
        ${hasPin ? 'Clear' : 'Set PIN'}
      </button>
    </div>
  `;
}

// Parental PIN Validation Gate
function showPinEntry(onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.innerHTML = `
    <div class="pin-dialog" role="dialog" aria-label="Enter PIN">
      <h2>🔒 Parental Lock</h2>
      <p style="font-size: 0.9rem; color: var(--color-text-muted); text-align: center;">Ask a parent to unlock settings</p>
      <div class="pin-dots" id="pin-dots">
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
      </div>
      <div class="pin-numpad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => `
          <button class="pin-key" data-digit="${n}">${n}</button>
        `).join('')}
      </div>
      <button class="settings-back-btn" id="btn-pin-cancel" style="margin-top: 8px;">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  let entered = '';

  overlay.addEventListener('pointerdown', (e) => {
    const digit = e.target.closest('.pin-key')?.dataset.digit;
    if (digit === undefined) return;

    if (digit === '⌫') {
      entered = entered.slice(0, -1);
    } else if (entered.length < 4 && digit !== '') {
      entered += digit;
    }

    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < entered.length);
    });

    if (entered.length === 4) {
      const storedPin = getSetting('parentalPin');
      if (entered === storedPin) {
        overlay.remove();
        onSuccess();
      } else {
        // Shake feedback on failure
        const dots = document.getElementById('pin-dots');
        dots.classList.add('shake');
        setTimeout(() => {
          entered = '';
          document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
          dots.classList.remove('shake');
        }, 500);
      }
    }
  });

  document.getElementById('btn-pin-cancel').addEventListener('pointerdown', () => {
    overlay.remove();
  });
}

// Parental PIN Setup Screen
function showPinSetup(onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.innerHTML = `
    <div class="pin-dialog" role="dialog" aria-label="Set Parental PIN">
      <h2>🔒 Create Parental PIN</h2>
      <p style="font-size: 0.9rem; color: var(--color-text-muted); text-align: center;" id="pin-setup-prompt">Enter a 4-digit PIN</p>
      <div class="pin-dots" id="pin-dots">
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
        <span class="pin-dot"></span>
      </div>
      <div class="pin-numpad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => `
          <button class="pin-key" data-digit="${n}">${n}</button>
        `).join('')}
      </div>
      <button class="settings-back-btn" id="btn-pin-cancel" style="margin-top: 8px;">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  let firstEntry = '';
  let entered = '';
  const prompt = document.getElementById('pin-setup-prompt');

  overlay.addEventListener('pointerdown', (e) => {
    const digit = e.target.closest('.pin-key')?.dataset.digit;
    if (digit === undefined) return;

    if (digit === '⌫') {
      entered = entered.slice(0, -1);
    } else if (entered.length < 4 && digit !== '') {
      entered += digit;
    }

    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < entered.length);
    });

    if (entered.length === 4) {
      if (!firstEntry) {
        firstEntry = entered;
        entered = '';
        prompt.innerText = 'Confirm your 4-digit PIN';
        document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
      } else {
        if (entered === firstEntry) {
          overlay.remove();
          onSuccess(entered);
        } else {
          // Mismatch shake
          const dots = document.getElementById('pin-dots');
          dots.classList.add('shake');
          prompt.innerText = 'PINs did not match! Try again.';
          setTimeout(() => {
            firstEntry = '';
            entered = '';
            document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
            dots.classList.remove('shake');
          }, 800);
        }
      }
    }
  });

  document.getElementById('btn-pin-cancel').addEventListener('pointerdown', () => {
    overlay.remove();
  });
}

// ── Live volume and theme changes updates ─────────────────────────────────────
onSettingChange('volume', (val) => setVolume(val));

// ── Boot ──────────────────────────────────────────────────────────────────────
renderLauncher();
