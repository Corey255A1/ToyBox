// engine/controller.js

import { getSetting } from './settings.js';

export const controllerState = {
  dpad: {
    up:        false,
    down:      false,
    left:      false,
    right:     false,
    upLeft:    false,
    upRight:   false,
    downLeft:  false,
    downRight: false,
  },
  buttons: {
    a:      false,
    b:      false,
    start:  false,
    select: false,
  },
};

export const controllerPressed = {
  dpad:    { up: false, down: false, left: false, right: false },
  buttons: { a: false, b: false },
};

const changeListeners = new Set();

export function onControllerChange(callback) {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function notifyListeners() {
  for (const cb of changeListeners) cb(controllerState);
}

let overlayEl = null;
let isVisible = false;
let gamepadPollInterval = null;

const activePointers = new Map(); // pointerId → buttonId

export function showController(config = {}) {
  overlayEl = document.getElementById('controller-overlay');
  if (!overlayEl) return;

  // Render buttons dynamically or customize if needed
  const btnA = document.getElementById('btn-a');
  const btnB = document.getElementById('btn-b');
  const dpad = document.getElementById('dpad');

  if (config.dpad === false) {
    if (dpad) dpad.style.display = 'none';
  } else {
    if (dpad) dpad.style.display = 'block';
  }

  if (config.buttons) {
    if (btnA && config.buttons.a) {
      btnA.innerText = config.buttons.a.label || 'A';
      btnA.style.backgroundColor = config.buttons.a.color || '';
    }
    if (btnB && config.buttons.b) {
      btnB.innerText = config.buttons.b.label || 'B';
      btnB.style.backgroundColor = config.buttons.b.color || '';
    }
  }

  overlayEl.classList.remove('hidden');
  overlayEl.classList.add('visible');
  isVisible = true;

  document.getElementById('system-overlay')?.classList.add('controller-mode');

  attachControllerEvents();
  startGamepadPolling();
}

export function hideController() {
  overlayEl = document.getElementById('controller-overlay');
  if (!overlayEl) return;

  overlayEl.classList.remove('visible');
  overlayEl.classList.add('hidden');
  isVisible = false;

  document.getElementById('system-overlay')?.classList.remove('controller-mode');

  resetControllerState();
  detachControllerEvents();
  stopGamepadPolling();
}

function resetControllerState() {
  Object.keys(controllerState.dpad).forEach(k => controllerState.dpad[k] = false);
  Object.keys(controllerState.buttons).forEach(k => controllerState.buttons[k] = false);
  Object.keys(controllerPressed.dpad).forEach(k => controllerPressed.dpad[k] = false);
  Object.keys(controllerPressed.buttons).forEach(k => controllerPressed.buttons[k] = false);
  activePointers.clear();
}

const handlePointerDown = (e) => {
  const target = e.target.closest('[data-direction], [data-button]');
  if (!target) return;

  e.preventDefault();

  const direction = target.dataset.direction;
  const button    = target.dataset.button;

  target.classList.add('pressed');
  activePointers.set(e.pointerId, target.id);

  if (direction) {
    setDpad(direction, true);
    if (getSetting('vibrationEnabled') && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }
  if (button) {
    setButton(button, true);
    if (getSetting('vibrationEnabled') && navigator.vibrate) {
      navigator.vibrate(15);
    }
  }
};

const handlePointerUp = (e) => {
  const targetId = activePointers.get(e.pointerId);
  if (!targetId) return;

  const target = document.getElementById(targetId);
  target?.classList.remove('pressed');

  const direction = target?.dataset.direction;
  const button    = target?.dataset.button;

  if (direction) setDpad(direction, false);
  if (button)    setButton(button, false);

  activePointers.delete(e.pointerId);
};

const handlePointerCancel = (e) => handlePointerUp(e);

function attachControllerEvents() {
  if (!overlayEl) return;
  overlayEl.addEventListener('pointerdown',  handlePointerDown,  { passive: false });
  overlayEl.addEventListener('pointerup',    handlePointerUp,    { passive: true });
  overlayEl.addEventListener('pointercancel',handlePointerCancel,{ passive: true });
}

function detachControllerEvents() {
  if (!overlayEl) return;
  overlayEl.removeEventListener('pointerdown',  handlePointerDown);
  overlayEl.removeEventListener('pointerup',    handlePointerUp);
  overlayEl.removeEventListener('pointercancel',handlePointerCancel);
}

function setDpad(direction, active) {
  if (!(direction in controllerState.dpad)) return;

  const wasActive = controllerState.dpad[direction];
  controllerState.dpad[direction] = active;

  controllerState.dpad.upLeft    = controllerState.dpad.up   && controllerState.dpad.left;
  controllerState.dpad.upRight   = controllerState.dpad.up   && controllerState.dpad.right;
  controllerState.dpad.downLeft  = controllerState.dpad.down && controllerState.dpad.left;
  controllerState.dpad.downRight = controllerState.dpad.down && controllerState.dpad.right;

  if (active && !wasActive) {
    controllerPressed.dpad[direction] = true;
  }

  notifyListeners();
}

function setButton(button, active) {
  if (!(button in controllerState.buttons)) return;

  const wasActive = controllerState.buttons[button];
  controllerState.buttons[button] = active;

  if (active && !wasActive) {
    controllerPressed.buttons[button] = true;
  }

  notifyListeners();
}

export function clearPressedState() {
  Object.keys(controllerPressed.dpad).forEach(k => controllerPressed.dpad[k] = false);
  Object.keys(controllerPressed.buttons).forEach(k => controllerPressed.buttons[k] = false);
}

export function startGamepadPolling() {
  if (gamepadPollInterval) clearInterval(gamepadPollInterval);
  
  gamepadPollInterval = setInterval(() => {
    const gamepads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(gamepads).find(g => g?.connected);
    if (!gp) return;

    const deadzone = 0.3;

    const dx = gp.axes[0] ?? 0;
    const dy = gp.axes[1] ?? 0;
    setDpad('left',  dx < -deadzone || gp.buttons[14]?.pressed);
    setDpad('right', dx >  deadzone || gp.buttons[15]?.pressed);
    setDpad('up',    dy < -deadzone || gp.buttons[12]?.pressed);
    setDpad('down',  dy >  deadzone || gp.buttons[13]?.pressed);

    setButton('a', gp.buttons[0]?.pressed);
    setButton('b', gp.buttons[1]?.pressed);
  }, 16);
}

export function stopGamepadPolling() {
  if (gamepadPollInterval) {
    clearInterval(gamepadPollInterval);
    gamepadPollInterval = null;
  }
}
