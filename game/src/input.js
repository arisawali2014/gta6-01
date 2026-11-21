// Keyboard and pointer input. Held keys give movement axes and a sprint flag; one-shot
// presses (interact, pause, confirm) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice. The pointer is
// tracked in the game's 1280x720 logical coordinates, letterboxed exactly as the
// renderer letterboxes the world, and its presses are counted for attacks.
import { VIEW } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_FISTS = 8;
export const ACTION_PISTOL = 16;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE', 'KeyF']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let clicks = 0;
  const mouse = { x: VIEW.width / 2, y: VIEW.height / 2, down: false };

  /** Client (CSS pixel) coordinates to the logical view, through the same letterbox the renderer uses. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / VIEW.width, rect.height / VIEW.height);
    const offX = (rect.width - VIEW.width * scale) / 2;
    const offY = (rect.height - VIEW.height * scale) / 2;
    mouse.x = (clientX - rect.left - offX) / scale;
    mouse.y = (clientY - rect.top - offY) / scale;
  }

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (INTERACT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_FISTS;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_PISTOL;
    } else if (event.code.startsWith('Arrow') || event.code === 'Space') {
      // Arrows and space would scroll the page in a browser chrome that shows one.
    } else {
      held.add(event.code);
      return;
    }
    held.add(event.code);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    toLogical(event.clientX, event.clientY);
    mouse.down = true;
    clicks += 1;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    toLogical(event.clientX, event.clientY);
  });

  return {
    mouse,
    /** Horizontal movement axis: -1 left, 1 right, 0 neither or both. */
    axisX() {
      return (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
    },
    /** Vertical movement axis: -1 up (north), 1 down (south). */
    axisY() {
      return (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
    },
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** The number of fresh pointer presses since the last call (attacks live here). */
    takeClicks() {
      const taken = clicks;
      clicks = 0;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
