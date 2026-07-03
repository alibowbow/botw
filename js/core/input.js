'use strict';
/* input.js — keyboard + mouse state with edge detection.
   Query held state any time; edge (wasPressed) is cleared once per frame
   via lateUpdate(), which the game loop calls after update(). */

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = Object.create(null);     // code -> true while held
    this.pressed = Object.create(null);  // code -> true for the frame it went down
    this.released = Object.create(null); // code -> true for the frame it went up
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0, moved: false };
    this.anyInteraction = false;         // true once the user has interacted (for audio unlock)
    this._blockKeys = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
      'KeyW', 'KeyA', 'KeyS', 'KeyD'
    ]);
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (this._blockKeys.has(e.code)) e.preventDefault();
      this.anyInteraction = true;
      if (!this.down[e.code]) this.pressed[e.code] = true;
      this.down[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.down[e.code] = false;
      this.released[e.code] = true;
    });
    // Lose focus -> release everything to avoid stuck keys.
    window.addEventListener('blur', () => this.clearAll());

    const c = this.canvas;
    c.addEventListener('mousemove', (e) => this._updateMouse(e));
    c.addEventListener('mousedown', (e) => {
      this.anyInteraction = true;
      this._updateMouse(e);
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // Touch: treat a tap as an interaction so audio can unlock.
    c.addEventListener('touchstart', () => { this.anyInteraction = true; }, { passive: true });
  }

  _updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.sx = e.clientX - r.left;
    this.mouse.sy = e.clientY - r.top;
    this.mouse.moved = true;
  }

  clearAll() {
    for (const k in this.down) this.down[k] = false;
    this.mouse.left = this.mouse.right = false;
  }

  // Called after the frame's update() so edges last exactly one frame.
  lateUpdate() {
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }

  isDown(...codes) { for (const c of codes) if (this.down[c]) return true; return false; }
  wasPressed(...codes) { for (const c of codes) if (this.pressed[c]) return true; return false; }
  wasReleased(...codes) { for (const c of codes) if (this.released[c]) return true; return false; }
  // Clear a pressed edge so no later consumer in the same frame reacts to it.
  consume(...codes) { for (const c of codes) this.pressed[c] = false; }

  // Movement vector from WASD / arrows (normalized on the diagonal).
  moveVector() {
    let x = 0, y = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyW', 'ArrowUp')) y -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) { const inv = Math.SQRT1_2; x *= inv; y *= inv; }
    return { x, y };
  }
}
