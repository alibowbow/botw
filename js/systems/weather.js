'use strict';
/* weather.js — evolving weather: clear / cloudy / rain / storm / fog, plus
   biome snow. Storms flash lightning and — BOTW-style — can strike a player who
   is holding a metal weapon in the open. Exposes `gloom` for the light system. */

const WEATHER_STATES = ['clear', 'clear', 'cloudy', 'rain', 'fog', 'storm'];
const GLOOM = { clear: 0, cloudy: 0.14, rain: 0.32, storm: 0.5, fog: 0.4 };

class Weather {
  constructor(rng) {
    this.rng = rng || new RNG(9001);
    this.state = 'clear';
    this.next = 'clear';
    this.blend = 1;            // 0..1 transition toward `state`
    this.timer = 40;
    this.gloom = 0;
    this.rainAmt = 0;
    this.drops = [];
    this.flash = 0;            // screen flash 0..1
    this.thunderTimer = 0;
    this.strikeTimer = 12;
    this.strike = null;        // {t, x, y} pending bolt on the player
    this.snow = [];
  }

  isWet() { return this.state === 'rain' || this.state === 'storm'; }

  update(dt, game) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.state = this.next;
      this.next = this.rng.pick(WEATHER_STATES);
      this.timer = this.rng.range(35, 80);
      this.blend = 0;
    }
    this.blend = Math.min(1, this.blend + dt / 6);
    const targetGloom = GLOOM[this.state] || 0;
    this.gloom = approach(this.gloom, targetGloom, dt * 0.15);
    const targetRain = (this.state === 'rain') ? 0.7 : (this.state === 'storm') ? 1 : 0;
    this.rainAmt = approach(this.rainAmt, targetRain, dt * 0.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    // ambient thunder flashes during a storm
    if (this.state === 'storm') {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = this.rng.range(4, 10);
        this.flash = this.rng.range(0.5, 0.9);
        game.audio.play('explode');
      }
      this._lightning(dt, game);
    } else if (this.strike) {
      this.strike = null;
    }
  }

  _lightning(dt, game) {
    const p = game.player;
    if (this.strike) {
      this.strike.t -= dt;
      // cancel if the player stopped holding metal or became untargetable
      if (!this._metal(p) || p.state === 'glide' || !p.alive) { this.strike = null; return; }
      this.strike.x = p.x; this.strike.y = p.y;
      if (this.strike.t <= 0) {
        this.flash = 1;
        game.audio.play('explode');
        game.explode(p.x, p.y, 30, 0); // visual shock, no rock breaking damage
        game.particles.burst(p.x, p.y - 4, '#bfe0ff', 22);
        if (p.alive) p.damage(2, 0, -1, game); // a real jolt
        game.addLight(p.x, p.y - 20, 160, [180, 220, 255], 0.4);
        game.shake(9);
        this._boltAt = { x: p.x, y: p.y, t: 0.25 };
        this.strike = null;
      }
    } else {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = this.rng.range(9, 18);
        if (this._metal(p) && p.alive && p.state !== 'glide' && p.awaken <= 0) {
          this.strike = { t: 1.3, x: p.x, y: p.y };
          game.toast('⚡ Lightning is drawn to your metal weapon!');
        }
      }
    }
    if (this._boltAt) { this._boltAt.t -= dt; if (this._boltAt.t <= 0) this._boltAt = null; }
  }

  _metal(p) {
    const w = p.weapon;
    return w && (w.type === 'sword' || w.type === 'claymore' || w.type === 'spear');
  }

  // Drawn in screen space, after lighting.
  render(ctx, game) {
    const W = game.W, H = game.H;
    const coldHere = game.world.tileInfoAtWorld(game.player.x, game.player.y).cold;

    // rain
    if (this.rainAmt > 0.02 && !coldHere) {
      const n = Math.floor(this.rainAmt * 260);
      if (this.drops.length < n) for (let i = this.drops.length; i < n; i++) this.drops.push({ x: Math.random() * (W + 60) - 30, y: Math.random() * H, v: rand(560, 820), len: rand(9, 18) });
      this.drops.length = n;
      ctx.strokeStyle = `rgba(170,195,225,${0.35 + this.rainAmt * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.drops) {
        d.y += d.v * 0.016; d.x += 2.2;
        if (d.y > H) { d.y = -10; d.x = Math.random() * (W + 60) - 30; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + d.len);
      }
      ctx.stroke();
    } else if (this.drops.length && coldHere) {
      this.drops.length = 0;
    }

    // biome snow (independent of weather state)
    if (coldHere) {
      const target = 70;
      if (this.snow.length < target) for (let i = this.snow.length; i < target; i++) this.snow.push({ x: Math.random() * W, y: Math.random() * H, s: rand(0.6, 1.8), v: rand(16, 40) });
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const f of this.snow) {
        f.y += f.v * 0.016; f.x += Math.sin((f.y + f.x) * 0.02) * 0.5;
        if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
        ctx.fillRect(f.x, f.y, f.s, f.s);
      }
    } else if (this.snow.length) this.snow.length = 0;

    // fog
    if (this.state === 'fog' && this.blend > 0) {
      const a = 0.28 * this.blend;
      ctx.fillStyle = `rgba(200,206,214,${a})`;
      ctx.fillRect(0, 0, W, H);
    }

    // pending-strike telegraph on the player
    if (this.strike) {
      const z = game.zoom, view = game.view;
      const sx = (this.strike.x - view.x) * z, sy = (this.strike.y - view.y) * z;
      const k = 1 - this.strike.t / 1.3;
      ctx.strokeStyle = `rgba(180,220,255,${0.5 + Math.sin(game._time * 30) * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy - 10 * z, (26 - k * 18) * z, 0, TAU); ctx.stroke();
    }
    // the bolt itself
    if (this._boltAt && this._boltAt.t > 0) {
      const z = game.zoom, view = game.view;
      const sx = (this._boltAt.x - view.x) * z, sy = (this._boltAt.y - view.y) * z;
      ctx.strokeStyle = 'rgba(220,240,255,0.95)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, 0);
      let y = 0;
      while (y < sy) { y += H * 0.12; ctx.lineTo(sx + rand(-18, 18), Math.min(y, sy)); }
      ctx.stroke();
    }

    // lightning flash
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(220,235,255,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
