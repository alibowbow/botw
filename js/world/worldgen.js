'use strict';
/* worldgen.js — builds a continent: biome tiles from layered noise, then
   scatters vegetation/rocks and places structures (towers, shrines, camps,
   cook pots, chests, korok spots). Returns a plain data object. */

const TILE = 16; // world pixels per tile

function generateWorld(seed) {
  const rng = new RNG(seed);
  const elev = new Noise(seed ^ 0x9e37);
  const moist = new Noise(seed ^ 0x51ed);
  const detail = new Noise(seed ^ 0xa13f);

  const W = 220, H = 176;                 // tiles
  const tiles = new Uint8Array(W * H);
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(W, H) * 0.5;

  const eScale = 0.028, mScale = 0.035;

  const elevOf = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let e = elev.fbm01(x * eScale, y * eScale, 5, 2, 0.5);
      // island falloff: subtract based on normalized distance from centre
      const dx = (x - cx) / maxR, dy = (y - cy) / maxR;
      const d = Math.sqrt(dx * dx + dy * dy);
      const falloff = smoothstep(invlerp(0.72, 1.05, d)); // 0 inland, 1 at edge
      e = e * (1 - falloff) - falloff * 0.35;
      // sprinkle fine detail
      e += detail.value(x * 0.12, y * 0.12) * 0.03;
      e = clamp(e, 0, 1);
      elevOf[y * W + x] = e;

      const m = moist.fbm01(x * mScale + 100, y * mScale + 100, 4, 2, 0.5);

      let t;
      if (e < 0.30) t = T.DEEP_WATER;
      else if (e < 0.355) t = T.WATER;
      else if (e < 0.40) t = T.SAND;
      else if (e < 0.66) {
        if (m < 0.34) t = (m < 0.18 ? T.DIRT : T.GRASS_DARK);
        else if (m < 0.60) t = (detail.value(x * 0.2, y * 0.2) > 0.55 ? T.FLOWERS : T.GRASS);
        else t = T.FOREST;
      } else if (e < 0.70) t = T.CLIFF;         // climbable ring around highlands
      else if (e < 0.80) t = T.ROCK;
      else if (e < 0.87) t = T.SNOW_ROCK;
      else t = T.SNOW;
      tiles[y * W + x] = t;
    }
  }

  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const isWalkTile = (x, y) => {
    if (!inb(x, y)) return false;
    const t = TILES[tiles[idx(x, y)]];
    return !t.solid && !t.deep;
  };

  // Pick a pleasant spawn: flat grass near centre.
  let spawnTX = Math.floor(cx), spawnTY = Math.floor(cy);
  {
    let best = -1;
    for (let tries = 0; tries < 4000; tries++) {
      const x = Math.floor(cx + rng.range(-18, 18));
      const y = Math.floor(cy + rng.range(-18, 18));
      if (!inb(x, y)) continue;
      const t = tiles[idx(x, y)];
      if (t === T.GRASS || t === T.GRASS_DARK || t === T.FLOWERS) {
        const score = (isWalkTile(x + 1, y) && isWalkTile(x - 1, y) && isWalkTile(x, y + 1) && isWalkTile(x, y - 1)) ? 1 : 0;
        if (score > best) { best = score; spawnTX = x; spawnTY = y; if (score === 1) break; }
      }
    }
  }
  const spawn = { x: spawnTX * TILE + TILE / 2, y: spawnTY * TILE + TILE / 2 };

  const objects = [];
  const structures = { towers: [], shrines: [], camps: [], cookpots: [], chests: [], koroks: [] };
  const reserved = new Uint8Array(W * H); // 1 = don't scatter decor here

  function reserveArea(tx, ty, rad) {
    for (let y = ty - rad; y <= ty + rad; y++)
      for (let x = tx - rad; x <= tx + rad; x++)
        if (inb(x, y)) reserved[idx(x, y)] = 1;
  }
  function farEnough(list, wx, wy, minD) {
    for (const s of list) if (dist(s.x, s.y, wx, wy) < minD) return false;
    return true;
  }
  function findWalkable(centerBias) {
    for (let tries = 0; tries < 600; tries++) {
      const x = rng.int(6, W - 7), y = rng.int(6, H - 7);
      if (!isWalkTile(x, y)) continue;
      if (centerBias && dist(x, y, cx, cy) > maxR * 0.9) continue;
      return { tx: x, ty: y, wx: x * TILE + TILE / 2, wy: y * TILE + TILE / 2 };
    }
    return null;
  }

  // --- Towers ---
  const towerCount = 5;
  for (let i = 0; i < towerCount && structures.towers.length < towerCount; i++) {
    for (let tries = 0; tries < 400; tries++) {
      const p = findWalkable(false);
      if (!p) break;
      if (!farEnough(structures.towers, p.wx, p.wy, 55 * TILE)) continue;
      if (dist(p.wx, p.wy, spawn.x, spawn.y) < 26 * TILE && i === 0) { /* first can be nearer */ }
      // flatten footprint
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (inb(p.tx + xx, p.ty + yy)) tiles[idx(p.tx + xx, p.ty + yy)] = T.PATH;
      reserveArea(p.tx, p.ty, 2);
      const tw = { id: i, x: p.wx, y: p.wy, activated: false };
      structures.towers.push(tw);
      objects.push({ type: 'tower', x: p.wx, y: p.wy, v: 0, solid: true, r: 12, interact: 'tower', ref: tw });
      break;
    }
  }

  // --- Shrines ---
  const shrineCount = 12;
  for (let i = 0; i < shrineCount; i++) {
    let placed = false;
    for (let tries = 0; tries < 400 && !placed; tries++) {
      const p = findWalkable(false);
      if (!p) break;
      if (!farEnough(structures.shrines, p.wx, p.wy, 22 * TILE)) continue;
      if (dist(p.wx, p.wy, spawn.x, spawn.y) < 12 * TILE) continue;
      tiles[idx(p.tx, p.ty)] = T.SHRINE_FLOOR;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (inb(p.tx + xx, p.ty + yy) && isWalkTile(p.tx + xx, p.ty + yy)) tiles[idx(p.tx + xx, p.ty + yy)] = T.SHRINE_FLOOR;
      reserveArea(p.tx, p.ty, 2);
      const sh = { id: i, x: p.wx, y: p.wy, activated: false };
      structures.shrines.push(sh);
      objects.push({ type: 'shrine', x: p.wx, y: p.wy, v: 0, solid: true, r: 11, interact: 'shrine', ref: sh });
      placed = true;
    }
  }

  // --- Enemy camps (cluster around a campfire, with a chest) ---
  const campCount = 10;
  for (let i = 0; i < campCount; i++) {
    for (let tries = 0; tries < 400; tries++) {
      const p = findWalkable(false);
      if (!p) break;
      const t = tiles[idx(p.tx, p.ty)];
      if (t === T.SAND || t === T.SNOW || t === T.ROCK) { /* allow */ }
      if (dist(p.wx, p.wy, spawn.x, spawn.y) < 20 * TILE) continue;
      if (!farEnough(structures.camps, p.wx, p.wy, 26 * TILE)) continue;
      reserveArea(p.tx, p.ty, 3);
      objects.push({ type: 'campfire', x: p.wx, y: p.wy, v: 0, solid: false, r: 5, light: true });
      // chest with a weapon
      const chestPos = { x: p.wx + rng.range(-30, 30), y: p.wy - rng.range(20, 40) };
      const loot = rng.pick(['claymore', 'spear', 'sword', 'bow']);
      const chest = { type: 'chest', x: chestPos.x, y: chestPos.y, v: 0, solid: true, r: 9, interact: 'chest', opened: false, item: loot };
      objects.push(chest);
      structures.chests.push(chest);
      const size = rng.int(3, 5);
      const camp = { x: p.wx, y: p.wy, size, radius: 60, cleared: false, enemies: [] };
      structures.camps.push(camp);
      break;
    }
  }

  // --- Standalone cook pots (one guaranteed near spawn) ---
  {
    // near-spawn cook pot
    for (let tries = 0; tries < 200; tries++) {
      const x = spawnTX + rng.int(-5, 5), y = spawnTY + rng.int(-5, 5);
      if (inb(x, y) && isWalkTile(x, y) && dist(x, y, spawnTX, spawnTY) > 2) {
        const wx = x * TILE + TILE / 2, wy = y * TILE + TILE / 2;
        objects.push({ type: 'cookpot', x: wx, y: wy, v: 0, solid: true, r: 8, interact: 'cookpot' });
        structures.cookpots.push({ x: wx, y: wy });
        reserveArea(x, y, 1);
        break;
      }
    }
    for (let i = 0; i < 5; i++) {
      const p = findWalkable(false);
      if (!p) continue;
      objects.push({ type: 'cookpot', x: p.wx, y: p.wy, v: 0, solid: true, r: 8, interact: 'cookpot' });
      structures.cookpots.push({ x: p.wx, y: p.wy });
      reserveArea(p.tx, p.ty, 1);
    }
  }

  // --- Standalone treasure chests in the wild ---
  for (let i = 0; i < 8; i++) {
    const p = findWalkable(false);
    if (!p) continue;
    if (reserved[idx(p.tx, p.ty)]) continue;
    const loot = rng.pick(['rupees', 'arrows', 'bombup', 'heartup_food', 'sword', 'bow']);
    const chest = { type: 'chest', x: p.wx, y: p.wy, v: 0, solid: true, r: 9, interact: 'chest', opened: false, item: loot };
    objects.push(chest);
    structures.chests.push(chest);
    reserveArea(p.tx, p.ty, 1);
  }

  // --- Korok spots (a lone rock with a leaf; lift with E) ---
  const korokCount = 40;
  for (let i = 0; i < korokCount; i++) {
    const p = findWalkable(false);
    if (!p) continue;
    if (reserved[idx(p.tx, p.ty)]) continue;
    const k = { type: 'korokRock', x: p.wx, y: p.wy, v: 0, solid: false, r: 7, interact: 'korok', done: false };
    objects.push(k);
    structures.koroks.push(k);
    reserved[idx(p.tx, p.ty)] = 1;
  }

  // --- Scatter vegetation & rocks ---
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (reserved[idx(x, y)]) continue;
      const t = tiles[idx(x, y)];
      const ti = TILES[t];
      if (ti.solid || ti.deep) continue;
      const wx = x * TILE + rng.range(2, TILE - 2);
      const wy = y * TILE + rng.range(2, TILE - 2);
      const r = rng.next();
      // keep spawn area clearer
      const nearSpawn = dist(x, y, spawnTX, spawnTY) < 6;

      if (t === T.FOREST) {
        if (r < 0.34) objects.push({ type: rng.chance(0.4) ? 'pine' : 'tree', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 6 });
        else if (r < 0.46) objects.push({ type: 'bush', x: wx, y: wy, v: rng.int(0, 2), solid: false, r: 5, cut: false });
        else if (r < 0.52) objects.push({ type: 'grass', x: wx, y: wy, v: rng.int(0, 2), solid: false, cut: true });
        else if (r < 0.54) objects.push({ type: 'stump', x: wx, y: wy, v: 0, solid: true, r: 5 });
      } else if (t === T.GRASS || t === T.GRASS_DARK) {
        if (!nearSpawn && r < 0.06) objects.push({ type: rng.chance(0.7) ? 'tree' : 'pine', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 6 });
        else if (r < 0.12) objects.push({ type: 'bush', x: wx, y: wy, v: rng.int(0, 2), solid: false, r: 5 });
        else if (r < 0.30) objects.push({ type: 'grass', x: wx, y: wy, v: rng.int(0, 2), solid: false, cut: true });
        else if (r < 0.33) objects.push({ type: 'rock', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 5 });
      } else if (t === T.FLOWERS) {
        if (r < 0.5) objects.push({ type: 'flower', x: wx, y: wy, v: rng.int(0, 2), solid: false });
        else if (r < 0.62) objects.push({ type: 'grass', x: wx, y: wy, v: rng.int(0, 2), solid: false, cut: true });
      } else if (t === T.SAND) {
        if (r < 0.05) objects.push({ type: 'rock', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 5 });
        else if (r < 0.07) objects.push({ type: 'bush', x: wx, y: wy, v: rng.int(0, 2), solid: false, r: 4 });
      } else if (t === T.DIRT) {
        if (r < 0.08) objects.push({ type: 'rock', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 5 });
        else if (r < 0.14) objects.push({ type: 'grass', x: wx, y: wy, v: rng.int(0, 2), solid: false, cut: true });
      } else if (t === T.ROCK) {
        if (r < 0.10) objects.push({ type: 'rock', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 5 });
        else if (r < 0.14) objects.push({ type: 'boulder', x: wx, y: wy, v: rng.int(0, 1), solid: true, r: 10, breakable: true, hp: 3 });
      } else if (t === T.SNOW || t === T.SNOW_ROCK) {
        if (r < 0.05) objects.push({ type: 'pine', x: wx, y: wy, v: rng.int(0, 1), solid: true, r: 6 });
        else if (r < 0.09) objects.push({ type: 'rock', x: wx, y: wy, v: rng.int(0, 2), solid: true, r: 5 });
      }
    }
  }

  return { W, H, tiles, elevOf, objects, structures, spawn, seed };
}
