'use strict';
/* pickup.js — collectible items dropped in the world (hearts, rupees, arrows,
   food, korok seeds, weapons). Bob, magnetize to the player, auto-collect. */

const PICKUP_ICON = {
  heart: 'heart', rupeeG: 'rupeeGreen', rupeeB: 'rupeeBlue', rupeeR: 'rupeeRed',
  arrows: 'arrow', apple: 'apple', meat: 'meat', mushroom: 'mushroom', korok: 'korok',
  stamina: 'stamina', bomb: 'bomb',
};

class Pickup {
  constructor(x, y, type, key) {
    this.x = x; this.y = y;
    this.type = type;         // heart|rupeeG|...|weapon
    this.key = key || null;   // weapon key when type==='weapon'
    this.dead = false;
    this.bob = Math.random() * TAU;
    this.spawnPop = 1;        // launch animation
    this.vx = rand(-24, 24); this.vy = rand(-30, -10);
    this.life = 30;           // seconds before it fades (koroks/weapons never expire)
    this.persistent = (type === 'korok' || type === 'weapon');
    this.z = 6;               // hop height
    this.vz = rand(30, 60);
    this.settled = false;
  }

  update(dt, game) {
    this.bob += dt * 4;
    if (this.spawnPop > 0) this.spawnPop = Math.max(0, this.spawnPop - dt * 3);
    // little hop physics for a nice pop
    if (!this.settled) {
      this.z += this.vz * dt; this.vz -= 220 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
      if (this.z <= 0) { this.z = 0; this.vz *= -0.4; if (Math.abs(this.vz) < 12) { this.settled = true; this.vz = 0; } }
    }
    if (!this.persistent) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
    }
    const p = game.player;
    if (!p.alive) return;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < 40 && this.settled) {
      // magnetize
      const a = angleTo(this.x, this.y, p.x, p.y);
      const pull = (1 - d / 40) * 160;
      this.x += Math.cos(a) * pull * dt;
      this.y += Math.sin(a) * pull * dt;
    }
    if (d < p.rad + 7) this._collect(game);
  }

  _collect(game) {
    const p = game.player;
    this.dead = true;
    switch (this.type) {
      case 'heart': p.heal(1); game.audio.play('heart'); break;
      case 'rupeeG': p.rupees += 1; game.audio.play('rupee'); break;
      case 'rupeeB': p.rupees += 5; game.audio.play('rupee'); break;
      case 'rupeeR': p.rupees += 20; game.audio.play('rupee'); break;
      case 'arrows': p.arrows += 5; game.audio.play('pickup'); game.toast('+5 Arrows'); break;
      case 'apple': p.addFood('apple'); game.audio.play('pickup'); break;
      case 'meat': p.addFood('meat'); game.audio.play('pickup'); break;
      case 'mushroom': p.addFood('mushroom'); game.audio.play('pickup'); break;
      case 'korok': p.koroks += 1; game.audio.play('korok'); game.toast('Ya-ha-ha! Korok seeds: ' + p.koroks); break;
      case 'weapon': p.giveWeapon(this.key); game.audio.play('pickup'); game.toast('Got ' + (WEAPONS[this.key] ? WEAPONS[this.key].name : 'a weapon') + '!'); break;
      default: game.audio.play('pickup');
    }
    game.particles.spark(this.x, this.y);
  }

  draw(ctx, game) {
    const iconName = this.type === 'weapon' ? (WEAPONS[this.key] ? WEAPONS[this.key].icon : 'sword') : PICKUP_ICON[this.type];
    const icon = game.sprites.icon[iconName];
    const bobY = Math.sin(this.bob) * 1.5;
    const yy = this.y - this.z - bobY;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, 5 - this.z * 0.05, 2, 0, 0, TAU); ctx.fill();
    if (this.type === 'korok') {
      // gentle glow
      ctx.fillStyle = 'rgba(150,220,120,0.25)';
      ctx.beginPath(); ctx.arc(this.x, yy, 9, 0, TAU); ctx.fill();
    }
    if (icon) {
      const s = 1 + this.spawnPop * 0.6;
      ctx.drawImage(icon, Math.round(this.x - 8 * s), Math.round(yy - 8 * s), 16 * s, 16 * s);
    }
    // blink when about to expire
    if (!this.persistent && this.life < 5 && Math.floor(this.life * 6) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(this.x - 8, yy - 8, 16, 16);
    }
  }
}
