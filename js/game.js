'use strict';
/* game.js — orchestrates everything: state machine, camera, update/render,
   interactions, combat helpers, spawning, day/night, save/load. */

const TARGET_TILES_TALL = 24;
const INTERACT_RANGE = 26;
const SAVE_KEY = 'wilderland_save_v1';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new AudioFX();
    this.sprites = new SpriteBank();
    this.touch = new TouchControls(this.input, this);
    this._menuRects = [];

    this.state = 'title';
    this.prevState = 'title';
    this.menuIndex = 0;
    this.titleOptions = ['Start Game', 'How to Play', 'New World'];
    this.pauseOptions = ['Resume', 'Open Map', 'How to Play', 'Sound: On', 'Music: On', 'Return to Title'];

    this.camera = { x: 0, y: 0 };
    this.view = { x: 0, y: 0, w: 100, h: 100 };
    this.zoom = 2;
    this.mouseWorld = { x: 0, y: 0 };

    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.particles = new Particles();
    this.toasts = [];
    this.currentInteract = null;

    this.shakeAmt = 0;
    this.hitstop = 0;
    this.saveTimer = 8;
    this._time = 0;
    this.timeScale = 1;
    this.slowmoT = 0; this.slowmoScale = 1;
    this.lighting = new Lighting();
    this.ambient = new Ambient();
    this.lights = [];
    this.floaters = [];
    this.combo = 0; this.comboTimer = 0; this.comboBest = 0;

    this.resize();
    // Resume the saved world if there is one, otherwise roll a fresh seed.
    const savedSeed = this._savedSeed();
    this._newWorld(savedSeed !== null ? savedSeed : this._randomSeed(), true);
  }

  _randomSeed() { return Math.floor((performance.now() * 1000) % 2147483647) ^ (this._seedSalt = (this._seedSalt || 12345) * 16807 % 2147483647); }

  _savedSeed() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return (typeof d.seed === 'number' && isFinite(d.seed)) ? d.seed : null;
    } catch (e) { return null; }
  }

  _newWorld(seed, tryLoad) {
    const data = generateWorld(seed);
    this.world = new World(data, this.sprites);
    this.minimap = new Minimap(this.world);
    this.player = new Player(this.world.spawn.x, this.world.spawn.y);
    this.dayNight = new DayNight(8);
    this.weather = new Weather(new RNG((seed ^ 0xBEEF) >>> 0));
    this.spawner = new Spawner();
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    this.enemies.length = 0; this.pickups.length = 0; this.projectiles.length = 0;
    this.lights.length = 0; this.floaters.length = 0;
    this.combo = 0; this.comboTimer = 0;
    this.boss = null;
    this.toasts.length = 0;
    this.dayNight.onBloodMoon = () => this._bloodMoon();
    // reveal spawn area
    this.minimap.revealAroundWorld(this.player.x, this.player.y, 22);
    this._giveStarterKit();
    if (tryLoad) this._load(seed);
    this._centerCamera();
  }

  _giveStarterKit() {
    const p = this.player;
    p.addFood('apple', 3);
    // a cook pot & shrine near spawn help onboarding; give a couple arrows too
    p.arrows = 0;
  }

  /* ---------------- lifecycle ---------------- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.W = w; this.H = h;
    this.zoom = clamp(Math.round(h / (TILE * TARGET_TILES_TALL)), 2, 4);
    this.ctx.imageSmoothingEnabled = false;
  }

  startGame() {
    this.state = 'playing';
    this.audio.unlock();
    this.toast('Welcome to Wilderland!');
    this.toast('Climb a tower to reveal the map.');
  }

  toast(msg) {
    this.toasts.unshift({ msg, life: 2.6, t0: 2.6 });
    if (this.toasts.length > 4) this.toasts.pop();
  }

  shake(a) { this.shakeAmt = Math.min(14, this.shakeAmt + a); }
  hitStop(t) { this.hitstop = Math.max(this.hitstop, t); }
  startSlowmo(dur, scale) { this.slowmoT = Math.max(this.slowmoT, dur); this.slowmoScale = scale; }
  addLight(x, y, r, col, life) { if (this.lights.length < 40) this.lights.push({ x, y, r, col, life, max: life }); }
  addFloater(x, y, text, col, opts) {
    opts = opts || {};
    this.floaters.push({ x: x + rand(-3, 3), y, text: String(text), col: col || '#fff', life: opts.life || 0.9, max: opts.life || 0.9, vy: opts.vy || -30, size: opts.size || 12 });
    if (this.floaters.length > 60) this.floaters.shift();
  }
  addCombo(n) {
    this.combo += (n || 1);
    this.comboTimer = 2.0;
    if (this.combo > this.comboBest) this.comboBest = this.combo;
    if (this.player) this.player.awakenGain(0.02 * (n || 1) + this.combo * 0.002);
  }
  rngPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  startBoss(ref) {
    if (this.boss) return;
    this.boss = new Boss(ref.x, ref.y, this, ref);
    this.toast('A Stone Talus awakens! Strike its glowing ore.');
    this.shake(7); this.audio.play('activate');
  }
  _checkBoss() {
    if (this.boss || !this.world.structures.talus) return;
    for (const t of this.world.structures.talus) {
      if (!t.defeated && dist(this.player.x, this.player.y, t.x, t.y) < 190) { this.startBoss(t); break; }
    }
  }

  /* ---------------- spawning helpers ---------------- */
  spawnEnemy(x, y, kind) {
    if (this.enemies.length > 90) return null;
    const e = new Enemy(x, y, kind, this);
    this.enemies.push(e);
    return e;
  }
  spawnPickup(x, y, type, key) { this.pickups.push(new Pickup(x, y, type, key)); }
  spawnProjectile(pr) { this.projectiles.push(pr); }

  onEnemyDeath(e) {
    // loot drops
    const r = Math.random();
    if (r < 0.34) this.spawnPickup(e.x, e.y, 'heart');
    if (Math.random() < 0.5) this.spawnPickup(e.x + rand(-4, 4), e.y, Math.random() < 0.7 ? 'rupeeG' : 'rupeeB');
    if (Math.random() < 0.25) this.spawnPickup(e.x, e.y, 'arrows');
    if (e.kind === 'bokoblin_blue' && Math.random() < 0.4) this.spawnPickup(e.x, e.y, 'meat');
    if (Math.random() < 0.06) this.spawnPickup(e.x, e.y, 'weapon', ['sword', 'spear', 'claymore'][Math.floor(Math.random() * 3)]);
    if (e.kind === 'octorok' && Math.random() < 0.3) this.spawnPickup(e.x, e.y, 'mushroom');
  }

  onPlayerDied() {
    this.state = 'death';
    this.shake(8);
  }

  explode(x, y, radius, dmg) {
    this.particles.explosion(x, y);
    this.audio.play('explode');
    this.shake(8);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < radius + e.rad) {
        const k = angleTo(x, y, e.x, e.y);
        e.damage(dmg, Math.cos(k), Math.sin(k), 260, this);
      }
    }
    this.world.forEachObjectIn(x - radius - 12, y - radius - 12, x + radius + 12, y + radius + 12, (o) => {
      if (o.dead) return;
      if (o.breakable && dist(x, y, o.x, o.y) < radius + (o.r || 8)) this.breakBoulder(o);
      if (o.cut && dist(x, y, o.x, o.y) < radius) this.cutGrass(o);
    });
    const p = this.player;
    if (p.alive && dist(x, y, p.x, p.y) < radius * 0.8 && p.state !== 'glide') {
      const k = angleTo(x, y, p.x, p.y);
      p.damage(0.5, Math.cos(k), Math.sin(k), this);
    }
  }

  cutGrass(o) {
    o.dead = true;
    this.particles.leaves(o.x, o.y, '#6fae4a');
    this.audio.play('break');
    const r = Math.random();
    if (r < 0.08) this.spawnPickup(o.x, o.y, 'heart');
    else if (r < 0.16) this.spawnPickup(o.x, o.y, 'rupeeG');
    else if (r < 0.20) this.spawnPickup(o.x, o.y, 'apple');
    else if (r < 0.23) this.spawnPickup(o.x, o.y, 'arrows');
  }

  breakBoulder(o) {
    if (o.dead) return;
    o.dead = true;
    this.particles.burst(o.x, o.y - 6, '#8b857e', 16);
    this.audio.play('break');
    if (Math.random() < 0.5) this.spawnPickup(o.x, o.y, Math.random() < 0.6 ? 'rupeeB' : 'rupeeR');
    if (Math.random() < 0.3) this.spawnPickup(o.x, o.y, 'arrows');
  }

  _bloodMoon() {
    this.toast('The Blood Moon revives fallen foes...');
    // Kill existing wanderers AND camp members first, so resetting the camps
    // doesn't orphan still-living foes and double the population.
    for (const e of this.enemies) if (e.isWanderer || e.camp) { e.state = 'dead'; e.deadT = 0; }
    for (const camp of this.world.structures.camps) { camp.spawned = false; camp.cleared = false; camp.enemies = []; }
    this.shake(6);
  }

  /* ---------------- interactions ---------------- */
  _interactLabel(o) {
    switch (o.interact) {
      case 'tower': return o.ref.activated ? '[E] Paraglide from Tower' : '[E] Activate Sheikah Tower';
      case 'shrine': return o.ref.activated ? '[E] Rest at Shrine' : '[E] Activate Shrine';
      case 'chest': return '[E] Open Chest';
      case 'cookpot': return '[E] Cook';
      case 'korok': return '[E] Lift Rock';
    }
    return '[E]';
  }

  _doInteract(o) {
    const p = this.player;
    switch (o.interact) {
      case 'tower': {
        if (!o.ref.activated) {
          o.ref.activated = true; p.towersFound++;
          this.minimap.revealAroundWorld(o.x, o.y, 58);
          p.respawn = { x: o.x, y: o.y + 18 };
          this.audio.play('activate'); this.shake(4);
          this.particles.burst(o.x, o.y - 40, '#4fd0c8', 24);
          this.toast('Sheikah Tower activated! Region revealed.');
          this.toast('Press E again to paraglide.');
        } else {
          p.startGlide(this);
        }
        break;
      }
      case 'shrine': {
        if (!o.ref.activated) {
          o.ref.activated = true; p.shrines++;
          this.minimap.revealAroundWorld(o.x, o.y, 26);
          if (p.shrines % 2 === 1) { p.maxHearts++; this.toast('Heart Container gained! Max hearts: ' + p.maxHearts); }
          else { p.maxStamina = Math.min(2, p.maxStamina + 0.5); this.toast('Stamina increased!'); }
          this.audio.play('activate');
          this.particles.burst(o.x, o.y - 10, '#3fd8ff', 20);
        }
        p.respawn = { x: o.x, y: o.y + 16 };
        p.heal(p.maxHearts); p.stamina = p.maxStamina; p.staminaLock = false;
        this.toast('Rested. Fully restored.');
        break;
      }
      case 'chest': {
        if (o.opened) break;
        o.opened = true; this.audio.play('activate');
        this.particles.spark(o.x, o.y - 6);
        this._grantChest(o.item);
        break;
      }
      case 'cookpot': this._cook(); break;
      case 'korok': {
        if (o.done) break;
        o.done = true;
        this.spawnPickup(o.x, o.y - 4, 'korok');
        this.particles.burst(o.x, o.y - 6, '#8fd070', 12);
        break;
      }
    }
  }

  _grantChest(item) {
    const p = this.player;
    if (WEAPONS[item]) { p.giveWeapon(item); this.toast('Got ' + WEAPONS[item].name + '!'); return; }
    switch (item) {
      case 'bow': p.hasBow = true; p.arrows += 10; this.toast('Got a Bow! (+10 arrows)'); break;
      case 'arrows': p.arrows += 10; this.toast('Got 10 arrows.'); break;
      case 'rupees': p.rupees += 20; this.toast('Got 20 rupees.'); break;
      case 'bombup': p.arrows += 5; this.spawnPickup(p.x + 8, p.y, 'rupeeR'); this.toast('Found treasure!'); break;
      case 'heartup_food': p.addFood('meat', 2); p.addFood('apple', 2); this.toast('Got some food.'); break;
      default: p.rupees += 10; this.toast('Got 10 rupees.');
    }
  }

  _cook() {
    const p = this.player;
    const ingr = p.food.apple + p.food.meat + p.food.mushroom;
    if (ingr <= 0) { this.toast('You have no ingredients to cook.'); return; }
    // consume up to 3 raw ingredients -> 1 cooked meal
    let used = 0;
    for (const k of ['meat', 'mushroom', 'apple']) {
      while (p.food[k] > 0 && used < 3) { p.food[k]--; used++; }
    }
    p.addFood('cooked', 1);
    this.audio.play('activate');
    this.particles.heal(p.x, p.y - 4);
    this.toast('Cooked a hearty meal! (' + used + ' ingredients)');
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this._time += dt;
    this.menus.update(dt);
    this._globalKeys();
    if (this.touch) this.touch.sync(this.state);

    switch (this.state) {
      case 'title': this._updateMenu(dt, this.titleOptions, (i) => this._titleSelect(i)); this._menuTap('title'); break;
      case 'howto': if (this.input.wasPressed('Escape', 'Enter', 'Space') || this.input.tap) { this.audio.play('menu'); this.state = this.prevState; } break;
      case 'pause': this._updateMenu(dt, this.pauseOptions, (i) => this._pauseSelect(i), true); this._menuTap('pause'); break;
      case 'inventory': if (this.input.wasPressed('Tab', 'Escape', 'KeyI') || this.input.tap) { this.audio.play('menu'); this.state = 'playing'; } break;
      case 'map': if (this.input.wasPressed('KeyM', 'Escape') || this.input.tap) { this.audio.play('menu'); this.state = 'playing'; } break;
      case 'playing': this._updatePlaying(dt); break;
      case 'death': this._updateDeath(dt); break;
    }
    this.input.lateUpdate();
  }

  _hitMenu(t) {
    for (const r of this._menuRects) if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) return r.index;
    return -1;
  }
  // Handle a tap on a menu screen: select the tapped option (title also starts
  // on a tap anywhere else, so a first-time player just taps to play).
  _menuTap(kind) {
    const t = this.input.tap;
    if (!t) return;
    const i = this._hitMenu(t);
    if (kind === 'title') { this.audio.play('select'); if (i >= 0) this.menuIndex = i; this._titleSelect(i >= 0 ? i : 0); }
    else if (kind === 'pause') { if (i >= 0) { this.menuIndex = i; this.audio.play('select'); this._pauseSelect(i); } }
  }

  _globalKeys() {
    if (this.input.wasPressed('Digit0')) { const m = this.audio.toggleMute(); this.pauseOptions[3] = 'Sound: ' + (m ? 'Off' : 'On'); this.toast('Sound ' + (m ? 'muted' : 'on')); }
    if (this.input.wasPressed('Digit9')) { const on = this.audio.toggleMusic(); this.pauseOptions[4] = 'Music: ' + (on ? 'On' : 'Off'); this.toast('Music ' + (on ? 'on' : 'off')); }
    if (this.input.anyInteraction && !this.audio.started) this.audio.unlock();
  }

  _updateMenu(dt, options, onSelect, isPause) {
    const inp = this.input;
    if (inp.wasPressed('ArrowUp', 'KeyW')) { this.menuIndex = (this.menuIndex - 1 + options.length) % options.length; this.audio.play('menu'); }
    if (inp.wasPressed('ArrowDown', 'KeyS')) { this.menuIndex = (this.menuIndex + 1) % options.length; this.audio.play('menu'); }
    if (inp.wasPressed('Enter', 'Space', 'KeyE') || inp.mouse.leftPressed) { this.audio.play('select'); onSelect(this.menuIndex); }
    if (isPause && inp.wasPressed('Escape', 'KeyP')) { this.audio.play('menu'); this.state = 'playing'; }
  }

  _titleSelect(i) {
    if (i === 0) { this.menuIndex = 0; this.startGame(); }
    else if (i === 1) { this.prevState = 'title'; this.state = 'howto'; }
    else if (i === 2) { this._clearSave(); this._newWorld(this._randomSeed(), false); this.menuIndex = 0; this.startGame(); }
  }

  _pauseSelect(i) {
    if (i === 0) this.state = 'playing';
    else if (i === 1) this.state = 'map';
    else if (i === 2) { this.prevState = 'pause'; this.state = 'howto'; }
    else if (i === 3) { const m = this.audio.toggleMute(); this.pauseOptions[3] = 'Sound: ' + (m ? 'Off' : 'On'); }
    else if (i === 4) { const on = this.audio.toggleMusic(); this.pauseOptions[4] = 'Music: ' + (on ? 'On' : 'Off'); }
    else if (i === 5) { this._save(); this.state = 'title'; this.menuIndex = 0; }
  }

  _updatePlaying(dt) {
    const inp = this.input;
    // menu transitions
    if (inp.wasPressed('Escape', 'KeyP')) { this.state = 'pause'; this.menuIndex = 0; this.audio.play('menu'); return; }
    if (inp.wasPressed('KeyM')) { this.state = 'map'; this.audio.play('menu'); return; }
    if (inp.wasPressed('Tab', 'KeyI')) { this.state = 'inventory'; this.audio.play('menu'); return; }

    // hitstop freezes the world briefly for impact
    if (this.hitstop > 0) { this.hitstop -= dt; dt = Math.min(dt, 0.0005); }

    // slow-motion (flurry rush) scales the simulation but not real-time timers
    if (this.slowmoT > 0) { this.slowmoT -= dt; this.timeScale = this.slowmoScale; }
    else this.timeScale = 1;
    const sdt = dt * this.timeScale;

    this.dayNight.update(sdt);
    this.weather.update(sdt, this);
    this.ambient.update(sdt, this);
    this.audio.updateMusic(dt, this.dayNight.night);

    // mouse world pos
    this.mouseWorld.x = this.camera.x + inp.mouse.sx / this.zoom;
    this.mouseWorld.y = this.camera.y + inp.mouse.sy / this.zoom;

    this.player.update(sdt, this);
    this.spawner.update(sdt, this);
    this._checkBoss();
    for (const e of this.enemies) e.update(sdt, this);
    if (this.boss) this.boss.update(sdt, this);
    for (const pk of this.pickups) pk.update(sdt, this);
    for (const pr of this.projectiles) pr.update(sdt, this);
    this.particles.update(sdt);

    // transient lights + floating text
    for (let i = this.lights.length - 1; i >= 0; i--) { this.lights[i].life -= sdt; if (this.lights[i].life <= 0) this.lights.splice(i, 1); }
    for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.life -= sdt; f.y += f.vy * sdt; f.vy += 40 * sdt; if (f.life <= 0) this.floaters.splice(i, 1); }
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // cull dead
    this.enemies = this.enemies.filter(e => e.state !== 'dead' || e.deadT > 0);
    this.pickups = this.pickups.filter(p => !p.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    if (this.boss && this.boss.dead && this.boss.deadT <= 0) this.boss = null;

    // interaction
    this._updateInteraction();

    // reveal minimap around player as they explore
    this.minimap.revealAroundWorld(this.player.x, this.player.y, 7);

    // toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].life -= dt; if (this.toasts[i].life <= 0) this.toasts.splice(i, 1); }

    this._updateCamera(dt);
    this.shakeAmt *= Math.pow(0.001, dt);

    // autosave
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 12; this._save(); }
  }

  _updateInteraction() {
    const p = this.player;
    if (p.state === 'glide' || p.state === 'climb' || p.state === 'swim') { this.currentInteract = null; return; }
    const o = this.world.nearestInteractable(p.x, p.y, INTERACT_RANGE);
    this.currentInteract = o ? { obj: o, label: this._interactLabel(o) } : null;
    if (this.currentInteract && this.input.wasPressed('KeyE')) {
      this._doInteract(o);
    }
  }

  _updateDeath(dt) {
    this.player.deadTimer -= dt;
    this.particles.update(dt);
    this.shakeAmt *= Math.pow(0.001, dt);
    if (this.player.deadTimer <= 0) {
      this.player.respawnNow(this);
      // clear immediate threats
      const p = this.player;
      this.enemies = this.enemies.filter(e => dist(e.x, e.y, p.x, p.y) > 120);
      this.state = 'playing';
      this.toast('Rescued! Be careful out there.');
    }
  }

  /* ---------------- camera ---------------- */
  _centerCamera() {
    this.camera.x = this.player.x - (this.W / this.zoom) / 2;
    this.camera.y = this.player.y - (this.H / this.zoom) / 2;
    this._clampCamera();
  }
  _updateCamera(dt) {
    if (!isFinite(this.camera.x) || !isFinite(this.camera.y)) this._centerCamera();
    const vw = this.W / this.zoom, vh = this.H / this.zoom;
    const tx = this.player.x - vw / 2, ty = this.player.y - vh / 2;
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    this._clampCamera();
  }
  _clampCamera() {
    const vw = this.W / this.zoom, vh = this.H / this.zoom;
    this.camera.x = clamp(this.camera.x, 0, Math.max(0, this.world.pxW - vw));
    this.camera.y = clamp(this.camera.y, 0, Math.max(0, this.world.pxH - vh));
  }

  /* ---------------- render ---------------- */
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (this.state === 'title') { this.menus.drawTitle(ctx, this.W, this.H, this.titleOptions, this.menuIndex); return; }
    if (this.state === 'howto' && this.prevState === 'title') { this.menus.drawTitle(ctx, this.W, this.H, this.titleOptions, this.menuIndex); this.menus.drawHowTo(ctx, this.W, this.H); return; }

    // world
    ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, this.W, this.H);
    const shake = this.shakeAmt;
    const sx = shake > 0.2 ? (Math.random() * 2 - 1) * shake : 0;
    const sy = shake > 0.2 ? (Math.random() * 2 - 1) * shake : 0;
    const camX = Math.round(this.camera.x - sx), camY = Math.round(this.camera.y - sy);
    const vw = this.W / this.zoom, vh = this.H / this.zoom;
    this.view.x = camX; this.view.y = camY; this.view.w = vw; this.view.h = vh;

    ctx.save();
    ctx.setTransform(this.zoom * this.dpr, 0, 0, this.zoom * this.dpr, -camX * this.zoom * this.dpr, -camY * this.zoom * this.dpr);

    this.world.drawTerrain(ctx, this.view);
    this.ambient.drawWater(ctx, this);

    // build y-sorted render list
    const list = [];
    this.world.collectVisibleObjects(this.view, list);
    const p = this.player;
    list.push({ sortY: p.y, kind: 'player' });
    for (const e of this.enemies) if (this._inView(e.x, e.y, 40)) list.push({ sortY: e.y, kind: 'enemy', e });
    if (this.boss && this._inView(this.boss.x, this.boss.y, 120)) list.push({ sortY: this.boss.y, kind: 'boss' });
    for (const pk of this.pickups) if (this._inView(pk.x, pk.y, 30)) list.push({ sortY: pk.y, kind: 'pickup', pk });
    for (const pr of this.projectiles) if (this._inView(pr.x, pr.y, 30)) list.push({ sortY: pr.y + 4, kind: 'proj', pr });
    list.sort((a, b) => a.sortY - b.sortY);
    for (const it of list) {
      if (it.kind === 'obj') this.world.drawObject(ctx, it.o, this._time);
      else if (it.kind === 'player') p.draw(ctx, this);
      else if (it.kind === 'enemy') it.e.draw(ctx, this);
      else if (it.kind === 'boss') this.boss.draw(ctx, this);
      else if (it.kind === 'pickup') it.pk.draw(ctx, this);
      else if (it.kind === 'proj') it.pr.draw(ctx, this);
    }

    this.particles.draw(ctx);
    this.ambient.drawDay(ctx, this);

    // interaction highlight ring
    if (this.currentInteract) {
      const o = this.currentInteract.obj;
      ctx.strokeStyle = 'rgba(255,233,140,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(o.x, o.y, (o.r || 8) + 4 + Math.sin(this.menus.t * 6) * 1.5, 0, TAU); ctx.stroke();
    }

    ctx.restore();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // lighting, fireflies, weather, floating text (all screen space)
    this.lighting.render(ctx, this);
    this.ambient.drawGlow(ctx, this);
    this.weather.render(ctx, this);
    this._drawFloaters(ctx);

    // HUD + overlays
    if (this.state === 'playing' || this.state === 'pause' || this.state === 'death') {
      this.hud.draw(ctx, this.W, this.H);
      // On touch the bottom-right corner is the action cluster, so tuck the
      // minimap under the top-right info panel instead.
      if (this.touch && this.touch.enabled) this.minimap.drawSmall(ctx, this.W - 116, 82, 100, this);
      else this.minimap.drawSmall(ctx, this.W - 132, this.H - 132, 120, this);
    }
    if (this.state === 'pause') this.menus.drawPause(ctx, this.W, this.H, this.pauseOptions, this.menuIndex);
    if (this.state === 'inventory') this.menus.drawInventory(ctx, this.W, this.H, this);
    if (this.state === 'map') this.minimap.drawFull(ctx, this.W, this.H, this);
    if (this.state === 'howto') this.menus.drawHowTo(ctx, this.W, this.H);
    if (this.state === 'death') this.menus.drawDeath(ctx, this.W, this.H, this.player.deadTimer);

    this._vignette(ctx);
  }

  _inView(x, y, pad) {
    return x > this.view.x - pad && x < this.view.x + this.view.w + pad && y > this.view.y - pad && y < this.view.y + this.view.h + pad;
  }

  _drawFloaters(ctx) {
    if (!this.floaters.length) return;
    const z = this.zoom, view = this.view;
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const sx = (f.x - view.x) * z, sy = (f.y - view.y) * z;
      if (sx < -20 || sx > this.W + 20 || sy < -20 || sy > this.H + 20) continue;
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.font = `bold ${f.size}px monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillStyle = f.col; ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  _vignette(ctx) {
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
  }

  /* ---------------- save / load ---------------- */
  _save() {
    try {
      const p = this.player;
      const data = {
        seed: this.world.seed,
        p: {
          x: p.x, y: p.y, health: p.health, maxHearts: p.maxHearts, stamina: p.stamina, maxStamina: p.maxStamina,
          rupees: p.rupees, koroks: p.koroks, shrines: p.shrines, towersFound: p.towersFound,
          hasBow: p.hasBow, arrows: p.arrows, food: p.food, respawn: p.respawn,
          weapons: p.weapons.map(w => w.key), wi: p.wi,
        },
        dn: { time: this.dayNight.time, day: this.dayNight.day },
        towers: this.world.structures.towers.map(t => t.activated ? 1 : 0),
        shrines: this.world.structures.shrines.map(s => s.activated ? 1 : 0),
        chests: this.world.structures.chests.map(c => c.opened ? 1 : 0),
        koroks: this.world.structures.koroks.map(k => k.done ? 1 : 0),
        reveal: this._packReveal(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage may be unavailable */ }
  }

  _packReveal() {
    // run-length encode the reveal mask to keep it small
    const m = this.minimap.mask; const out = []; let cur = m[0], run = 0;
    for (let i = 0; i < m.length; i++) { if (m[i] === cur) run++; else { out.push(run); cur = m[i]; run = 1; } }
    out.push(run); return { first: m[0], runs: out };
  }
  _unpackReveal(data) {
    try {
      const m = this.minimap.mask; let i = 0, val = data.first;
      for (const run of data.runs) { for (let k = 0; k < run && i < m.length; k++) { if (val) { this.minimap.revealTile(i % this.world.W, Math.floor(i / this.world.W)); } i++; } val = val ? 0 : 1; }
    } catch (e) { }
  }

  _load(seed) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.seed !== seed) return;
      const p = this.player, s = d.p;
      Object.assign(p, {
        x: s.x, y: s.y, health: s.health, maxHearts: s.maxHearts, stamina: s.stamina, maxStamina: s.maxStamina,
        rupees: s.rupees, koroks: s.koroks, shrines: s.shrines, towersFound: s.towersFound,
        hasBow: s.hasBow, arrows: s.arrows, food: s.food, respawn: s.respawn, wi: s.wi || 0,
      });
      if (s.weapons && s.weapons.length) p.weapons = s.weapons.map(k => makeWeapon(k));
      if (p.weapons.length === 0) p.weapons = [makeWeapon('sword')];
      p.wi = clamp(p.wi, 0, p.weapons.length - 1);
      this.dayNight.time = d.dn.time; this.dayNight.day = d.dn.day;
      d.towers.forEach((v, i) => { if (this.world.structures.towers[i]) this.world.structures.towers[i].activated = !!v; });
      d.shrines.forEach((v, i) => { if (this.world.structures.shrines[i]) this.world.structures.shrines[i].activated = !!v; });
      d.chests.forEach((v, i) => { if (this.world.structures.chests[i]) this.world.structures.chests[i].opened = !!v; });
      d.koroks.forEach((v, i) => { if (this.world.structures.koroks[i]) this.world.structures.koroks[i].done = !!v; });
      if (d.reveal) this._unpackReveal(d.reveal);
      this._centerCamera();
      this.toast('Save loaded.');
    } catch (e) { /* corrupt save -> ignore */ }
  }
  _clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }
}
