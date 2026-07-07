'use strict';
/* ambient.js — living-world touches: butterflies by day, fireflies by night
   (glowing in the dark), and animated shimmer on water. Purely decorative. */

class Ambient {
  constructor() {
    this.critters = [];
    this.n = 26;
  }

  _spawn(game, near) {
    const view = game.view;
    const m = 40;
    return {
      x: near ? near.x : view.x + Math.random() * view.w,
      y: near ? near.y : view.y + Math.random() * view.h,
      vx: rand(-14, 14), vy: rand(-10, 10),
      ph: Math.random() * TAU, hue: Math.floor(rand(0, 5)),
      blink: Math.random() * TAU,
    };
  }

  update(dt, game) {
    const view = game.view;
    if (this.critters.length < this.n) for (let i = this.critters.length; i < this.n; i++) this.critters.push(this._spawn(game));
    for (const c of this.critters) {
      c.ph += dt * 3; c.blink += dt * 2;
      c.vx += Math.sin(c.ph) * 6 * dt; c.vy += Math.cos(c.ph * 0.7) * 5 * dt;
      c.vx = clamp(c.vx, -22, 22); c.vy = clamp(c.vy, -18, 18);
      c.x += c.vx * dt; c.y += c.vy * dt;
      // recycle when it drifts off the padded view
      if (c.x < view.x - 60 || c.x > view.x + view.w + 60 || c.y < view.y - 60 || c.y > view.y + view.h + 60) {
        const s = this._spawn(game);
        c.x = s.x; c.y = s.y; c.vx = s.vx; c.vy = s.vy;
      }
    }
  }

  // butterflies in world space (drawn with the world transform, daytime)
  drawDay(ctx, game) {
    if (game.dayNight.night > 0.55) return;
    const cols = ['#e46b9a', '#e8d24a', '#7aa6e8', '#f0864a', '#9a6be4'];
    for (const c of this.critters) {
      const t = game.world.tileInfoAtWorld(c.x, c.y);
      if (t.deep || t.solid) continue;
      const flap = Math.abs(Math.sin(c.ph * 4));
      ctx.fillStyle = cols[c.hue];
      const w = 0.9 + flap * 1.4;
      ctx.beginPath(); ctx.ellipse(c.x - w, c.y, w, 1.6, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + w, c.y, w, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2320'; ctx.fillRect(c.x - 0.4, c.y - 1.1, 0.8, 2.2);
    }
  }

  // fireflies in screen space (additive, after lighting so they glow at night)
  drawGlow(ctx, game) {
    if (game.dayNight.night < 0.45) return;
    const z = game.zoom, view = game.view;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.critters) {
      const t = game.world.tileInfoAtWorld(c.x, c.y);
      if (t.deep) continue;
      const b = 0.4 + Math.sin(c.blink) * 0.5;
      if (b <= 0.05) continue;
      const sx = (c.x - view.x) * z, sy = (c.y - view.y) * z;
      const r = 7 * z;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(200,255,150,${b})`);
      g.addColorStop(1, 'rgba(160,255,120,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // shimmering highlights on visible water (world space, after terrain)
  drawWater(ctx, game) {
    const view = game.view, t = game._time;
    const tx0 = Math.floor(view.x / TILE), tx1 = Math.floor((view.x + view.w) / TILE);
    const ty0 = Math.floor(view.y / TILE), ty1 = Math.floor((view.y + view.h) / TILE);
    ctx.strokeStyle = 'rgba(220,240,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty += 2) {
      for (let tx = tx0; tx <= tx1; tx += 2) {
        const info = TILES[game.world.tileIdAt(tx, ty)];
        if (!info || (!info.deep && !info.shallow)) continue;
        const wob = Math.sin(t * 2 + tx * 0.7 + ty * 1.3);
        if (wob < 0.4) continue;
        const x = tx * TILE + 3 + wob * 3, y = ty * TILE + 8 + Math.sin(t + tx) * 2;
        ctx.moveTo(x, y); ctx.lineTo(x + 5, y);
      }
    }
    ctx.stroke();
  }
}
