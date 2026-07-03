'use strict';
/* projectile.js — arrows (player), rocks (octorok), and bombs (rune). */

class Projectile {
  constructor(x, y, angle, type, game) {
    this.x = x; this.y = y;
    this.type = type;
    this.angle = angle;
    this.dead = false;
    this.fromEnemy = false;
    this.spin = 0;
    if (type === 'arrow') {
      const sp = 340; this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
      this.dmg = 3; this.life = 1.4; this.rad = 3;
    } else if (type === 'rock') {
      const sp = 150; this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
      this.dmg = 0.75; this.life = 2.2; this.rad = 4;
    } else if (type === 'bomb') {
      this.vx = 0; this.vy = 0; this.timer = 1.7; this.rad = 5; this.life = 6;
    }
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { if (this.type === 'bomb') this._explode(game); this.dead = true; return; }

    if (this.type === 'bomb') {
      this.timer -= dt;
      // slide with friction
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      if (game.world.pointSolid(this.x, this.y, { deepSolid: false, cliffSolid: true })) { this.vx *= -0.3; this.vy *= -0.3; }
      if (this.timer <= 0) { this._explode(game); this.dead = true; }
      return;
    }

    // arrow / rock: substep to avoid tunneling
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * dt / steps;
      this.y += this.vy * dt / steps;
      if (game.world.pointSolid(this.x, this.y, { deepSolid: false, cliffSolid: true })) {
        game.particles.burst(this.x, this.y, '#c8b088', 5);
        this.dead = true; return;
      }
      if (this.fromEnemy) {
        const p = game.player;
        if (p.alive && circlesOverlap(this.x, this.y, this.rad, p.x, p.y, p.rad)) {
          p.damage(this.dmg, this.vx, this.vy, game);
          this.dead = true; return;
        }
      } else {
        for (const e of game.enemies) {
          if (!e.alive) continue;
          if (circlesOverlap(this.x, this.y, this.rad, e.x, e.y, e.rad)) {
            e.damage(this.dmg, this.vx, this.vy, 140, game);
            game.audio.play('hit');
            this.dead = true; return;
          }
        }
      }
    }
    this.spin += dt * 10;
  }

  _explode(game) {
    game.explode(this.x, this.y, 46, 5);
  }

  draw(ctx, game) {
    const x = this.x, y = this.y;
    if (this.type === 'bomb') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 5, 2, 0, 0, TAU); ctx.fill();
      const blink = this.timer < 0.6 && Math.floor(this.timer * 12) % 2 === 0;
      ctx.fillStyle = blink ? '#ff5a3a' : '#2f333a';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9a3a';
      ctx.beginPath(); ctx.arc(x + 3, y - 5, 1.6, 0, TAU); ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    if (this.type === 'arrow') {
      ctx.strokeStyle = '#c8a86a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = '#d8d8d8'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(2, -2.4); ctx.lineTo(2, 2.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-4, -2); ctx.moveTo(-7, 0); ctx.lineTo(-4, 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#7a6a58'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#96866f'; ctx.beginPath(); ctx.arc(-1, -1, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
