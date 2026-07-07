'use strict';
/* sprites.js — procedurally paints static-object and item sprites onto
   offscreen canvases once at startup. Objects are drawn many times per
   frame, so caching them as bitmaps is far cheaper than re-painting. */

// ss = supersample factor: the canvas is ss× larger but drawing code works in
// logical units (ctx is pre-scaled). _lw/_lh keep the logical size for drawing.
function makeCanvas(w, h, ss) {
  ss = ss || 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * ss));
  c.height = Math.max(1, Math.ceil(h * ss));
  c._lw = w; c._lh = h;
  const ctx = c.getContext('2d');
  if (ss !== 1) ctx.scale(ss, ss);
  return { c, ctx };
}

const SPRITE_SS = 3; // supersample for world sprites (smooth at zoom 2-4)

class SpriteBank {
  constructor() {
    this.rng = new RNG(1337);
    this.o = {};      // objects: name -> [variant canvases], anchor bottom-center
    this.icon = {};   // items: name -> canvas (anchor center)
    this._build();
  }

  R(a, b) { return this.rng.range(a, b); }

  _put(name, canvas, feetY) {
    if (!this.o[name]) this.o[name] = [];
    canvas._feetY = feetY === undefined ? canvas.height : feetY;
    this.o[name].push(canvas);
  }

  variant(name, i) {
    const arr = this.o[name];
    if (!arr || !arr.length) return null;
    return arr[i % arr.length];
  }

  _build() {
    this._shadow();
    this._trees();
    this._pines();
    this._bushes();
    this._rocks();
    this._boulders();
    this._grassTufts();
    this._flowers();
    this._stump();
    this._chest();
    this._campfire();
    this._tower();
    this._shrine();
    this._cookpot();
    this._icons();
  }

  // Soft radial blob shadow, drawn squashed under objects/actors.
  _shadow() {
    const { c, ctx } = makeCanvas(32, 32, SPRITE_SS);
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, 'rgba(10,14,10,0.42)');
    g.addColorStop(0.65, 'rgba(10,14,10,0.22)');
    g.addColorStop(1, 'rgba(10,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.shadow = c;
  }

