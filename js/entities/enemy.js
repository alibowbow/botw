'use strict';
/* enemy.js — enemy types with a small state machine (idle/patrol → chase →
   attack → hurt → dead). Bokoblins & Chuchus melee, Keese fly, Octoroks shoot. */

const ENEMY_TYPES = {
  bokoblin:      { hp: 6,  speed: 48, dmg: 0.75, sight: 180, atk: 18, rad: 7, ranged: false, fly: false, color: '#b25a3a', color2: '#d67a4a', name: 'Bokoblin' },
  bokoblin_blue: { hp: 11, speed: 54, dmg: 1.0,  sight: 200, atk: 18, rad: 7.5, ranged: false, fly: false, color: '#4a6fb2', color2: '#6a92d6', name: 'Blue Bokoblin' },
  chuchu:        { hp: 4,  speed: 28, dmg: 0.5,  sight: 140, atk: 14, rad: 7, ranged: false, fly: false, color: '#4aa0d6', color2: '#8fd0f0', name: 'Chuchu' },
  keese:         { hp: 2,  speed: 74, dmg: 0.5,  sight: 210, atk: 12, rad: 5, ranged: false, fly: true,  color: '#5a4a6a', color2: '#8a7aa0', name: 'Keese' },
  octorok:       { hp: 5,  speed: 32, dmg: 0.75, sight: 230, atk: 150, rad: 7, ranged: true, fly: false, color: '#b28a4a', color2: '#d6b06a', name: 'Octorok' },
};

class Enemy {
  constructor(x, y, kind, game) {
    const t = ENEMY_TYPES[kind] || ENEMY_TYPES.bokoblin;
    this.kind = kind; this.def = t;
    this.x = x; this.y = y; this.hx = x; this.hy = y; // home
    this.rad = t.rad;
    this.hp = t.hp; this.maxHp = t.hp;
    this.state = 'idle';
    this.vx = 0; this.vy = 0;
    this.kbx = 0; this.kby = 0;
    this.hurtT = 0;
    this.flash = 0;
    this.touchCd = 0;
    this.shootCd = rand(0.5, 1.5);
    this.wanderT = 0; this.wx = 0; this.wy = 0;
    this.bob = Math.random() * TAU;
    this.aggro = false;
    this.deadT = 0;
    this.facing = 1; // -1 left, 1 right
    this.camp = null; // reference to camp if part of one
    this.attackWind = 0;
    this.alertPing = 0;
  }

  get alive() { return this.state !== 'dead'; }

  damage(dmg, kx, ky, knock, game) {
    if (this.state === 'dead') return;
    this.hp -= dmg;
    this.flash = 0.12;
    this.hurtT = 0.22;
    this.aggro = true;
    const l = Math.hypot(kx, ky) || 1;
    this.kbx += (kx / l) * knock; this.kby += (ky / l) * knock;
    game.particles.hit(this.x, this.y - 4);
    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.state = 'dead';
    this.deadT = 0.4;
    game.audio.play('enemyDie');
    game.particles.burst(this.x, this.y - 4, this.def.color2, 14);
    game.onEnemyDeath(this);
  }

