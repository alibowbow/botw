'use strict';
/* minimap.js — a corner minimap and a full-screen map. Terrain is baked to a
   1px-per-tile image; areas are revealed by exploring and by towers. */

class Minimap {
  constructor(world) {
    this.world = world;
    const { c, ctx } = makeCanvas(world.W, world.H);
    for (let y = 0; y < world.H; y++) {
      for (let x = 0; x < world.W; x++) {
        const t = TILES[world.tiles[y * world.W + x]];
        ctx.fillStyle = css(t.col);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.base = c;
    // reveal image starts empty; revealed pixels copied from base
    const rv = makeCanvas(world.W, world.H);
    this.reveal = rv.c; this.revealCtx = rv.ctx;
    this.mask = new Uint8Array(world.W * world.H);
    // structure icons pre-marked as revealed? no — discovered by exploration/towers
  }

  revealTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.world.W || ty >= this.world.H) return;
    const i = ty * this.world.W + tx;
    if (this.mask[i]) return;
    this.mask[i] = 1;
    this.revealCtx.drawImage(this.base, tx, ty, 1, 1, tx, ty, 1, 1);
  }

  revealAroundWorld(wx, wy, radiusTiles) {
    const ctx = Math.floor(wx / TILE), cty = Math.floor(wy / TILE);
    const r = radiusTiles;
    for (let y = cty - r; y <= cty + r; y++)
      for (let x = ctx - r; x <= ctx + r; x++)
        if ((x - ctx) * (x - ctx) + (y - cty) * (y - cty) <= r * r) this.revealTile(x, y);
  }

  isRevealedWorld(wx, wy) {
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= this.world.W || ty >= this.world.H) return false;
    return !!this.mask[ty * this.world.W + tx];
  }

  drawSmall(ctx, x, y, size, game) {
    const p = game.player;
    const tilesAcross = 60;
    const half = tilesAcross / 2;
    const ptx = p.x / TILE, pty = p.y / TILE;
    let sx = ptx - half, sy = pty - half;

    ctx.save();
    // frame
    ctx.fillStyle = 'rgba(10,16,22,0.75)';
    roundRect(ctx, x - 3, y - 3, size + 6, size + 6, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(140,200,220,0.35)'; ctx.lineWidth = 1.5;
    roundRect(ctx, x - 3, y - 3, size + 6, size + 6, 8); ctx.stroke();
    // clip
    roundRect(ctx, x, y, size, size, 5); ctx.clip();
    ctx.fillStyle = '#0b1016'; ctx.fillRect(x, y, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.reveal, sx, sy, tilesAcross, tilesAcross, x, y, size, size);

    const scale = size / tilesAcross;
    const toScreen = (wx, wy) => ({ sx: x + (wx / TILE - sx) * scale, sy: y + (wy / TILE - sy) * scale });

    // structures (only if revealed)
    this._icons(ctx, game, toScreen, true);

    // enemies as red dots
    ctx.fillStyle = '#ff5a4a';
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const s = toScreen(e.x, e.y);
      if (s.sx < x || s.sx > x + size || s.sy < y || s.sy > y + size) continue;
      ctx.fillRect(s.sx - 1, s.sy - 1, 2, 2);
    }
    // player arrow
    const ps = toScreen(p.x, p.y);
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.arc(ps.sx, ps.sy, 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    // 'N'
    ctx.fillStyle = '#cfe0ea'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', x + size / 2, y + 10);
  }

  drawFull(ctx, W, H, game) {
    const world = this.world;
    const scale = Math.min((W - 120) / world.W, (H - 140) / world.H);
    const mw = world.W * scale, mh = world.H * scale;
    const ox = (W - mw) / 2, oy = (H - mh) / 2 + 10;
    ctx.fillStyle = 'rgba(6,10,14,0.92)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8eef2'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
    ctx.fillText('MAP', W / 2, oy - 18);

    ctx.fillStyle = '#0b1016'; ctx.fillRect(ox, oy, mw, mh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.reveal, 0, 0, world.W, world.H, ox, oy, mw, mh);
    ctx.strokeStyle = 'rgba(140,200,220,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, mw, mh);

    const toScreen = (wx, wy) => ({ sx: ox + (wx / TILE) * scale, sy: oy + (wy / TILE) * scale });
    this._icons(ctx, game, toScreen, true);
    // player
    const p = game.player; const ps = toScreen(p.x, p.y);
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(ps.sx, ps.sy, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = '#9fb8c8'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Towers reveal the map.  Press M or Esc to close.', W / 2, oy + mh + 24);
    this._legend(ctx, ox, oy + mh + 40);
  }

  _icons(ctx, game, toScreen, requireReveal) {
    const world = this.world;
    // towers
    for (const t of world.structures.towers) {
      if (requireReveal && !this.isRevealedWorld(t.x, t.y)) continue;
      const s = toScreen(t.x, t.y);
      ctx.fillStyle = t.activated ? '#4fd0c8' : '#c8b0e0';
      diamond(ctx, s.sx, s.sy, 3.5); ctx.fill();
    }
    // shrines
    for (const sh of world.structures.shrines) {
      if (requireReveal && !this.isRevealedWorld(sh.x, sh.y)) continue;
      const s = toScreen(sh.x, sh.y);
      ctx.fillStyle = sh.activated ? '#3fd8ff' : '#e08a3a';
      ctx.fillRect(s.sx - 2, s.sy - 2, 4, 4);
    }
  }

  _legend(ctx, x, y) {
    ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#c8b0e0'; ctx.fillText('◆ Tower', x, y);
    ctx.fillStyle = '#e08a3a'; ctx.fillText('■ Shrine', x + 90, y);
    ctx.fillStyle = '#ffe14a'; ctx.fillText('● You', x + 180, y);
  }
}

function diamond(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
