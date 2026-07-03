'use strict';
/* spawner.js — populates enemy camps as the player approaches and keeps a
   modest population of wandering enemies around the player (more at night). */

class Spawner {
  constructor() {
    this.wanderTimer = 1.5;
  }

  update(dt, game) {
    this._camps(dt, game);
    this._wanderers(dt, game);
  }

  _camps(dt, game) {
    const p = game.player;
    for (const camp of game.world.structures.camps) {
      const d = dist(p.x, p.y, camp.x, camp.y);
      if (!camp.spawned && !camp.cleared && d < 240) {
        camp.spawned = true;
        camp.enemies = [];
        const night = game.dayNight.night > 0.5;
        for (let i = 0; i < camp.size; i++) {
          const a = i / camp.size * TAU + Math.random();
          const ex = camp.x + Math.cos(a) * rand(18, 40);
          const ey = camp.y + Math.sin(a) * rand(18, 40);
          let kind = 'bokoblin';
          if (night && Math.random() < 0.4) kind = 'bokoblin_blue';
          if (Math.random() < 0.18) kind = 'octorok';
          const e = game.spawnEnemy(ex, ey, kind);
          if (e) { e.hx = ex; e.hy = ey; e.camp = camp; camp.enemies.push(e); }
        }
      }
      if (camp.spawned && !camp.cleared) {
        const anyAlive = camp.enemies.some(e => e.alive);
        if (!anyAlive && camp.enemies.length) {
          camp.cleared = true;
          // reward
          game.spawnPickup(camp.x, camp.y - 8, 'rupeeB');
          game.spawnPickup(camp.x + 10, camp.y - 4, 'heart');
          game.toast('Enemy camp cleared!');
        }
      }
    }
  }

  _wanderers(dt, game) {
    this.wanderTimer -= dt;
    const night = game.dayNight.night;
    const cap = 8 + Math.floor(night * 14) + (game.dayNight.bloodMoon > 0.3 ? 12 : 0);
    // count current wanderers
    let wander = 0;
    for (const e of game.enemies) if (e.isWanderer && e.alive) wander++;
    // despawn far wanderers
    const p = game.player;
    for (const e of game.enemies) {
      if (e.isWanderer && e.alive && dist(e.x, e.y, p.x, p.y) > 900) { e.state = 'dead'; e.deadT = 0; }
    }

    if (this.wanderTimer <= 0) {
      this.wanderTimer = rand(1.6, 3.2) / (1 + night);
      if (wander < cap) {
        const spawnPos = this._offscreenWalkable(game);
        if (spawnPos) {
          let kind = 'bokoblin';
          const roll = Math.random();
          if (night > 0.5) {
            if (roll < 0.25) kind = 'keese';
            else if (roll < 0.55) kind = 'bokoblin_blue';
            else if (roll < 0.7) kind = 'octorok';
            else kind = 'bokoblin';
          } else {
            if (roll < 0.15) kind = 'chuchu';
            else if (roll < 0.28) kind = 'octorok';
            else if (roll < 0.4) kind = 'keese';
            else kind = 'bokoblin';
          }
          const e = game.spawnEnemy(spawnPos.x, spawnPos.y, kind);
          if (e) { e.isWanderer = true; e.hx = spawnPos.x; e.hy = spawnPos.y; }
        }
      }
    }
  }

  _offscreenWalkable(game) {
    const p = game.player;
    const minR = game.view.w * 0.6, maxR = game.view.w * 0.85;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * TAU;
      const r = rand(minR, maxR);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x < TILE * 2 || y < TILE * 2 || x > game.world.pxW - TILE * 2 || y > game.world.pxH - TILE * 2) continue;
      const t = game.world.tileInfoAtWorld(x, y);
      if (t.solid || t.deep) continue;
      // not too close to spawn safe zone
      if (dist(x, y, game.world.spawn.x, game.world.spawn.y) < 160) continue;
      return { x, y };
    }
    return null;
  }
}