  update(dt, game) {
    if (this.state === 'dead') { this.deadT -= dt; return; }
    const p = game.player;
    this.bob += dt * 6;
    this.flash = Math.max(0, this.flash - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.touchCd = Math.max(0, this.touchCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.alertPing = Math.max(0, this.alertPing - dt);

    // knockback
    if (Math.abs(this.kbx) > 2 || Math.abs(this.kby) > 2) {
      const opts = { deepSolid: !this.def.fly };
      const res = game.world.moveCircle(this.x, this.y, this.rad, this.kbx * dt, this.kby * dt, opts);
      this.x = res.x; this.y = res.y;
      this.kbx *= Math.pow(0.0005, dt); this.kby *= Math.pow(0.0005, dt);
    }
    if (this.hurtT > 0) return; // stunned

    const d = dist(this.x, this.y, p.x, p.y);
    const canSee = p.alive && d < this.def.sight && p.state !== 'glide';
    if (canSee) { if (!this.aggro) { this.aggro = true; this.alertPing = 0.6; } }
    // lose interest if far from home and player gone
    if (!canSee && d > this.def.sight * 1.4) this.aggro = false;

    let mvx = 0, mvy = 0;
    const t = this.def;

    if (this.aggro && p.alive) {
      const toP = angleTo(this.x, this.y, p.x, p.y);
      if (t.ranged) {
        // keep mid distance and shoot
        if (d < 80) { mvx = -Math.cos(toP); mvy = -Math.sin(toP); }
        else if (d > 170) { mvx = Math.cos(toP); mvy = Math.sin(toP); }
        if (d < t.sight && this.shootCd <= 0) {
          this.shootCd = rand(1.6, 2.4);
          const proj = new Projectile(this.x, this.y - 4, toP, 'rock', game);
          proj.fromEnemy = true; proj.dmg = t.dmg;
          game.spawnProjectile(proj);
        }
      } else if (t.fly) {
        // erratic swoop
        const wob = Math.sin(this.bob * 1.7) * 0.6;
        mvx = Math.cos(toP + wob); mvy = Math.sin(toP + wob);
      } else {
        mvx = Math.cos(toP); mvy = Math.sin(toP);
        // lunge windup when close
        if (d < t.atk + p.rad + 6) { this.attackWind = Math.min(0.3, this.attackWind + dt); }
        else this.attackWind = Math.max(0, this.attackWind - dt);
      }
      if (mvx !== 0) this.facing = mvx < 0 ? -1 : 1;
    } else {
      // wander near home
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(1.2, 3.0);
        if (Math.random() < 0.5) { this.wx = this.wy = 0; }
        else {
          const a = Math.random() * TAU;
          this.wx = Math.cos(a); this.wy = Math.sin(a);
        }
      }
      // return toward home if strayed
      const dh = dist(this.x, this.y, this.hx, this.hy);
      if (dh > 90) { const toH = angleTo(this.x, this.y, this.hx, this.hy); this.wx = Math.cos(toH); this.wy = Math.sin(toH); }
      mvx = this.wx * 0.5; mvy = this.wy * 0.5;
      if (mvx !== 0) this.facing = mvx < 0 ? -1 : 1;
    }

    let sp = t.speed * (this.aggro ? 1 : 0.6);
    if (mvx !== 0 || mvy !== 0) {
      const opts = { deepSolid: !t.fly, cliffSolid: true };
      const res = game.world.moveCircle(this.x, this.y, this.rad, mvx * sp * dt, mvy * sp * dt, opts);
      this.x = res.x; this.y = res.y;
    }

    // contact damage
    if (!t.ranged && p.alive && this.touchCd <= 0) {
      if (circlesOverlap(this.x, this.y, this.rad, p.x, p.y, p.rad + 1)) {
        this.touchCd = 0.8;
        const k = angleTo(p.x, p.y, this.x, this.y);
        // knock player AWAY from enemy
        p.damage(t.dmg, p.x - this.x, p.y - this.y, game);
      }
    }
  }

  draw(ctx, game) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const t = this.def;
    if (this.state === 'dead') {
      const a = clamp(this.deadT / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color2;
      const s = 1 + (1 - a) * 0.6;
      ctx.beginPath(); ctx.arc(x, y - 4, this.rad * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, this.rad * 0.9, this.rad * 0.4, 0, 0, TAU); ctx.fill();

    const bobY = t.fly ? Math.sin(this.bob) * 3 : Math.abs(Math.sin(this.bob)) * 1.5;
    ctx.save(); ctx.translate(x, y - bobY);
    const flash = this.flash > 0;
    const body = flash ? '#ffffff' : t.color;
    const body2 = flash ? '#ffffff' : t.color2;

    if (this.kind === 'keese') {
      // bat
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, this.rad, 0, TAU); ctx.fill();
      const wf = Math.sin(this.bob * 3) * 3;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-11, -4 - wf); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(11, -4 - wf); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
      if (!flash) { ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-2, -1, 1.6, 1.6); ctx.fillRect(1, -1, 1.6, 1.6); }
    } else if (this.kind === 'chuchu') {
      // gel blob
      const sq = 1 + Math.sin(this.bob) * 0.12;
      ctx.fillStyle = css(withAlpha(body2), 0.9);
      ctx.beginPath(); ctx.ellipse(0, 0, this.rad * (2 - sq) * 0.8, this.rad * sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 1, this.rad * (2 - sq) * 0.6, this.rad * sq * 0.7, 0, 0, TAU); ctx.fill();
      if (!flash) { ctx.fillStyle = '#12324a'; ctx.fillRect(-3, -2, 1.6, 1.6); ctx.fillRect(1.4, -2, 1.6, 1.6); }
    } else if (this.kind === 'octorok') {
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, -2, this.rad, 0, TAU); ctx.fill();
      // tentacles
      ctx.strokeStyle = body2; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 3, 3); ctx.lineTo(i * 4, 7 + Math.sin(this.bob + i) * 1.5); ctx.stroke(); }
      // snout
      ctx.fillStyle = body2; ctx.fillRect(this.facing * 4 - 1, -4, 3, 3);
      if (!flash) { ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-2, -4, 1.5, 1.5); ctx.fillRect(1, -4, 1.5, 1.5); }
    } else {
      // bokoblin: pig-goblin
      ctx.scale(this.facing, 1);
      // legs
      ctx.fillStyle = '#5a3a2a';
      const lp = Math.sin(this.bob) * 1.5;
      ctx.fillRect(-4, 2, 3, 4 + lp); ctx.fillRect(1, 2, 3, 4 - lp);
      // body
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, -1, this.rad, this.rad * 1.05, 0, 0, TAU); ctx.fill();
      // belly
      ctx.fillStyle = body2; ctx.beginPath(); ctx.ellipse(0, 1, this.rad * 0.6, this.rad * 0.7, 0, 0, TAU); ctx.fill();
      // head
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(2, -7, 4.4, 0, TAU); ctx.fill();
      // snout
      ctx.fillStyle = body2; ctx.beginPath(); ctx.arc(5, -6, 2, 0, TAU); ctx.fill();
      // ear/horn
      ctx.fillStyle = '#3a2416'; ctx.beginPath(); ctx.moveTo(-1, -10); ctx.lineTo(1, -13); ctx.lineTo(2, -9); ctx.closePath(); ctx.fill();
      if (!flash) { ctx.fillStyle = '#ffe14a'; ctx.fillRect(2.5, -8, 1.6, 1.6); }
      // club when attacking
      if (this.attackWind > 0.15) { ctx.fillStyle = '#6b4a2b'; ctx.save(); ctx.translate(6, -4); ctx.rotate(-this.attackWind * 2); ctx.fillRect(0, -1.5, 8, 3); ctx.restore(); }
    }
    ctx.restore();

    // alert '!'
    if (this.alertPing > 0) {
      ctx.fillStyle = '#ffd23a'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('!', x, y - this.rad - 10 - bobY);
    }
    // hp bar when damaged
    if (this.hp < this.maxHp && this.state !== 'dead') {
      const w = 18, hpx = x - w / 2, hpy = y - this.rad - 8 - bobY;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(hpx, hpy, w, 3);
      ctx.fillStyle = '#e0483a'; ctx.fillRect(hpx, hpy, w * clamp(this.hp / this.maxHp, 0, 1), 3);
    }
  }
}

function withAlpha(hexOrRgb) {
  // accept '#rrggbb' -> {r,g,b}
  if (typeof hexOrRgb === 'string') {
    const h = hexOrRgb.replace('#', '');
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
  }
  return hexOrRgb;
}
