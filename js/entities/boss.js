'use strict';
/* boss.js — Stone Talus: a hulking rock golem. Its body is armoured (melee just
   clangs); damage lands only on the glowing ore weak-point that rotates around
   it. It stomps a shockwave and hurls boulders. Beating it grants a Heart
   Container and a mighty elemental weapon. */

class Boss {
  constructor(x, y, game, ref) {
    this.x = x; this.y = y;
    this.ref = ref;             // the world talus marker
    this.rad = 26;
    this.maxHp = 140; this.hp = 140;
    this.state = 'active';      // active | slam | hurt | dead
    this.dead = false; this.deadT = 0;
    this.oreAng = 0;            // ore orbit angle
    this.oreDist = 26;
    this.bodyBob = 0;
    this.moveT = 0; this.mvx = 0; this.mvy = 0;
    this.attackT = rand(2, 4);
    this.slamT = 0;             // slam windup timer
    this.flash = 0;
    this.hurtT = 0;
    this.hitBy = null;          // swing id already applied
    this.rageShown = false;
  }

  get alive() { return this.state !== 'dead'; }
  orePos() { return { x: this.x + Math.cos(this.oreAng) * this.oreDist, y: this.y - 10 + Math.sin(this.oreAng) * this.oreDist * 0.5 }; }

  update(dt, game) {
    if (this.state === 'dead') { this.deadT -= dt; return; }
    const p = game.player;
    this.bodyBob += dt * 3;
    this.flash = Math.max(0, this.flash - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    // ore rotates faster when enraged (low hp)
    const rage = this.hp < this.maxHp * 0.4;
    this.oreAng += dt * (rage ? 1.1 : 0.6);
    if (rage && !this.rageShown) { this.rageShown = true; game.toast('The Talus is enraged!'); game.shake(6); }

    const d = dist(this.x, this.y, p.x, p.y);

    // slow lumbering pursuit
    this.moveT -= dt;
    if (this.moveT <= 0) { this.moveT = rand(1.5, 3); const a = angleTo(this.x, this.y, p.x, p.y) + rand(-0.6, 0.6); this.mvx = Math.cos(a); this.mvy = Math.sin(a); }
    if (this.state === 'active') {
      const sp = rage ? 26 : 18;
      const res = game.world.moveCircle(this.x, this.y, this.rad, this.mvx * sp * dt, this.mvy * sp * dt, { deepSolid: true });
      this.x = res.x; this.y = res.y;
    }

    // attacks
    this.attackT -= dt;
    if (this.state === 'active' && this.attackT <= 0) {
      if (d < 90) { this.state = 'slam'; this.slamT = 0.8; }
      else { this._throw(game); this.attackT = rand(2.2, 3.5); }
    }
    if (this.state === 'slam') {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.state = 'active'; this.attackT = rand(2.5, 4);
        game.shake(10); game.audio.play('explode');
        game.particles.explosion(this.x, this.y + 8);
        game.addLight(this.x, this.y, 120, [200, 170, 120], 0.3);
        // shockwave ring damage
        if (p.alive && dist(this.x, this.y, p.x, p.y) < 74) {
          const k = angleTo(this.x, this.y, p.x, p.y);
          p.damage(1.5, Math.cos(k), Math.sin(k), game);
        }
      }
    }

    // contact shove
    if (p.alive && circlesOverlap(this.x, this.y, this.rad, p.x, p.y, p.rad) && p.invuln <= 0) {
      const k = angleTo(this.x, this.y, p.x, p.y);
      p.damage(1, Math.cos(k), Math.sin(k), game);
    }
  }

  _throw(game) {
    const p = game.player;
    const a = angleTo(this.x, this.y - 10, p.x, p.y);
    const pr = new Projectile(this.x, this.y - 14, a, 'rock', game);
    pr.fromEnemy = true; pr.dmg = 1.25; pr.rad = 6;
    pr.vx = Math.cos(a) * 130; pr.vy = Math.sin(a) * 130;
    game.spawnProjectile(pr);
    game.audio.play('bomb');
  }

  // melee from the player. Returns true if the ore was struck.
  meleeHit(player, w, game, swingId) {
    if (this.state === 'dead') return false;
    if (this.hitBy === swingId) return false;
    const ore = this.orePos();
    const ang = player.aim;
    // must be facing the ore and within reach
    const dOre = dist(player.x, player.y, ore.x, ore.y);
    const toOre = angleTo(player.x, player.y, ore.x, ore.y);
    const dBody = dist(player.x, player.y, this.x, this.y);
    if (dOre < w.reach + 10 && Math.abs(angDiff(ang, toOre)) < w.arc / 2 + 0.4) {
      this.hitBy = swingId;
      this._takeDamage(w.dmg * 2, ore.x, ore.y, game);
      return true;
    }
    // hitting the armoured body just clangs
    if (dBody < w.reach + this.rad && Math.abs(angDiff(ang, angleTo(player.x, player.y, this.x, this.y))) < w.arc / 2 + 0.3) {
      this.hitBy = swingId;
      game.particles.spark(player.x + Math.cos(ang) * this.rad, player.y + Math.sin(ang) * this.rad);
      game.audio.play('break');
      game.addFloater(this.x, this.y - 30, 'clang!', '#c8c8c8', { size: 11 });
    }
    return false;
  }

