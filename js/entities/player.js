'use strict';
/* player.js — Link. Movement, stamina, climbing, swimming, gliding, melee,
   bow, bomb rune, hearts, temperature, and procedural rendering. */

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.rad = 5;
    this.facing = 'down';
    this.aim = HALF_PI; // radians
    this.walkPhase = 0;
    this.state = 'normal'; // normal | climb | swim | glide | dead

    this.maxHearts = 3;
    this.health = 3;
    this.maxStamina = 1;
    this.stamina = 1;
    this.staminaLock = false; // true after full depletion until refilled a bit

    this.weapons = [makeWeapon('sword')];
    this.wi = 0;
    this.hasBow = false;
    this.arrows = 0;
    this.bombCd = 0;
    this.bombReady = 4; // seconds cooldown

    this.rupees = 0;
    this.koroks = 0;
    this.shrines = 0;
    this.towersFound = 0;

    this.food = { apple: 0, meat: 0, mushroom: 0, cooked: 0 };

    this.invuln = 0;
    this.attackT = 0;      // remaining swing time
    this.attackCd = 0;
    this.swingArc = 0;     // animated swing angle offset
    this.swingWeapon = null; // weapon reference locked in for the current swing
    this.hitSet = null;    // enemies already hit this swing
    this.kbx = 0; this.kby = 0; // knockback velocity

    this.temp = 0;         // -1 cold .. +1 hot (environment)
    this.coldResist = 0;   // buff timer (seconds)
    this.chillDamageT = 0;
    this.glideT = 0;
    this.respawn = { x, y };
    this.deadTimer = 0;
    this.stepTimer = 0;
    this.swimSplashT = 0;
    this.toastCd = 0;

    // combat depth
    this.dodgeT = 0;       // active dodge-roll timer
    this.dodgeCd = 0;
    this.dodgeDir = { x: 1, y: 0 };
    this.flurry = 0;       // flurry-rush bonus window (seconds)
    // awakening (Super Saiyan)
    this.awaken = 0;       // seconds of transformation left
    this.awakenMeter = 0;  // 0..1 charge
    this.auraT = 0;
  }

  get weapon() { return this.weapons[this.wi]; }
  get alive() { return this.state !== 'dead'; }

  addFood(kind, n) { this.food[kind] = (this.food[kind] || 0) + (n || 1); }
  totalFood() { return this.food.apple + this.food.meat + this.food.mushroom + this.food.cooked; }

  heal(h) { this.health = clamp(this.health + h, 0, this.maxHearts); }

  giveWeapon(key) {
    const w = makeWeapon(key);
    // replace fists or add; cap inventory to 8
    this.weapons = this.weapons.filter(x => x.type !== 'fists');
    this.weapons.push(w);
    if (this.weapons.length > 8) this.weapons.shift();
    this.wi = this.weapons.length - 1;
  }

  cycleWeapon(dir) {
    if (this.weapons.length <= 1) return;
    this.wi = (this.wi + dir + this.weapons.length) % this.weapons.length;
  }

  awakenGain(amt) { if (this.awaken <= 0) this.awakenMeter = clamp(this.awakenMeter + amt, 0, 1); }
  canAwaken() { return this.awaken <= 0 && this.awakenMeter >= 1; }

  awakenActivate(game) {
    if (!this.canAwaken()) {
      if (this.toastCd <= 0) { game.toast(this.awaken > 0 ? 'Already awakened!' : 'Awaken meter not full.'); this.toastCd = 2; }
      return;
    }
    this.awaken = 12; this.awakenMeter = 0;
    this.invuln = Math.max(this.invuln, 0.8);
    this.stamina = this.maxStamina; this.staminaLock = false;
    game.audio.play('activate'); game.shake(9);
    game.addLight(this.x, this.y, 240, [255, 210, 90], 0.9);
    game.particles.burst(this.x, this.y - 4, '#ffe27a', 34);
    game.startSlowmo(0.5, 0.4);
    game.toast('⚡ AWAKENING! Power surges through you!');
    for (const e of game.enemies) if (e.alive && dist(this.x, this.y, e.x, e.y) < 92) { const k = angleTo(this.x, this.y, e.x, e.y); e.damage(4, Math.cos(k), Math.sin(k), 320, game); }
  }

  _dodge(game) {
    if (this.dodgeCd > 0 || this.dodgeT > 0 || this.state !== 'normal') return;
    if (this.stamina < 0.12 && this.awaken <= 0) return;
    this.dodgeT = 0.26; this.dodgeCd = 0.5;
    const mv = game.input.moveVector();
    let dx = mv.x, dy = mv.y;
    if (dx === 0 && dy === 0) { const f = vecFromFacing(this.facing); dx = f.x; dy = f.y; }
    const l = Math.hypot(dx, dy) || 1; this.dodgeDir = { x: dx / l, y: dy / l };
    this.invuln = Math.max(this.invuln, 0.3);
    if (this.awaken <= 0) this._drainStamina(0.12, game);
    game.particles.dustRing(this.x, this.y + 4);
    game.audio.play('swing');
    let threat = false;
    for (const e of game.enemies) if (e.alive && e.aggro && dist(this.x, this.y, e.x, e.y) < 36) { threat = true; break; }
    if (game.boss && dist(this.x, this.y, game.boss.x, game.boss.y) < game.boss.rad + 30) threat = true;
    if (threat) { this.flurry = 1.5; game.startSlowmo(1.4, 0.32); game.toast('Flurry Rush!'); game.addFloater(this.x, this.y - 16, 'DODGE!', '#8fd0ff', { size: 14 }); }
  }

  update(dt, game) {
    if (this.state === 'dead') { this.deadTimer -= dt; return; }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.coldResist = Math.max(0, this.coldResist - dt);
    this.toastCd = Math.max(0, this.toastCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.flurry = Math.max(0, this.flurry - dt);

    // awakening upkeep
    if (this.awaken > 0) {
      this.awaken -= dt;
      this.stamina = this.maxStamina; this.staminaLock = false;
      this.health = Math.min(this.maxHearts, this.health + dt * 0.35); // slow regen
      this.auraT -= dt;
      if (this.auraT <= 0) { this.auraT = 0.05; game.particles.aura(this.x + rand(-6, 6), this.y + rand(-4, 8)); }
      if (this.awaken <= 0) { game.toast('Awakening faded.'); game.particles.burst(this.x, this.y - 4, '#ffe27a', 12); }
    }

    // activate awakening
    if (game.input.wasPressed('KeyR')) this.awakenActivate(game);

    if (this.state === 'glide') { this._updateGlide(dt, game); return; }

    // --- dodge roll (overrides normal movement while active) ---
    if (game.input.wasPressed('Space') && this.state === 'normal') this._dodge(game);
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const spd = (this.awaken > 0 ? 300 : 250);
      const res = game.world.moveCircle(this.x, this.y, this.rad, this.dodgeDir.x * spd * dt, this.dodgeDir.y * spd * dt, { deepSolid: true });
      this.x = res.x; this.y = res.y;
      this.walkPhase += dt * 20;
      if (Math.random() < 0.5) game.particles.dust(this.x, this.y + 4, 0.5);
      this._postMoveCommon(dt, game, game.world.tileInfoAtWorld(this.x, this.y), false);
      return;
    }

    // --- knockback decay ---
    if (Math.abs(this.kbx) > 1 || Math.abs(this.kby) > 1) {
      const mv = game.world.moveCircle(this.x, this.y, this.rad, this.kbx * dt, this.kby * dt, {});
      this.x = mv.x; this.y = mv.y;
      this.kbx *= Math.pow(0.001, dt); this.kby *= Math.pow(0.001, dt);
    }

    const input = game.input;
    const mv = input.moveVector();
    const moving = (mv.x !== 0 || mv.y !== 0);

    // Aim: keyboard uses facing, but if mouse has moved, aim toward cursor for bow.
    if (moving) this.facing = facingFromVec(mv.x, mv.y);
    const face = vecFromFacing(this.facing);
    this.aim = Math.atan2(face.y, face.x);

    // --- terrain context ---
    const tile = game.world.tileInfoAtWorld(this.x, this.y);
    const onDeep = tile.deep;
    const onShallow = tile.shallow;

    // sprint
    const wantSprint = input.isDown('ShiftLeft', 'ShiftRight') && moving && !onDeep;
    let speed = 72;
    let sprinting = false;

    // --- climbing check ---
    const aheadX = this.x + face.x * (this.rad + 3);
    const aheadY = this.y + face.y * (this.rad + 3);
    const aheadTile = game.world.tileInfoAtWorld(aheadX, aheadY);
    const facingCliff = aheadTile.climb;

    if (this.state !== 'climb' && facingCliff && moving && this.stamina > 0.02 && !this.staminaLock) {
      this.state = 'climb';
    }

    if (this.state === 'climb') {
      speed = 42;
      // drain stamina while actively climbing
      const climbing = moving;
      if (climbing) this._drainStamina(dt * 0.26, game);
      const onCliffNow = game.world.tileInfoAtWorld(this.x, this.y).climb;
      const stillAdjacent = game.world.tileInfoAtWorld(this.x + face.x * (this.rad + 3), this.y + face.y * (this.rad + 3)).climb;
      // move allowing cliff traversal
      const res = game.world.moveCircle(this.x, this.y, this.rad, mv.x * speed * dt, mv.y * speed * dt, { cliffSolid: false, deepSolid: true });
      this.x = res.x; this.y = res.y;
      this.walkPhase += (climbing ? 1 : 0) * dt * 6;
      if (moving && ((this.walkPhase % 1) < dt * 6)) game.audio.play('climb');
      // exit conditions
      if (this.stamina <= 0.001) {
        // fall off: retreat back the way we climbed until on safe (non-cliff)
        // ground, so we never get left embedded inside a thick cliff band.
        this.state = 'normal';
        let bx = this.x, by = this.y;
        for (let s = 0; s < 24; s++) {
          const ti = game.world.tileInfoAtWorld(bx, by);
          if (!ti.climb && !ti.solid && !ti.deep) break;
          bx -= face.x * 3; by -= face.y * 3;
        }
        this.x = bx; this.y = by;
        this.kbx = 0; this.kby = 0;
        this.damage(0.5, 0, 0, game, true);
        game.toast('Out of stamina!');
      } else if (!onCliffNow && !stillAdjacent) {
        this.state = 'normal';
      }
      this._postMoveCommon(dt, game, tile, false);
      return;
    }

    // --- swimming ---
    if (onDeep) {
      this.state = 'swim';
      speed = 55;
      if (moving) this._drainStamina(dt * 0.16, game);
      this.swimSplashT -= dt;
      if (moving && this.swimSplashT <= 0) { this.swimSplashT = 0.35; game.particles.splash(this.x, this.y + 4); }
      if (this.stamina <= 0.001) {
        // drowning: damage + shove toward nearest shallow/land
        this.chillDamageT -= dt;
        if (this.chillDamageT <= 0) { this.chillDamageT = 1.0; this.damage(0.5, 0, 0, game, true); game.audio.play('splash'); }
        const push = this._towardLand(game);
        this.kbx = push.x * 90; this.kby = push.y * 90;
      }
    } else if (this.state === 'swim') {
      this.state = 'normal';
    }

    // --- normal / shallow movement ---
    if (this.state === 'normal' || this.state === 'swim') {
      if (wantSprint && !this.staminaLock && this.stamina > 0.001 && this.state === 'normal') {
        sprinting = true; speed = 122;
        this._drainStamina(dt * 0.34, game);
      } else if (this.state === 'normal') {
        speed = 72;
      }
      speed *= tile.speed || 1;
      if (this.awaken > 0) speed *= 1.4; // awakening boosts movement
      const res = game.world.moveCircle(this.x, this.y, this.rad, mv.x * speed * dt, mv.y * speed * dt, { deepSolid: false, cliffSolid: true });
      this.x = res.x; this.y = res.y;
      if (moving) {
        this.walkPhase += dt * (sprinting ? 12 : 8);
        this.stepTimer -= dt;
        if (this.stepTimer <= 0 && this.state === 'normal') {
          this.stepTimer = sprinting ? 0.22 : 0.32;
          if (!onShallow) game.particles.dust(this.x, this.y + 4);
          else game.particles.splash(this.x, this.y + 4);
        }
      } else {
        this.walkPhase = 0;
      }
    }

    // stamina regen
    if (!sprinting && this.state !== 'climb' && !(onDeep && moving)) {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * (this.staminaLock ? 0.55 : 0.5));
      if (this.staminaLock && this.stamina > this.maxStamina * 0.3) this.staminaLock = false;
    }

    // --- actions ---
    if (input.wasPressed('KeyJ') || input.mouse.leftPressed) this._attack(game);
    if (input.wasPressed('KeyK') || input.mouse.rightPressed) this._shootBow(game);
    if (input.wasPressed('KeyB')) this._throwBomb(game);
    if (input.wasPressed('KeyQ')) this.cycleWeapon(1);
    if (input.wasPressed('KeyF')) this.quickEat(game);

    // swing timer
    if (this.attackT > 0) {
      this.attackT -= dt;
      this._applyAttack(game);
    }

    this._postMoveCommon(dt, game, tile, sprinting);
  }

  _postMoveCommon(dt, game, tile, sprinting) {
    // temperature
    let target = 0;
    if (tile.cold) target = -1;
    // near a fire warms up
    let nearFire = false;
    game.world.forEachObjectIn(this.x - 60, this.y - 60, this.x + 60, this.y + 60, (o) => {
      if (o.dead) return;
      if (o.type === 'campfire' || o.type === 'cookpot') { if (dist(this.x, this.y, o.x, o.y) < 46) nearFire = true; }
    });
    if (nearFire) target = 0.6;
    this.temp = approach(this.temp, target, dt * 0.5);
    const cold = this.temp < -0.35 && this.coldResist <= 0 && !nearFire;
    if (cold) {
      this.chillDamageT -= dt;
      if (this.chillDamageT <= 0) { this.chillDamageT = 2.2; this.damage(0.25, 0, 0, game, true); if (this.toastCd <= 0) { game.toast('You are freezing! Find warmth.'); this.toastCd = 4; } }
    }
  }

  _updateGlide(dt, game) {
    this.glideT -= dt;
    const input = game.input;
    const mv = input.moveVector();
    let dx = mv.x, dy = mv.y;
    if (dx === 0 && dy === 0) { const f = vecFromFacing(this.facing); dx = f.x; dy = f.y; }
    if (mv.x !== 0 || mv.y !== 0) this.facing = facingFromVec(mv.x, mv.y);
    const spd = 205;
    // glide flies over everything (no collision), but clamp to world bounds
    this.x = clamp(this.x + dx * spd * dt, TILE, game.world.pxW - TILE);
    this.y = clamp(this.y + dy * spd * dt, TILE, game.world.pxH - TILE);
    this.walkPhase += dt * 3;
    if (Math.random() < 0.3) game.particles.dust(this.x + rand(-6, 6), this.y + 10, 0.4);
    // land on press or when timer ends over walkable ground
    const wantLand = input.wasPressed('KeyE');
    const groundOK = !game.world.tileInfoAtWorld(this.x, this.y).deep && !game.world.tileInfoAtWorld(this.x, this.y).solid;
    if ((this.glideT <= 0 && groundOK) || (wantLand && groundOK)) {
      this.state = 'normal';
      game.particles.dustRing(this.x, this.y + 4);
      // Consume the land press so the same edge can't also fire an interaction
      // (e.g. re-launching the glide) later this frame.
      if (wantLand) input.consume('KeyE');
    } else if (this.glideT <= -6) {
      // forced landing (nudge to nearest walkable)
      this.state = 'normal';
    }
  }

  startGlide(game) {
    if (this.state === 'glide') return;
    this.state = 'glide';
    this.glideT = 5.0;
    this.invuln = 5.5;
    game.audio.play('glide');
    game.toast('Paragliding! Steer with WASD, press E to land.');
  }

  _towardLand(game) {
    // sample directions, pick one heading toward shallow/land
    let best = { x: 0, y: -1 }, bestScore = -1;
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * TAU;
      const sx = this.x + Math.cos(ang) * 40, sy = this.y + Math.sin(ang) * 40;
      const t = game.world.tileInfoAtWorld(sx, sy);
      const score = t.deep ? 0 : (t.solid ? 0.3 : 1);
      if (score > bestScore) { bestScore = score; best = { x: Math.cos(ang), y: Math.sin(ang) }; }
    }
    return best;
  }

  _drainStamina(amt, game) {
    this.stamina -= amt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.staminaLock = true;
    }
  }

  _attack(game) {
    if (this.attackCd > 0 || this.attackT > 0) return;
    const w = this.weapon;
    this.attackT = w.swing;
    this.attackCd = w.swing + 0.08;
    this.hitSet = new Set();
    this.swingArc = -w.arc / 2;
    this.swingWeapon = w; // lock stats for this swing even if the weapon breaks now
    this._swingId = (this._swingId || 0) + 1;
    game.audio.play('swing');
    // durability
    if (w.type !== 'fists' && isFinite(w.dur)) {
      w.dur -= 1;
      if (w.dur <= 0) {
        game.audio.play('break');
        game.toast(w.name + ' broke!');
        this.weapons.splice(this.wi, 1);
        if (this.weapons.length === 0) this.weapons.push(makeWeapon('fists'));
        this.wi = clamp(this.wi, 0, this.weapons.length - 1);
      }
    }
  }

  _applyAttack(game) {
    const w = this.swingWeapon || this.weapon;
    const t = 1 - this.attackT / w.swing; // 0..1 through swing
    this.swingArc = lerp(-w.arc / 2, w.arc / 2, t);
    const ang = this.aim;
    const dmgMul = (this.awaken > 0 ? 2 : 1) * (this.flurry > 0 ? 2 : 1);
    const dmg = w.dmg * dmgMul;
    for (const e of game.enemies) {
      if (!e.alive || this.hitSet.has(e)) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > w.reach + e.rad) continue;
      const toE = angleTo(this.x, this.y, e.x, e.y);
      if (Math.abs(angDiff(ang, toE)) <= w.arc / 2 + 0.15) {
        this.hitSet.add(e);
        const kx = Math.cos(toE), ky = Math.sin(toE);
        e.damage(dmg, kx, ky, w.knock, game);
        if (w.element && e.alive) e.applyStatus(w.element, game);
        game.audio.play('hit');
        game.particles.hit(e.x, e.y);
        if (w.elemCol) game.particles.burst(e.x, e.y - 2, w.elemCol, 6);
        game.hitStop(0.05);
        game.addCombo(1);
      }
    }
    // boss weak-point (armoured body just clangs)
    if (game.boss && !this.hitSet.has(game.boss)) {
      const hit = game.boss.meleeHit(this, { dmg, reach: w.reach, arc: w.arc, element: w.element }, game, this._swingId);
      if (hit) { this.hitSet.add(game.boss); game.addCombo(1); }
    }
    // cut grass / hit boulders in arc
    game.world.forEachObjectIn(this.x - w.reach - 8, this.y - w.reach - 8, this.x + w.reach + 8, this.y + w.reach + 8, (o) => {
      if (o.dead) return;
      const d = dist(this.x, this.y, o.x, o.y);
      if (d > w.reach + (o.r || 6)) return;
      const toO = angleTo(this.x, this.y, o.x, o.y);
      if (Math.abs(angDiff(ang, toO)) > w.arc / 2 + 0.2) return;
      if (o.cut && !o._cutHit) { o._cutHit = true; game.cutGrass(o); }
      else if (o.breakable && w.type === 'claymore') { /* claymore can smash boulders slowly */ o.hp -= 0.34; game.particles.hit(o.x, o.y - 6); if (o.hp <= 0) game.breakBoulder(o); }
    });
  }

  _shootBow(game) {
    if (!this.hasBow) { if (this.toastCd <= 0) { game.toast('You need a bow.'); this.toastCd = 2; } return; }
    if (this.arrows <= 0) { if (this.toastCd <= 0) { game.toast('Out of arrows!'); this.toastCd = 2; } return; }
    if (this.attackCd > 0) return;
    this.attackCd = 0.35;
    this.arrows--;
    let ang = this.aim;
    if (game.input.mouse.moved) ang = angleTo(this.x, this.y, game.mouseWorld.x, game.mouseWorld.y);
    this.facing = facingFromVec(Math.cos(ang), Math.sin(ang));
    game.spawnProjectile(new Projectile(this.x, this.y, ang, 'arrow', game));
    game.audio.play('bow');
  }

  _throwBomb(game) {
    if (this.bombCd > 0) return;
    this.bombCd = this.bombReady;
    const f = vecFromFacing(this.facing);
    const b = new Projectile(this.x + f.x * 10, this.y + f.y * 10, this.aim, 'bomb', game);
    b.vx = f.x * 90; b.vy = f.y * 90;
    game.spawnProjectile(b);
    game.audio.play('bomb');
  }

  quickEat(game) {
    let kind = null;
    if (this.food.cooked > 0) kind = 'cooked';
    else if (this.food.meat > 0) kind = 'meat';
    else if (this.food.mushroom > 0) kind = 'mushroom';
    else if (this.food.apple > 0) kind = 'apple';
    if (!kind) { if (this.toastCd <= 0) { game.toast('No food to eat.'); this.toastCd = 2; } return; }
    if (this.health >= this.maxHearts && kind !== 'cooked') { if (this.toastCd <= 0) { game.toast('Health already full.'); this.toastCd = 2; } return; }
    this.food[kind]--;
    const heals = { apple: 0.5, mushroom: 0.75, meat: 1.5, cooked: 3 };
    this.heal(heals[kind]);
    if (kind === 'cooked') this.coldResist = 60; // cooked meals warm you
    game.audio.play('heart');
    game.particles.heal(this.x, this.y);
    game.toast('Ate ' + kind + (kind === 'cooked' ? ' (warm!)' : '') + '.');
  }

  damage(amount, kx, ky, game, ignoreInvuln) {
    if (this.state === 'dead' || this.state === 'glide') return;
    if (this.invuln > 0 && !ignoreInvuln) return;
    this.health = Math.max(0, this.health - amount);
    if (!ignoreInvuln) {
      this.invuln = 0.8;
      const l = Math.hypot(kx, ky) || 1;
      this.kbx = (kx / l) * 150; this.kby = (ky / l) * 150;
    }
    game.audio.play('hurt');
    game.shake(4);
    if (this.health <= 0) this._die(game);
  }

  _die(game) {
    this.state = 'dead';
    this.deadTimer = 2.2;
    game.audio.play('enemyDie');
    game.onPlayerDied();
  }

  respawnNow(game) {
    this.state = 'normal';
    this.x = this.respawn.x; this.y = this.respawn.y;
    this.health = this.maxHearts;
    this.stamina = this.maxStamina;
    this.staminaLock = false;
    this.invuln = 1.5;
    this.kbx = this.kby = 0;
    this.temp = 0;
  }

  /* ---------------- rendering ---------------- */
  draw(ctx, game) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const swim = this.state === 'swim';
    const climb = this.state === 'climb';
    const glide = this.state === 'glide';

    // shadow
    if (!swim && !glide) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 6, 3, 0, 0, TAU); ctx.fill();
    }

    // awakening: golden flame aura around Link
    if (this.awaken > 0) {
      const tt = game._time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + tt * 4;
        const rr = 11 + Math.sin(tt * 12 + i) * 3;
        ctx.fillStyle = `rgba(255,${200 + (i % 2) * 40},90,0.5)`;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 6, y - 2 + Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a) * rr, y - 2 + Math.sin(a) * rr);
        ctx.lineTo(x + Math.cos(a + 0.4) * 6, y - 2 + Math.sin(a + 0.4) * 6);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // flashing on i-frames
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0 && this.state !== 'dead') {
      // skip drawing body this frame (blink)
    } else {
      ctx.save();
      ctx.translate(x, y);
      const bob = Math.sin(this.walkPhase) * (this.state === 'normal' || climb ? 1 : 0);
      if (this.state === 'dead') { ctx.globalAlpha = clamp(this.deadTimer / 2.2, 0, 1); ctx.rotate(0.4); }
      this._drawLink(ctx, bob, swim, climb, glide, game);
      ctx.restore();
    }

    // glide sail (drawn after body, above)
    if (glide) {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#c8703a';
      ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(0, -26, 14, -18); ctx.lineTo(9, -14); ctx.quadraticCurveTo(0, -18, -9, -14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0b060';
      ctx.fillRect(-2, -18, 4, 4);
      ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(-3, -4); ctx.moveTo(9, -14); ctx.lineTo(3, -4); ctx.stroke();
      ctx.restore();
    }
  }

  _drawLink(ctx, bob, swim, climb, glide, game) {
    const f = this.facing;
    const flip = f === 'left';
    if (flip) ctx.scale(-1, 1);
    const side = (f === 'left' || f === 'right');
    const up = f === 'up';

    const skin = '#e8b98a', tunic = '#3f8f4a', tunicD = '#2f7038', hair = '#c8912f', cap = '#3f8f4a', boot = '#6b4a2b';
    const legPhase = Math.sin(this.walkPhase);

    if (swim) {
      // ripple + upper body only
      ctx.strokeStyle = 'rgba(220,240,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 5, 8, 3, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = tunic; ctx.fillRect(-4, -2, 8, 6);
      // head
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -6, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = cap; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(6, -14); ctx.closePath(); ctx.fill();
      if (!up) { ctx.fillStyle = '#222'; ctx.fillRect(1, -7, 1.4, 1.4); }
      return;
    }

    // legs
    ctx.fillStyle = boot;
    if (climb) {
      ctx.fillRect(-4, 0, 3, 6 + Math.max(0, legPhase) * 2);
      ctx.fillRect(1, 0, 3, 6 + Math.max(0, -legPhase) * 2);
    } else {
      ctx.fillRect(-3.5, 2 + bob, 3, 5 + legPhase * 1.5);
      ctx.fillRect(0.5, 2 + bob, 3, 5 - legPhase * 1.5);
    }

    // body / tunic
    ctx.fillStyle = tunic;
    ctx.beginPath();
    ctx.moveTo(-5, 3 + bob); ctx.lineTo(5, 3 + bob); ctx.lineTo(4, -4 + bob); ctx.lineTo(-4, -4 + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tunicD; ctx.fillRect(-1, -4 + bob, 2, 7); // center seam
    ctx.fillStyle = '#caa24a'; ctx.fillRect(-5, 1 + bob, 10, 1.5); // belt

    // arms (attack pose reaches out)
    ctx.fillStyle = skin;
    if (this.attackT > 0) {
      ctx.fillRect(3, -3 + bob, 4, 2.5);
    } else {
      ctx.fillRect(-6, -2 + bob, 2.5, 4);
      ctx.fillRect(3.5, -2 + bob, 2.5, 4);
    }

    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -8 + bob, 4.2, 0, TAU); ctx.fill();
    // hair
    ctx.fillStyle = hair;
    if (up) { ctx.beginPath(); ctx.arc(0, -8 + bob, 4.4, 0, TAU); ctx.fill(); }
    else { ctx.fillRect(-4.4, -11 + bob, 8.8, 3); ctx.fillRect(-4.6, -9 + bob, 2, 4); }
    // cap
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.moveTo(-4.6, -9 + bob); ctx.lineTo(4.6, -9 + bob); ctx.lineTo(side ? 9 : 2, -17 + bob); ctx.closePath(); ctx.fill();
    // face
    if (!up) {
      ctx.fillStyle = '#3a2a1a';
      if (side) { ctx.fillRect(2, -8 + bob, 1.4, 1.6); }
      else { ctx.fillRect(-2.4, -8 + bob, 1.4, 1.6); ctx.fillRect(1, -8 + bob, 1.4, 1.6); }
    }

    // weapon swing arc
    if (this.attackT > 0) {
      const w = this.swingWeapon || this.weapon;
      // draw relative to un-flipped space using aim; simplest: draw a slash arc in facing
      ctx.save();
      // aim relative to sprite: if flipped we already scaled; approximate by facing
      const baseAng = up ? -HALF_PI : (side ? 0 : HALF_PI);
      ctx.rotate(baseAng + this.swingArc);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -2, w.reach * 0.7, -0.5, 0.5); ctx.stroke();
      // weapon icon along the arc
      const icon = game.sprites.icon[w.icon];
      if (icon) { ctx.drawImage(icon, w.reach * 0.55 - 8, -2 - 8); }
      ctx.restore();
    }

    if (climb) {
      // reaching arms up
      ctx.fillStyle = skin;
      ctx.fillRect(-5, -10 + bob, 2.5, 4);
      ctx.fillRect(2.5, -12 + bob, 2.5, 4);
    }
  }
}

function rand(a, b) { return a + Math.random() * (b - a); }
