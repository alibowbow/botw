'use strict';
/* touch.js — on-screen controls for touch devices: a left virtual joystick for
   movement and right-hand action buttons. Buttons synthesize key presses so the
   rest of the game reads input exactly as it does for a keyboard. */

class TouchControls {
  constructor(input, game) {
    this.input = input;
    this.game = game;
    this.enabled = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this._joyId = null;
    this._joyRect = null;
    if (!this.enabled) return;
    document.body.classList.add('touch');
    this._build();
    // Unlock audio on the first touch anywhere (must be inside a gesture).
    window.addEventListener('touchstart', () => this.game.audio.unlock(), { passive: true });
  }

  _build() {
    const wrap = document.getElementById('wrap') || document.body;
    const root = document.createElement('div');
    root.id = 'touch';
    wrap.appendChild(root);
    this.root = root;

    // --- joystick ---
    const joy = document.createElement('div'); joy.className = 'joy';
    const knob = document.createElement('div'); knob.className = 'knob';
    joy.appendChild(knob); root.appendChild(joy);
    this.joy = joy; this.knob = knob;
    this._bindJoystick();

    // --- right-hand action cluster ---
    const actions = document.createElement('div'); actions.className = 'actions'; root.appendChild(actions);
    this._btn(actions, 'atk', 'A', 'KeyJ');    // attack
    this._btn(actions, 'act', 'E', 'KeyE');    // interact / activate
    this._btn(actions, 'dodge', '↻', 'Space'); // dodge roll
    this._btn(actions, 'bow', '➹', 'KeyK');    // bow
    this._btn(actions, 'bomb', '✸', 'KeyB');   // bomb
    this._btn(actions, 'swap', '⟳', 'KeyQ');   // cycle weapon

    // --- left helpers near the joystick ---
    const left = document.createElement('div'); left.className = 'lbtns'; root.appendChild(left);
    this._btn(left, 'run', 'RUN', 'ShiftLeft', { toggle: true }); // sprint (toggle)
    this._btn(left, 'eat', 'EAT', 'KeyF');

    // --- awaken button by the power gauge (only lights up when ready) ---
    this.awakenBtn = this._btn(root, 'awaken', '⚡', 'KeyR');
    this.awakenBtn.classList.add('awakenbtn');

    // --- top-right system buttons ---
    const top = document.createElement('div'); top.className = 'topbtns'; root.appendChild(top);
    this._btn(top, 'map', 'MAP', 'KeyM');
    this._btn(top, 'menu', '❚❚', 'Escape');
  }

  _btn(parent, cls, label, code, opts) {
    opts = opts || {};
    const b = document.createElement('div');
    b.className = 'tbtn ' + cls;
    b.textContent = label;
    parent.appendChild(b);

    const press = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      this.game.audio.unlock();
      if (opts.toggle) {
        const on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        this.input.down[code] = on; // held while toggled on
      } else {
        this.input.pressKey(code);
        b.classList.add('on');
      }
    };
    const release = (e) => {
      if (e) e.preventDefault();
      if (!opts.toggle) { this.input.releaseKey(code); b.classList.remove('on'); }
    };
    b.addEventListener('touchstart', press, { passive: false });
    b.addEventListener('touchend', release, { passive: false });
    b.addEventListener('touchcancel', release, { passive: false });
    // mouse fallback so the controls are testable on desktop
    b.addEventListener('mousedown', press);
    b.addEventListener('mouseup', release);
    b.addEventListener('mouseleave', (e) => { if (b.classList.contains('on') && !opts.toggle) release(e); });
    return b;
  }

  _bindJoystick() {
    const joy = this.joy, knob = this.knob;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const reset = () => { setKnob(0, 0); this.input.touchMove.x = 0; this.input.touchMove.y = 0; this._joyId = null; };

    const move = (cx, cy) => {
      const r = this._joyRect || joy.getBoundingClientRect();
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      const dx = cx - ox, dy = cy - oy;
      const m = Math.hypot(dx, dy);
      const maxR = r.width * 0.36;
      const cl = Math.min(m, maxR);
      const ux = m > 0.0001 ? dx / m : 0, uy = m > 0.0001 ? dy / m : 0;
      setKnob(ux * cl, uy * cl);
      if (m > 8) { this.input.touchMove.x = ux; this.input.touchMove.y = uy; }
      else { this.input.touchMove.x = 0; this.input.touchMove.y = 0; }
    };

    joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.game.audio.unlock();
      this._joyRect = joy.getBoundingClientRect();
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      move(t.clientX, t.clientY);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this._joyId) move(t.clientX, t.clientY);
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this._joyId) { reset(); } };
    joy.addEventListener('touchend', end, { passive: false });
    joy.addEventListener('touchcancel', end, { passive: false });

    // mouse fallback (desktop testing)
    let md = false;
    joy.addEventListener('mousedown', (e) => { md = true; this._joyRect = joy.getBoundingClientRect(); move(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (md) move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (md) { md = false; reset(); } });
  }

  // Show gameplay controls only while actually playing.
  sync(state) {
    if (!this.enabled) return;
    this.root.classList.toggle('ingame', state === 'playing');
    if (this.awakenBtn && this.game.player) this.awakenBtn.classList.toggle('ready', this.game.player.canAwaken() || this.game.player.awaken > 0);
    if (state !== 'playing') { this.input.touchMove.x = 0; this.input.touchMove.y = 0; if (this.knob) this.knob.style.transform = 'translate(0,0)'; }
  }
}
