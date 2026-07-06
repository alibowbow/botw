'use strict';
/* particle.js — lightweight particle system with pooled emitters. */

class Particles {
  constructor() { this.list = []; this.rings = []; }

  _add(x, y, vx, vy, life, color, size, grav, fade) {
    if (this.list.length > 900) return;
    this.list.push({ x, y, vx, vy, life, max: life, color, size, grav: grav || 0, fade: fade !== false, shape: 'rect' });
  }

  dust(x, y, scale) {
    scale = scale || 1;
    for (let i = 0; i < 2; i++) this._add(x + rand(-2, 2), y, rand(-8, 8), rand(-14, -4), rand(0.25, 0.5) * scale, 'rgba(200,190,160,0.7)', rand(1.5, 3), -8);
  }
  dustRing(x, y) {
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; this._add(x + Math.cos(a) * 3, y, Math.cos(a) * 30, Math.sin(a) * 12 - 6, 0.4, 'rgba(210,200,170,0.75)', 2.4, 20); }
  }
  splash(x, y) {
    for (let i = 0; i < 5; i++) this._add(x + rand(-3, 3), y, rand(-24, 24), rand(-40, -12), rand(0.25, 0.5), 'rgba(150,200,240,0.85)', rand(1.5, 3), 120);
    this.ring(x, y, 'rgba(180,220,255,0.7)', 12, 0.35);
  }
  hit(x, y) {
    for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, s = rand(30, 90); this._add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.15, 0.35), 'rgba(255,240,180,0.95)', rand(1.5, 3), 40); }
  }
  spark(x, y) {
    for (let i = 0; i < 5; i++) { const a = Math.random() * TAU, s = rand(20, 60); this._add(x, y, Math.cos(a) * s, Math.sin(a) * s - 20, rand(0.3, 0.6), 'rgba(255,255,210,0.9)', rand(1, 2.4), 30); }
  }
  burst(x, y, color, n) {
    const c = withAlpha(color);
    for (let i = 0; i < (n || 10); i++) { const a = Math.random() * TAU, s = rand(30, 110); this._add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), css(c, 0.9), rand(2, 4), 60); }
  }
  leaves(x, y, color) {
    const c = withAlpha(color || '#6fae4a');
    for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, s = rand(20, 60); this._add(x, y - 4, Math.cos(a) * s, Math.sin(a) * s - 20, rand(0.5, 1.0), css(c, 0.9), rand(2, 3.5), 40); }
  }
  heal(x, y) {
    for (let i = 0; i < 8; i++) this._add(x + rand(-6, 6), y + rand(-2, 8), rand(-6, 6), rand(-40, -18), rand(0.6, 1.1), 'rgba(120,240,150,0.9)', rand(1.5, 3), -20);
  }
  aura(x, y) {
    this._add(x, y + rand(-2, 8), rand(-10, 10), rand(-56, -26), rand(0.4, 0.85), 'rgba(255,224,120,0.9)', rand(1.5, 3.2), -34);
  }
  explosion(x, y) {
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = rand(40, 180); this._add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), i % 3 === 0 ? 'rgba(255,210,120,0.95)' : 'rgba(255,130,50,0.95)', rand(3, 6), 20); }
    for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, s = rand(10, 60); this._add(x, y, Math.cos(a) * s, Math.sin(a) * s - 20, rand(0.6, 1.2), 'rgba(80,80,80,0.6)', rand(4, 8), -30); }
    this.ring(x, y, 'rgba(255,220,150,0.9)', 46, 0.4);
  }
  ring(x, y, color, r, life) { this.rings.push({ x, y, color, r, life, max: life }); }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); }
    }
  }

  draw(ctx) {
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const a = p.fade ? clamp(p.life / p.max, 0, 1) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * t, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