  // arrow / projectile hit test (called from Projectile)
  projHit(px, py, dmg, game) {
    if (this.state === 'dead') return false;
    const ore = this.orePos();
    if (dist(px, py, ore.x, ore.y) < 12) { this._takeDamage(dmg * 2, ore.x, ore.y, game); return true; }
    if (dist(px, py, this.x, this.y) < this.rad) { game.particles.spark(px, py); return true; } // blocked by body
    return false;
  }

  _takeDamage(amount, hx, hy, game) {
    this.hp -= amount;
    this.flash = 0.12; this.hurtT = 0.15;
    game.particles.burst(hx, hy, '#f0c060', 12);
    game.audio.play('hit');
    game.hitStop(0.05); game.shake(4);
    game.addFloater(hx, hy - 8, Math.round(amount), '#ffe27a', { size: 15 });
    game.player.awakenGain(0.04);
    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.state = 'dead'; this.dead = true; this.deadT = 1.4;
    if (this.ref) this.ref.defeated = true;
    game.audio.play('enemyDie'); game.shake(12);
    game.particles.explosion(this.x, this.y);
    for (let i = 0; i < 5; i++) game.particles.burst(this.x + rand(-20, 20), this.y + rand(-16, 16), '#8b857e', 14);
    // rewards
    const p = game.player;
    p.maxHearts++; p.heal(p.maxHearts);
    game.toast('Stone Talus defeated! ♥ Heart Container obtained!');
    const elem = game.rngPick(['fire', 'ice', 'shock']);
    game.spawnPickup(this.x, this.y + 6, 'weapon', 'claymore_' + elem);
    for (let i = 0; i < 6; i++) game.spawnPickup(this.x + rand(-20, 20), this.y + rand(-10, 10), 'rupeeR');
    game.spawnPickup(this.x, this.y, 'heart');
  }

  draw(ctx, game) {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.state === 'dead') {
      ctx.globalAlpha = clamp(this.deadT / 1.4, 0, 1);
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 14, this.rad * 1.1, this.rad * 0.45, 0, 0, TAU); ctx.fill();

    const lift = this.state === 'slam' ? -Math.sin((0.8 - this.slamT) / 0.8 * Math.PI) * 8 : 0;
    const by = y + lift + Math.sin(this.bodyBob) * 1.2;
    const flash = this.flash > 0;

    // rocky body (cluster of boulders)
    const base = flash ? '#efe8dc' : '#7d766e';
    const lite = flash ? '#ffffff' : '#948d84';
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(x - this.rad, by + 10);
    ctx.lineTo(x - this.rad + 4, by - this.rad);
    ctx.lineTo(x - 6, by - this.rad - 6);
    ctx.lineTo(x + 10, by - this.rad);
    ctx.lineTo(x + this.rad, by - 4);
    ctx.lineTo(x + this.rad - 3, by + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = lite;
    ctx.beginPath(); ctx.moveTo(x - 10, by - 14); ctx.lineTo(x + 4, by - 20); ctx.lineTo(x + 12, by - 8); ctx.lineTo(x - 2, by - 2); ctx.closePath(); ctx.fill();
    // eyes
    if (!flash) { ctx.fillStyle = '#ffcf3a'; ctx.fillRect(x - 8, by - 6, 3, 3); ctx.fillRect(x + 4, by - 6, 3, 3); }
    // legs
    ctx.fillStyle = flash ? '#efe8dc' : '#635d57';
    ctx.fillRect(x - 14, by + 8, 7, 8); ctx.fillRect(x + 7, by + 8, 7, 8);

    // ore weak-point
    const ore = this.orePos();
    const ox = Math.round(ore.x), oy = Math.round(ore.y + lift);
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, TAU); ctx.fill();
    const glow = 0.6 + Math.sin(game._time * 6) * 0.3;
    ctx.fillStyle = `rgba(255,${120 + glow * 80 | 0},60,1)`;
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(ox - 1, oy - 1, 2, 0, TAU); ctx.fill();

    // slam telegraph ring
    if (this.state === 'slam') {
      ctx.strokeStyle = `rgba(255,120,60,${0.4 + Math.sin(game._time * 30) * 0.3})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y + 6, 74, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // hp bar
    if (this.state !== 'dead') {
      const bw = 120, bx = x - bw / 2, byy = y - this.rad - 34;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 2, byy - 2, bw + 4, 10);
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(bx, byy, bw, 6);
      ctx.fillStyle = '#e0642a'; ctx.fillRect(bx, byy, bw * clamp(this.hp / this.maxHp, 0, 1), 6);
      ctx.fillStyle = '#e8eef2'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('STONE TALUS', x, byy - 5);
    }
  }
}