  _trees() {
    for (let v = 0; v < 3; v++) {
      const w = 34, h = 44;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      // trunk
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(w / 2 - 3, h - 14, 6, 14);
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(w / 2 - 3, h - 14, 2, 14);
      // canopy: layered blobs
      const greens = [['#2f6b34', '#3f8a41', '#57a54f'], ['#345f2c', '#4a7d3a', '#67a24d'], ['#2c6b4a', '#3c8a5f', '#54a56f']][v];
      const cx = w / 2, cy = 16;
      const blobs = [[cx, cy, 15], [cx - 8, cy + 4, 11], [cx + 8, cy + 4, 11], [cx, cy + 9, 13], [cx - 5, cy - 6, 9], [cx + 5, cy - 6, 9]];
      ctx.fillStyle = greens[0];
      for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = greens[1];
      for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx - 1, by - 1, r * 0.72, 0, TAU); ctx.fill(); }
      // highlights
      ctx.fillStyle = greens[2];
      for (let i = 0; i < 20; i++) {
        const a = this.R(0, TAU), rr = this.R(2, 12);
        ctx.beginPath(); ctx.arc(cx - 2 + Math.cos(a) * rr, cy - 3 + Math.sin(a) * rr * 0.8, this.R(1.2, 2.4), 0, TAU); ctx.fill();
      }
      sunShade(ctx, w, h);
      this._put('tree', c, h - 3);
    }
  }

  _pines() {
    for (let v = 0; v < 2; v++) {
      const w = 26, h = 46;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(w / 2 - 2, h - 10, 4, 10);
      const dark = v ? '#20492e' : '#1f4a3a';
      const lite = v ? '#347044' : '#2f6b52';
      const cx = w / 2;
      for (let layer = 0; layer < 4; layer++) {
        const ly = 6 + layer * 8;
        const lw = 6 + layer * 4.5;
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx, ly - 8);
        ctx.lineTo(cx - lw, ly + 6);
        ctx.lineTo(cx + lw, ly + 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = lite;
        ctx.beginPath();
        ctx.moveTo(cx, ly - 6);
        ctx.lineTo(cx - lw * 0.55, ly + 4);
        ctx.lineTo(cx + lw * 0.3, ly + 4);
        ctx.closePath(); ctx.fill();
      }
      sunShade(ctx, w, h);
      this._put('pine', c, h - 2);
    }
  }

  _bushes() {
    for (let v = 0; v < 3; v++) {
      const w = 24, h = 20;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      const base = ['#3f7d3a', '#4a7d3a', '#57893f'][v];
      const hi = ['#5aa552', '#67a24d', '#78b05a'][v];
      ctx.fillStyle = base;
      const blobs = [[8, 12, 8], [16, 12, 8], [12, 9, 9], [6, 14, 6], [18, 14, 6]];
      for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = hi;
      for (let i = 0; i < 12; i++) ctx.fillRect(this.R(4, 20), this.R(4, 12), 2, 2);
      // occasional berries
      if (v === 2) { ctx.fillStyle = '#d8464f'; for (let i = 0; i < 4; i++) ctx.fillRect(this.R(6, 18), this.R(6, 13), 2, 2); }
      sunShade(ctx, w, h);
      this._put('bush', c, h - 2);
    }
  }

  _rocks() {
    for (let v = 0; v < 3; v++) {
      const w = 22, h = 18;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      ctx.fillStyle = '#8b857e';
      ctx.beginPath();
      ctx.moveTo(3, h - 2); ctx.lineTo(2, 9); ctx.lineTo(8, 3); ctx.lineTo(15, 4); ctx.lineTo(20, 10); ctx.lineTo(19, h - 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a49e97';
      ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(11, 5); ctx.lineTo(15, 8); ctx.lineTo(12, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6f6a64';
      ctx.fillRect(4, h - 5, 14, 3);
      sunShade(ctx, w, h);
      this._put('rock', c, h - 1);
    }
  }

  _boulders() {
    for (let v = 0; v < 2; v++) {
      const w = 40, h = 34;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      ctx.fillStyle = '#7d766e';
      ctx.beginPath();
      ctx.moveTo(4, h - 2); ctx.lineTo(2, 16); ctx.lineTo(12, 4); ctx.lineTo(26, 3); ctx.lineTo(37, 14); ctx.lineTo(36, h - 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#948d84';
      ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(20, 8); ctx.lineTo(28, 15); ctx.lineTo(20, 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#635d57';
      ctx.fillRect(6, h - 6, 28, 4);
      // crack (breakable hint)
      ctx.strokeStyle = '#4a453f'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(20, 6); ctx.lineTo(18, 16); ctx.lineTo(22, 24); ctx.stroke();
      sunShade(ctx, w, h);
      this._put('boulder', c, h - 1);
    }
  }

  _grassTufts() {
    for (let v = 0; v < 3; v++) {
      const w = 16, h = 14;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      const col = ['#6fae4a', '#7bbb52', '#84c25a'][v];
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const x = 3 + i * 2;
        ctx.beginPath(); ctx.moveTo(x, h - 1); ctx.quadraticCurveTo(x + this.R(-2, 2), h - 7, x + this.R(-3, 3), 2); ctx.stroke();
      }
      this._put('grass', c, h - 1);
    }
  }

  _flowers() {
    const cols = ['#e46b9a', '#e8d24a', '#7aa6e8', '#f28d5a'];
    for (let v = 0; v < 3; v++) {
      const w = 16, h = 14;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      ctx.strokeStyle = '#4f8a3f'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const x = 4 + i * 4, col = cols[(v + i) % cols.length];
        ctx.beginPath(); ctx.moveTo(x, h - 1); ctx.lineTo(x, 5); ctx.stroke();
        ctx.fillStyle = col;
        for (let p = 0; p < 4; p++) { const a = p / 4 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.2, 5 + Math.sin(a) * 2.2, 1.6, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#f6e58d'; ctx.beginPath(); ctx.arc(x, 5, 1.4, 0, TAU); ctx.fill();
      }
      this._put('flower', c, h - 1);
    }
  }

  _stump() {
    const w = 18, h = 12;
    const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
    ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(w / 2, h - 4, 7, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a6339'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, 6, 3.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, 3, 1.7, 0, 0, TAU); ctx.stroke();
    this._put('stump', c, h - 1);
  }

  _chest() {
    for (let open = 0; open < 2; open++) {
      const w = 26, h = 22;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      // body
      ctx.fillStyle = '#7a4d24'; ctx.fillRect(3, 9, 20, 12);
      ctx.fillStyle = '#8f5d2c'; ctx.fillRect(4, 10, 18, 10);
      ctx.fillStyle = '#c8a24a'; ctx.fillRect(3, 9, 20, 2); ctx.fillRect(11, 9, 4, 12);
      if (!open) {
        ctx.fillStyle = '#8f5d2c'; ctx.fillRect(3, 3, 20, 7);
        ctx.fillStyle = '#a06a34'; ctx.fillRect(4, 4, 18, 5);
        ctx.fillStyle = '#c8a24a'; ctx.fillRect(3, 3, 20, 2);
        ctx.fillStyle = '#e8cf6a'; ctx.fillRect(11, 8, 4, 4);
      } else {
        ctx.fillStyle = '#5a3a1c'; ctx.fillRect(3, 3, 20, 4); // open lid back
        ctx.fillStyle = '#241a10'; ctx.fillRect(5, 9, 16, 3); // dark interior
        ctx.fillStyle = '#ffe98a'; ctx.globalAlpha = 0.5; ctx.fillRect(6, 8, 14, 2); ctx.globalAlpha = 1;
      }
      sunShade(ctx, w, h);
      this._put(open ? 'chestOpen' : 'chest', c, h - 1);
    }
  }

  _campfire() {
    for (let f = 0; f < 3; f++) {
      const w = 24, h = 22;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      // logs
      ctx.fillStyle = '#5a3d22'; ctx.fillRect(5, h - 6, 14, 3);
      ctx.save(); ctx.translate(12, h - 5); ctx.rotate(0.5); ctx.fillRect(-7, -1.5, 14, 3); ctx.restore();
      // stones
      ctx.fillStyle = '#8b857e';
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.beginPath(); ctx.arc(12 + Math.cos(a) * 8, h - 4 + Math.sin(a) * 3, 2.2, 0, TAU); ctx.fill(); }
      // flame
      const flick = f * 1.7;
      ctx.fillStyle = '#e8622a';
      ctx.beginPath(); ctx.moveTo(12, h - 20 - (f === 1 ? 2 : 0)); ctx.quadraticCurveTo(6 - flick, h - 10, 12, h - 6); ctx.quadraticCurveTo(18 + flick, h - 10, 12, h - 20 - (f === 1 ? 2 : 0)); ctx.fill();
      ctx.fillStyle = '#f4a63a';
      ctx.beginPath(); ctx.moveTo(12, h - 15); ctx.quadraticCurveTo(8, h - 9, 12, h - 6); ctx.quadraticCurveTo(16, h - 9, 12, h - 15); ctx.fill();
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(12, h - 9, 2, 0, TAU); ctx.fill();
      this._put('campfire', c, h - 2);
    }
  }

  _tower() {
    const w = 44, h = 96;
    const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
    const cx = w / 2;
    // shadowed base
    ctx.fillStyle = '#2b3340'; ctx.fillRect(cx - 9, 12, 18, h - 12);
    ctx.fillStyle = '#39424f'; ctx.fillRect(cx - 8, 12, 14, h - 12);
    ctx.fillStyle = '#4a5563'; ctx.fillRect(cx - 8, 12, 5, h - 12);
    // ancient teal accents
    ctx.fillStyle = '#3fd0c8';
    for (let y = 20; y < h - 6; y += 12) { ctx.fillRect(cx - 8, y, 14, 2); }
    ctx.fillRect(cx - 2, 14, 4, h - 20);
    // top platform
    ctx.fillStyle = '#2b3340'; ctx.fillRect(cx - 13, 6, 26, 10);
    ctx.fillStyle = '#4a5563'; ctx.fillRect(cx - 13, 6, 26, 3);
    // orange guidance light orb
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(cx, 6, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(cx, 6, 2, 0, TAU); ctx.fill();
    this._put('tower', c, h - 2);
  }

  _shrine() {
    for (let active = 0; active < 2; active++) {
      const w = 40, h = 40;
      const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
      const cx = w / 2;
      // base pedestal
      ctx.fillStyle = '#2c3038'; ctx.fillRect(cx - 14, h - 12, 28, 12);
      ctx.fillStyle = '#3a3f49'; ctx.fillRect(cx - 12, h - 12, 24, 3);
      // dome / structure
      ctx.fillStyle = '#33383f';
      ctx.beginPath(); ctx.moveTo(cx - 12, h - 12); ctx.lineTo(cx - 8, 10); ctx.lineTo(cx + 8, 10); ctx.lineTo(cx + 12, h - 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#454b54';
      ctx.beginPath(); ctx.moveTo(cx - 8, 10); ctx.lineTo(cx, 4); ctx.lineTo(cx + 8, 10); ctx.closePath(); ctx.fill();
      // glowing entrance
      const glow = active ? '#3fd8ff' : '#e08a3a';
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 4, h - 22, 8, 12);
      ctx.fillStyle = active ? '#bff2ff' : '#ffd9a0';
      ctx.fillRect(cx - 2, h - 20, 4, 8);
      // accent lines
      ctx.strokeStyle = glow; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - 10, 14); ctx.lineTo(cx - 10, h - 14); ctx.moveTo(cx + 10, 14); ctx.lineTo(cx + 10, h - 14); ctx.stroke();
      sunShade(ctx, w, h);
      this._put(active ? 'shrineOn' : 'shrine', c, h - 1);
    }
  }

  _cookpot() {
    const w = 24, h = 18;
    const { c, ctx } = makeCanvas(w, h, SPRITE_SS);
    ctx.fillStyle = '#3a3a40'; ctx.beginPath(); ctx.ellipse(12, 11, 9, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#55555c'; ctx.beginPath(); ctx.ellipse(12, 9, 8, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(12, 9, 6, 3, 0, 0, TAU); ctx.fill();
    // tripod
    ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(12, 8); ctx.lineTo(20, 3); ctx.stroke();
    this._put('cookpot', c, h - 1);
  }

  _icons() {
    // Each icon centered on a 16x16 canvas.
    const mk = (name, draw) => { const { c, ctx } = makeCanvas(16, 16, SPRITE_SS); draw(ctx); this.icon[name] = c; };

    mk('apple', (x) => { x.fillStyle = '#d8464f'; x.beginPath(); x.arc(8, 9, 5, 0, TAU); x.fill(); x.fillStyle = '#f07a7a'; x.beginPath(); x.arc(6, 7, 1.6, 0, TAU); x.fill(); x.strokeStyle = '#6b4a2b'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(8, 4); x.lineTo(9, 2); x.stroke(); x.fillStyle = '#4f8a3f'; x.beginPath(); x.ellipse(10, 3, 2, 1, 0.6, 0, TAU); x.fill(); });
    mk('meat', (x) => { x.fillStyle = '#b5643c'; x.beginPath(); x.ellipse(8, 9, 5, 4, 0, 0, TAU); x.fill(); x.fillStyle = '#d98a5a'; x.beginPath(); x.ellipse(7, 8, 3, 2.4, 0, 0, TAU); x.fill(); x.fillStyle = '#f0efe8'; x.fillRect(11, 3, 2, 6); });
    mk('mushroom', (x) => { x.fillStyle = '#d05a44'; x.beginPath(); x.arc(8, 7, 5, Math.PI, TAU); x.fill(); x.fillStyle = '#f0e0d0'; x.fillRect(6, 7, 4, 6); for (let i = 0; i < 3; i++) { x.fillStyle = '#fff'; x.beginPath(); x.arc(5 + i * 3, 5, 1, 0, TAU); x.fill(); } });
    mk('heart', (x) => { x.fillStyle = '#e8434f'; heartPath(x, 8, 9, 5.4); x.fill(); x.fillStyle = '#ff8a90'; heartPath(x, 6.6, 7.4, 2.2); x.fill(); });
    mk('stamina', (x) => { x.fillStyle = '#7bc24a'; x.beginPath(); x.arc(8, 8, 5, 0, TAU); x.fill(); x.fillStyle = '#a6e07a'; x.beginPath(); x.arc(6.5, 6.5, 2, 0, TAU); x.fill(); x.fillStyle = '#3f6b2a'; x.fillRect(7, 3, 2, 3); });
    mk('rupeeGreen', (x) => rupee(x, '#4fbf6a', '#a6f0b8'));
    mk('rupeeBlue', (x) => rupee(x, '#4f8fe0', '#b0d4ff'));
    mk('rupeeRed', (x) => rupee(x, '#e05a5a', '#ffb0b0'));
    mk('korok', (x) => { x.fillStyle = '#7a5a34'; x.beginPath(); x.arc(8, 9, 4.5, 0, TAU); x.fill(); x.fillStyle = '#4f8a3f'; for (let i = 0; i < 5; i++) { const a = -HALF_PI + (i - 2) * 0.5; x.save(); x.translate(8, 5); x.rotate(a); x.beginPath(); x.ellipse(0, -3, 1.4, 4, 0, 0, TAU); x.fill(); x.restore(); } x.fillStyle = '#2a1e12'; x.fillRect(6, 8, 1.5, 1.5); x.fillRect(9, 8, 1.5, 1.5); });
    mk('arrow', (x) => { x.strokeStyle = '#c8a86a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(3, 13); x.lineTo(13, 3); x.stroke(); x.fillStyle = '#d8d8d8'; x.beginPath(); x.moveTo(13, 3); x.lineTo(10, 4); x.lineTo(12, 6); x.closePath(); x.fill(); x.strokeStyle = '#e0e0e0'; x.beginPath(); x.moveTo(3, 13); x.lineTo(5, 11); x.moveTo(3, 13); x.lineTo(5, 14); x.stroke(); });
    mk('bomb', (x) => { x.fillStyle = '#2f333a'; x.beginPath(); x.arc(8, 10, 5, 0, TAU); x.fill(); x.fillStyle = '#4a4f57'; x.beginPath(); x.arc(6, 8, 1.8, 0, TAU); x.fill(); x.strokeStyle = '#8a6a3a'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(9, 5); x.quadraticCurveTo(12, 2, 13, 4); x.stroke(); x.fillStyle = '#ff9a3a'; x.beginPath(); x.arc(13, 4, 1.5, 0, TAU); x.fill(); });

    // Weapons (also used as world drops), drawn on 16x16, pointing up-right.
    mk('sword', (x) => { x.strokeStyle = '#d6dbe2'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(4, 13); x.lineTo(12, 4); x.stroke(); x.strokeStyle = '#8a5a2a'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(3, 14); x.lineTo(5, 12); x.stroke(); x.strokeStyle = '#c8a24a'; x.lineWidth = 2; x.beginPath(); x.moveTo(3, 11); x.lineTo(6, 14); x.stroke(); });
    mk('claymore', (x) => { x.strokeStyle = '#cfd6de'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(3, 14); x.lineTo(13, 3); x.stroke(); x.strokeStyle = '#7a4a8a'; x.lineWidth = 3; x.beginPath(); x.moveTo(2, 15); x.lineTo(4.5, 12.5); x.stroke(); x.strokeStyle = '#c8a24a'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(2.5, 11.5); x.lineTo(6, 15); x.stroke(); });
    mk('spear', (x) => { x.strokeStyle = '#b58a4a'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(2, 15); x.lineTo(13, 3); x.stroke(); x.fillStyle = '#d6dbe2'; x.beginPath(); x.moveTo(13, 3); x.lineTo(10, 4); x.lineTo(12, 7); x.closePath(); x.fill(); });
    mk('bow', (x) => { x.strokeStyle = '#8a5a2a'; x.lineWidth = 2; x.beginPath(); x.arc(6, 8, 6, -1.1, 1.1); x.stroke(); x.strokeStyle = '#e8e8e8'; x.lineWidth = 1; x.beginPath(); x.moveTo(9, 3); x.lineTo(9, 13); x.stroke(); });
    mk('shield', (x) => { x.fillStyle = '#4f6ea0'; x.beginPath(); x.moveTo(8, 2); x.lineTo(13, 5); x.lineTo(13, 10); x.lineTo(8, 14); x.lineTo(3, 10); x.lineTo(3, 5); x.closePath(); x.fill(); x.fillStyle = '#c8a24a'; x.beginPath(); x.moveTo(8, 5); x.lineTo(10, 8); x.lineTo(8, 11); x.lineTo(6, 8); x.closePath(); x.fill(); });
  }
}

// Directional light pass: brightens the top-left, darkens the bottom-right of
// whatever has been painted so far (source-atop keeps transparency intact).
function sunShade(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  let g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,246,214,0.30)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(20,28,48,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.7);
  ctx.bezierCurveTo(cx - s, cy - s * 0.2, cx - s * 0.55, cy - s, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.55, cy - s, cx + s, cy - s * 0.2, cx, cy + s * 0.7);
  ctx.closePath();
}

function rupee(x, col, hi) {
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(8, 2); x.lineTo(12, 5); x.lineTo(12, 11); x.lineTo(8, 14); x.lineTo(4, 11); x.lineTo(4, 5);
  x.closePath(); x.fill();
  x.fillStyle = hi;
  x.beginPath(); x.moveTo(8, 4); x.lineTo(10, 6); x.lineTo(8, 9); x.lineTo(6, 6); x.closePath(); x.fill();
}
