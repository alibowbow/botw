'use strict';
/* world.js — wraps generated map data: tile queries, collision resolution,
   a spatial grid for objects, and cached terrain rendering. */

const CHUNK = 16;          // tiles per cached terrain chunk
const GRID_CELL = 32;      // world px per spatial-grid cell

class World {
  constructor(data, sprites) {
    this.W = data.W; this.H = data.H;
    this.tiles = data.tiles;
    this.elevOf = data.elevOf;
    this.objects = data.objects;
    this.structures = data.structures;
    this.spawn = data.spawn;
    this.seed = data.seed;
    this.sprites = sprites;
    this.pxW = this.W * TILE;
    this.pxH = this.H * TILE;

    this._chunks = new Map();
    this._buildGrid();
  }

  /* ---------------- tile queries ---------------- */
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H; }
  tileIdAt(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[ty * this.W + tx] : T.DEEP_WATER; }
  tileIdAtWorld(wx, wy) { return this.tileIdAt(Math.floor(wx / TILE), Math.floor(wy / TILE)); }
  tileInfoAtWorld(wx, wy) { return TILES[this.tileIdAtWorld(wx, wy)]; }
  elevAtWorld(wx, wy) {
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    return this.inBounds(tx, ty) ? this.elevOf[ty * this.W + tx] : 0;
  }

  /* ---------------- spatial grid ---------------- */
  _buildGrid() {
    this.gw = Math.ceil(this.pxW / GRID_CELL);
    this.gh = Math.ceil(this.pxH / GRID_CELL);
    this.grid = new Array(this.gw * this.gh);
    for (const o of this.objects) this._gridAdd(o);
  }
  _cellIndex(wx, wy) {
    const cx = clamp(Math.floor(wx / GRID_CELL), 0, this.gw - 1);
    const cy = clamp(Math.floor(wy / GRID_CELL), 0, this.gh - 1);
    return cy * this.gw + cx;
  }
  _gridAdd(o) {
    const i = this._cellIndex(o.x, o.y);
    (this.grid[i] || (this.grid[i] = [])).push(o);
  }
  // Iterate objects whose cell is within the world-px rectangle.
  forEachObjectIn(x0, y0, x1, y1, fn) {
    const cx0 = clamp(Math.floor(x0 / GRID_CELL), 0, this.gw - 1);
    const cy0 = clamp(Math.floor(y0 / GRID_CELL), 0, this.gh - 1);
    const cx1 = clamp(Math.floor(x1 / GRID_CELL), 0, this.gw - 1);
    const cy1 = clamp(Math.floor(y1 / GRID_CELL), 0, this.gh - 1);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = this.grid[cy * this.gw + cx];
        if (bucket) for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
  }

  removeObject(o) { o.dead = true; }

  nearestInteractable(wx, wy, maxDist) {
    let best = null, bestD = maxDist;
    this.forEachObjectIn(wx - maxDist - 20, wy - maxDist - 20, wx + maxDist + 20, wy + maxDist + 20, (o) => {
      if (o.dead || !o.interact) return;
      if (o.interact === 'chest' && o.opened) return;
      if (o.interact === 'korok' && o.done) return;
      const d = dist(wx, wy, o.x, o.y);
      if (d < bestD) { bestD = d; best = o; }
    });
    return best;
  }

  /* ---------------- collision ---------------- */
  _tileBlocks(tid, opts) {
    const t = TILES[tid];
    if (!t) return true;
    if (t.solid) { if (t.climb && !opts.cliffSolid) return false; return true; }
    if (t.deep && opts.deepSolid) return true;
    return false;
  }
  // Is a circle at (x,y,r) blocked by tiles?
  _tilesBlockCircle(x, y, r, opts) {
    const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
    const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tid = this.tileIdAt(tx, ty);
        if (!this.inBounds(tx, ty)) return true; // out of bounds blocks
        if (this._tileBlocks(tid, opts)) {
          if (circleRectOverlap(x, y, r, tx * TILE, ty * TILE, TILE, TILE)) return true;
        }
      }
    }
    return false;
  }
  _objectsBlockCircle(x, y, r, opts) {
    let blocked = false;
    this.forEachObjectIn(x - r - 12, y - r - 12, x + r + 12, y + r + 12, (o) => {
      if (blocked || o.dead || !o.solid) return;
      if (opts.ignoreObj && opts.ignoreObj === o) return;
      const or = o.r || 5;
      if (circlesOverlap(x, y, r, o.x, o.y, or)) blocked = true;
    });
    return blocked;
  }
  _blocked(x, y, r, opts) {
    return this._tilesBlockCircle(x, y, r, opts) || this._objectsBlockCircle(x, y, r, opts);
  }

  // Move a circle by (dx,dy) with axis separation and sub-stepping.
  // Returns {x, y, hitX, hitY}. opts: {deepSolid, cliffSolid, ignoreObj}
  moveCircle(x, y, r, dx, dy, opts) {
    opts = opts || {};
    if (opts.deepSolid === undefined) opts.deepSolid = true;
    if (opts.cliffSolid === undefined) opts.cliffSolid = true;
    // If we start already embedded in a solid (e.g. a climber whose stamina ran
    // out inside a cliff band, or an enemy that spawned badly), nudge free first
    // so the entity can never get permanently frozen.
    if (this._blocked(x, y, r, opts)) { const esc = this._unstick(x, y, r, opts); x = esc.x; y = esc.y; }
    let hitX = false, hitY = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5 || 4)));
    const sx = dx / steps, sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      if (sx !== 0) {
        const nx = x + sx;
        if (!this._blocked(nx, y, r, opts)) x = nx; else hitX = true;
      }
      if (sy !== 0) {
        const ny = y + sy;
        if (!this._blocked(x, ny, r, opts)) y = ny; else hitY = true;
      }
    }
    return { x, y, hitX, hitY };
  }

  // Find the nearest non-blocked position by spiralling outward. Returns the
  // original position if nothing free is found within range.
  _unstick(x, y, r, opts) {
    for (let rad = 2; rad <= 28; rad += 2) {
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * TAU;
        const nx = x + Math.cos(ang) * rad, ny = y + Math.sin(ang) * rad;
        if (!this._blocked(nx, ny, r, opts)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  // True if a straight sample point is inside a solid (used by projectiles).
  pointSolid(x, y, opts) {
    opts = opts || { deepSolid: false, cliffSolid: true };
    const tid = this.tileIdAtWorld(x, y);
    if (!this.inBounds(Math.floor(x / TILE), Math.floor(y / TILE))) return true;
    if (this._tileBlocks(tid, opts)) return true;
    let hit = false;
    this.forEachObjectIn(x - 12, y - 12, x + 12, y + 12, (o) => {
      if (hit || o.dead || !o.solid) return;
      if (o.type === 'campfire' || o.type === 'cookpot' || o.type === 'korokRock') return;
      const or = (o.r || 5);
      if (dist2(x, y, o.x, o.y) < or * or) hit = true;
    });
    return hit;
  }

  /* ---------------- rendering ---------------- */
  _buildChunk(ccx, ccy) {
    const size = CHUNK * TILE;
    const { c, ctx } = makeCanvas(size, size);
    const tx0 = ccx * CHUNK, ty0 = ccy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = tx0 + lx, ty = ty0 + ly;
        if (!this.inBounds(tx, ty)) { ctx.fillStyle = '#22496a'; ctx.fillRect(lx * TILE, ly * TILE, TILE, TILE); continue; }
        const t = TILES[this.tiles[ty * this.W + tx]];
        const h = hash01(tx, ty, this.seed);
        const b = (h - 0.5) * 2 * t.noise; // brightness variation
        const base = shade(t.col, b);
        ctx.fillStyle = css(base);
        ctx.fillRect(lx * TILE, ly * TILE, TILE, TILE);
        // speckles
        const nSp = 3;
        for (let s = 0; s < nSp; s++) {
          const hx = hash01(tx * 4 + s, ty * 7 + 1, this.seed);
          const hy = hash01(tx * 9 + 3, ty * 5 + s, this.seed + 99);
          ctx.fillStyle = css(shade(t.col2, (hx - 0.5) * 0.2));
          ctx.globalAlpha = 0.5;
          ctx.fillRect(lx * TILE + hx * (TILE - 3), ly * TILE + hy * (TILE - 3), 2, 2);
          ctx.globalAlpha = 1;
        }
        // water: horizontal light bands; cliff: vertical shade
        if (t.deep || t.shallow) {
          ctx.fillStyle = css(shade(t.col2, 0.15), 0.35);
          if (((tx * 3 + ty * 5) & 3) === 0) ctx.fillRect(lx * TILE + 2, ly * TILE + 5, TILE - 5, 1.5);
        } else if (t.climb) {
          ctx.fillStyle = css(shade(t.col, -0.35), 0.5);
          ctx.fillRect(lx * TILE, ly * TILE, 2, TILE);
          ctx.fillStyle = css(shade(t.col, 0.2), 0.4);
          ctx.fillRect(lx * TILE + TILE - 3, ly * TILE + 2, 2, TILE - 4);
        }
      }
    }
    return c;
  }
  _getChunk(ccx, ccy) {
    const key = ccx + ',' + ccy;
    let c = this._chunks.get(key);
    if (!c) { c = this._buildChunk(ccx, ccy); this._chunks.set(key, c); }
    return c;
  }
  drawTerrain(ctx, view) {
    const size = CHUNK * TILE;
    const c0 = Math.floor(view.x / size), c1 = Math.floor((view.x + view.w) / size);
    const r0 = Math.floor(view.y / size), r1 = Math.floor((view.y + view.h) / size);
    const maxCX = Math.ceil(this.pxW / size) - 1, maxCY = Math.ceil(this.pxH / size) - 1;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cy < 0 || cx > maxCX || cy > maxCY) continue;
        const chunk = this._getChunk(cx, cy);
        ctx.drawImage(chunk, cx * size, cy * size);
      }
    }
  }

  // Push visible objects into arr as render entries {y, kind:'obj', o}.
  collectVisibleObjects(view, arr) {
    // Objects are drawn upward from their feet, so a tall sprite (the 96px tower)
    // can still be on-screen when its feet are well below the view. Pad enough to
    // cover the tallest sprite so nothing pops out at the edges.
    const pad = 110;
    this.forEachObjectIn(view.x - pad, view.y - pad, view.x + view.w + pad, view.y + view.h + pad, (o) => {
      if (o.dead) return;
      arr.push({ sortY: o.y, kind: 'obj', o });
    });
  }

  drawObject(ctx, o, t) {
    const sb = this.sprites;
    let name = o.type;
    if (o.type === 'chest') name = o.opened ? 'chestOpen' : 'chest';
    else if (o.type === 'shrine') name = (o.ref && o.ref.activated) ? 'shrineOn' : 'shrine';
    else if (o.type === 'korokRock') name = 'rock';
    const cv = sb.variant(name, o.v || 0) || sb.variant('rock', 0);
    if (!cv) return;
    // shadow for solid/tall objects
    if (o.solid || o.type === 'campfire' || o.type === 'korokRock') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y + 1, (o.r || 6) * 1.2, (o.r || 6) * 0.55, 0, 0, TAU);
      ctx.fill();
    }
    // gentle wind sway for foliage (skew the top of the sprite)
    const sways = (o.type === 'grass' || o.type === 'flower' || o.type === 'bush' || o.type === 'tree' || o.type === 'pine');
    if (sways && t !== undefined) {
      const amt = (o.type === 'tree' || o.type === 'pine') ? 0.05 : 0.14;
      const sw = Math.sin(t * 1.6 + o.x * 0.05 + o.y * 0.03) * amt;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.transform(1, 0, sw, 1, 0, 0); // horizontal shear grows toward the top
      ctx.drawImage(cv, Math.round(-cv.width / 2), Math.round(-cv._feetY));
      ctx.restore();
      if (o.type === 'korokRock' && !o.done) {
        ctx.fillStyle = '#4f8a3f';
        ctx.beginPath(); ctx.ellipse(o.x + 3, o.y - 8, 2, 4, 0.5, 0, TAU); ctx.fill();
      }
      return;
    }
    ctx.drawImage(cv, Math.round(o.x - cv.width / 2), Math.round(o.y - cv._feetY));
    // korok leaf hint on the rock
    if (o.type === 'korokRock' && !o.done) {
      ctx.fillStyle = '#4f8a3f';
      ctx.beginPath(); ctx.ellipse(o.x + 3, o.y - 8, 2, 4, 0.5, 0, TAU); ctx.fill();
    }
  }
}
