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

  /* ---------------- rendering ----------------
     Terrain is rendered like a tiny fragment shader: one pass per world pixel,
     baked into per-chunk canvases (built once, cached). Per pixel we compute
     - a domain-warped tile lookup   -> organic, non-square biome boundaries
     - bilinear-interpolated elevation -> hillshading (NW sun) for 3D relief
     - water depth colour + a shoreline foam band (foam points animate later)
     - fine/medium detail noise      -> ground texture                      */
  _terrainNoise() {
    if (!this._nWarpA) {
      this._nWarpA = new Noise(this.seed ^ 0x137f);
      this._nWarpB = new Noise(this.seed ^ 0x7c21);
      this._nDet = new Noise(this.seed ^ 0x3d9a);
    }
  }
  _elevAt(wx, wy) {
    const W = this.W, H = this.H, elev = this.elevOf;
    const fx = wx / TILE - 0.5, fy = wy / TILE - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const sx = fx - x0, sy = fy - y0;
    const xa = clamp(x0, 0, W - 1), xb = clamp(x0 + 1, 0, W - 1);
    const ya = clamp(y0, 0, H - 1), yb = clamp(y0 + 1, 0, H - 1);
    const e00 = elev[ya * W + xa], e10 = elev[ya * W + xb];
    const e01 = elev[yb * W + xa], e11 = elev[yb * W + xb];
    const top = e00 + (e10 - e00) * sx;
    const bot = e01 + (e11 - e01) * sx;
    return top + (bot - top) * sy;
  }
  _buildChunk(ccx, ccy) {
    this._terrainNoise();
    const size = CHUNK * TILE;                  // 256 world px
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cctx = c.getContext('2d');
    const img = cctx.createImageData(size, size);
    const data = img.data;
    const W = this.W, H = this.H, tiles = this.tiles;
    const wx0 = ccx * size, wy0 = ccy * size;
    const nA = this._nWarpA, nB = this._nWarpB, nD = this._nDet;
    const HILL = 46;                            // hillshade strength
    const foam = [];
    let di = 0;
    for (let py = 0; py < size; py++) {
      const wy = wy0 + py + 0.5;
      for (let px = 0; px < size; px++, di += 4) {
        const wx = wx0 + px + 0.5;
        // organic biome boundary: look the tile up at a noise-warped position
        const warpX = nA.value(wx * 0.055, wy * 0.055) * 6;
        const warpY = nB.value(wx * 0.055, wy * 0.055) * 6;
        let tx = ((wx + warpX) / TILE) | 0, ty = ((wy + warpY) / TILE) | 0;
        tx = tx < 0 ? 0 : (tx >= W ? W - 1 : tx);
        ty = ty < 0 ? 0 : (ty >= H ? H - 1 : ty);
        const ti = TILES[tiles[ty * W + tx]];
        const e = this._elevAt(wx, wy);
        const nF = nD.value(wx * 0.34, wy * 0.34);            // fine texture
        const nM = nD.value(wx * 0.06 + 91.7, wy * 0.06);     // medium patches
        let r, g, b;
        if (ti.deep || ti.shallow) {
          // depth gradient: dark abyss -> bright turquoise shallows
          const depth = clamp(invlerp(0.10, 0.36, e), 0, 1);
          const wave = nF * 0.5 + nM * 0.5;
          r = 14 + depth * 62 + wave * 10;
          g = 40 + depth * 106 + wave * 14;
          b = 92 + depth * 116 + wave * 15;
          // shoreline foam band
          const foamT = invlerp(0.328, 0.356, e);
          if (foamT > 0) {
            const f = clamp(foamT, 0, 1) * (0.5 + 0.5 * clamp(nF + 0.4, 0, 1));
            r += (238 - r) * f; g += (246 - g) * f; b += (250 - b) * f;
            if (foamT > 0.55 && ((px + py * 3) % 9) === 0 && foam.length < 320) foam.push(wx0 + px, wy0 + py);
          }
        } else {
          const base = ti.col, alt = ti.col2;
          let mixT = 0.5 + nM * 0.42 + nF * 0.28;
          if (ti.climb) mixT = 0.5 + nF * 0.9;                // rocky striations
          mixT = mixT < 0 ? 0 : (mixT > 1 ? 1 : mixT);
          if (ti.id === T.FLOWERS) mixT *= 0.3;               // pink stays a hint; sprites carry the colour
          r = base.r + (alt.r - base.r) * mixT;
          g = base.g + (alt.g - base.g) * mixT;
          b = base.b + (alt.b - base.b) * mixT;
          // hillshade: light from the north-west
          const eR = this._elevAt(wx + 2.5, wy);
          const eD = this._elevAt(wx, wy + 2.5);
          let sh = 1 + ((e - eR) + (e - eD)) * HILL;
          if (ti.climb) sh = sh * 1.12 - 0.14;                // cliffs pop harder
          sh = sh < 0.55 ? 0.55 : (sh > 1.4 ? 1.4 : sh);
          r *= sh; g *= sh; b *= sh;
          // wet sand darkening right at the waterline
          if (!ti.cold && e < 0.375 && e >= 0.35) {
            const wet = invlerp(0.375, 0.35, e) * 0.22;
            r *= 1 - wet; g *= 1 - wet; b *= 1 - wet * 0.6;
          }
          // snow sparkle
          if (ti.cold && nF > 0.62) { r += 22; g += 22; b += 26; }
        }
        data[di] = r > 255 ? 255 : r;
        data[di + 1] = g > 255 ? 255 : g;
        data[di + 2] = b > 255 ? 255 : b;
        data[di + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);
    return { canvas: c, foam };
  }
  _getChunk(ccx, ccy) {
    const key = ccx + ',' + ccy;
    let c = this._chunks.get(key);
    if (!c) { c = this._buildChunk(ccx, ccy); this._chunks.set(key, c); }
    return c;
  }
  // Synchronously bake every chunk touching a world-px rect. Called at world
  // creation / game start / respawn — moments where a one-time cost is hidden.
  prebuildArea(x0, y0, x1, y1) {
    const size = CHUNK * TILE;
    const maxCX = Math.ceil(this.pxW / size) - 1, maxCY = Math.ceil(this.pxH / size) - 1;
    for (let cy = Math.max(0, Math.floor(y0 / size)); cy <= Math.min(maxCY, Math.floor(y1 / size)); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / size)); cx <= Math.min(maxCX, Math.floor(x1 / size)); cx++)
        this._getChunk(cx, cy);
  }
  // Cheap flat stand-in colour for a chunk that hasn't been baked yet.
  _placeholderColor(ccx, ccy) {
    if (!this._phCols) this._phCols = new Map();
    const key = ccx + ',' + ccy;
    let col = this._phCols.get(key);
    if (!col) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const tx = clamp(ccx * CHUNK + 2 + sx * 5, 0, this.W - 1);
        const ty = clamp(ccy * CHUNK + 2 + sy * 5, 0, this.H - 1);
        const c = TILES[this.tiles[ty * this.W + tx]].col;
        r += c.r; g += c.g; b += c.b; n++;
      }
      col = rgb(r / n, g / n, b / n);
      this._phCols.set(key, col);
    }
    return col;
  }
  drawTerrain(ctx, view, time) {
    const size = CHUNK * TILE;
    const c0 = Math.floor(view.x / size), c1 = Math.floor((view.x + view.w) / size);
    const r0 = Math.floor(view.y / size), r1 = Math.floor((view.y + view.h) / size);
    const maxCX = Math.ceil(this.pxW / size) - 1, maxCY = Math.ceil(this.pxH / size) - 1;
    const t = time || 0;
    // Budgeted baking: at most 2 chunk builds per frame. Missing visible
    // chunks beyond the budget get a flat placeholder for a frame or two, so
    // teleports/fast pans never stack multi-chunk bakes into one frame.
    let budget = 2;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cy < 0 || cx > maxCX || cy > maxCY) continue;
        let chunk = this._chunks.get(cx + ',' + cy);
        if (!chunk) {
          if (budget > 0) { budget--; chunk = this._getChunk(cx, cy); }
          else { ctx.fillStyle = this._placeholderColor(cx, cy); ctx.fillRect(cx * size, cy * size, size, size); continue; }
        }
        ctx.drawImage(chunk.canvas, cx * size, cy * size);
        // animated surf: foam points twinkle along the shoreline. Constant
        // alpha + visibility pulsing keeps this a cheap batched pass.
        const foam = chunk.foam;
        if (foam.length) {
          ctx.fillStyle = 'rgba(240,250,255,0.55)';
          ctx.beginPath();
          for (let i = 0; i < foam.length; i += 2) {
            const fx = foam[i], fy = foam[i + 1];
            if (Math.sin(t * 2.1 + fx * 0.09 + fy * 0.07) > -0.15) ctx.rect(fx, fy, 1.6, 1.2);
          }
          ctx.fill();
        }
      }
    }
    // prewarm: with leftover budget, bake one just-off-screen chunk so walking
    // across a boundary is always ready ahead of time
    if (budget > 0) {
      outer: for (let cy = r0 - 1; cy <= r1 + 1; cy++) {
        for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
          if (cx < 0 || cy < 0 || cx > maxCX || cy > maxCY) continue;
          if (cy >= r0 && cy <= r1 && cx >= c0 && cx <= c1) continue;
          if (!this._chunks.has(cx + ',' + cy)) { this._getChunk(cx, cy); break outer; }
        }
      }
    }
  }

  // Push visible objects into arr as render entries {y, kind:'obj', o};
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
    const lw = cv._lw || cv.width, lh = cv._lh || cv.height;
    // soft blob shadow for solid/tall objects
    if (o.solid || o.type === 'campfire' || o.type === 'korokRock') {
      const sr = (o.r || 6) * 1.6;
      ctx.drawImage(sb.shadow, o.x - sr, o.y + 1 - sr * 0.42, sr * 2, sr * 0.84);
    }
    // gentle wind sway for foliage (skew the top of the sprite)
    const sways = (o.type === 'grass' || o.type === 'flower' || o.type === 'bush' || o.type === 'tree' || o.type === 'pine');
    if (sways && t !== undefined) {
      const amt = (o.type === 'tree' || o.type === 'pine') ? 0.05 : 0.14;
      const sw = Math.sin(t * 1.6 + o.x * 0.05 + o.y * 0.03) * amt;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.transform(1, 0, sw, 1, 0, 0); // horizontal shear grows toward the top
      ctx.drawImage(cv, -lw / 2, -cv._feetY, lw, lh);
      ctx.restore();
      if (o.type === 'korokRock' && !o.done) {
        ctx.fillStyle = '#4f8a3f';
        ctx.beginPath(); ctx.ellipse(o.x + 3, o.y - 8, 2, 4, 0.5, 0, TAU); ctx.fill();
      }
      return;
    }
    ctx.drawImage(cv, o.x - lw / 2, o.y - cv._feetY, lw, lh);
    // korok leaf hint on the rock
    if (o.type === 'korokRock' && !o.done) {
      ctx.fillStyle = '#4f8a3f';
      ctx.beginPath(); ctx.ellipse(o.x + 3, o.y - 8, 2, 4, 0.5, 0, TAU); ctx.fill();
    }
  }
}
