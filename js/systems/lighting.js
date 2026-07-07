'use strict';
/* lighting.js — screen-space lighting. Builds a darkness layer each frame
   (driven by day/night + weather) and punches soft light holes for the player
   torch, fires, structures and transient flashes, then adds an emissive bloom
   pass so fires/auras/shrines glow. Replaces the old flat night tint. */

class Lighting {
  constructor() {
    this.dark = null; this.dctx = null; this._w = 0; this._h = 0;
  }
  _ensure(w, h) {
    if (this.dark && this._w === w && this._h === h) return;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    this.dark = c; this.dctx = c.getContext('2d');
    this._w = w; this._h = h;
  }

  // world -> screen (CSS px) using the game's current view + zoom
  render(ctx, game) {
    const W = game.W, H = game.H, z = game.zoom, view = game.view;
    const night = game.dayNight.night;
    const gloom = game.weather ? game.weather.gloom : 0;
    const blood = game.dayNight.bloodMoon;
    const darkness = clamp(night * 0.9 + gloom * 0.55, 0, 0.94);

    // 1) gentle colour grade (dusk warmth / blood-moon red) via multiply
    const t = game.dayNight.tint();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgb(t.r, t.g, t.b);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    const toX = (wx) => (wx - view.x) * z;
    const toY = (wy) => (wy - view.y) * z;
    const p = game.player;

    // gather warm/coloured light points for bloom
    const glows = [];
    game.world.forEachObjectIn(view.x - 40, view.y - 40, view.x + view.w + 40, view.y + view.h + 40, (o) => {
      if (o.dead) return;
      if (o.type === 'campfire' || o.type === 'cookpot') glows.push({ x: o.x, y: o.y - 6, r: 82, col: [255, 168, 74], fire: true });
      else if (o.type === 'tower') glows.push({ x: o.x, y: o.y - 88, r: 64, col: [90, 220, 210], fire: false });
      else if (o.type === 'shrine' && o.ref && o.ref.activated) glows.push({ x: o.x, y: o.y - 14, r: 60, col: [80, 210, 255], fire: false });
      else if (o.type === 'shrine') glows.push({ x: o.x, y: o.y - 14, r: 46, col: [224, 138, 58], fire: true });
    });
    for (const l of game.lights) glows.push({ x: l.x, y: l.y, r: l.r, col: l.col, transient: true, life: l.life / l.max });

    // 2) darkness layer with light holes
    if (darkness > 0.02) {
      this._ensure(W, H);
      const d = this.dctx;
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.clearRect(0, 0, W, H);
      // night colour
      const nb = blood > 0.2 ? `rgba(30,6,10,${darkness})` : `rgba(8,12,30,${darkness})`;
      d.fillStyle = nb; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      // player torch (bigger + steadier during awakening)
      const aw = p.awaken > 0;
      const flick = 0.9 + Math.sin(game._time * 12) * 0.03 + Math.sin(game._time * 27) * 0.02;
      this._hole(d, toX(p.x), toY(p.y), (aw ? 200 : 118) * z, (aw ? 0.98 : 0.9) * flick);
      for (const g of glows) {
        const fl = g.fire ? (0.88 + Math.sin(game._time * 10 + g.x) * 0.08) : 0.95;
        const a = g.transient ? Math.min(1, g.life * 1.3) : 1;
        this._hole(d, toX(g.x), toY(g.y), g.r * z, fl * a);
      }
      d.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.dark, 0, 0, W, H);
    }

    // 3) emissive bloom (additive)
    ctx.globalCompositeOperation = 'lighter';
    const bloomAmt = 0.35 + darkness * 0.5;
    for (const g of glows) {
      const [r, gg, b] = g.col;
      const fl = g.fire ? (0.8 + Math.sin(game._time * 11 + g.y) * 0.15) : 1;
      const a = (g.transient ? Math.min(1, g.life) : bloomAmt) * fl;
      const rad = createGlowGrad(ctx, toX(g.x), toY(g.y), g.r * z * 0.9, r, gg, b, a);
      ctx.fillStyle = rad;
      ctx.fillRect(toX(g.x) - g.r * z, toY(g.y) - g.r * z, g.r * z * 2, g.r * z * 2);
    }
    // awakening gold aura bloom on the player
    if (p.awaken > 0) {
      const pulse = 0.5 + Math.sin(game._time * 8) * 0.12;
      const rad = createGlowGrad(ctx, toX(p.x), toY(p.y - 4), 90 * z, 255, 210, 90, pulse);
      ctx.fillStyle = rad;
      ctx.fillRect(toX(p.x) - 90 * z, toY(p.y - 4) - 90 * z, 180 * z, 180 * z);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _hole(d, x, y, r, strength) {
    if (r <= 0) return;
    const g = d.createRadialGradient(x, y, r * 0.12, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.7, `rgba(0,0,0,${strength * 0.5})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function createGlowGrad(ctx, x, y, r, red, green, blue, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${red|0},${green|0},${blue|0},${a})`);
  g.addColorStop(0.5, `rgba(${red|0},${green|0},${blue|0},${a * 0.35})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}
