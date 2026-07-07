'use strict';
/* atmosphere.js — cinematic layers: drifting cloud shadows over the terrain,
   god rays at dawn/dusk, a colour-grade pass and subtle film grain. All the
   heavy textures are baked once; per-frame cost is a few blended draws. */

class Atmosphere {
  constructor(seed) {
    this._buildClouds(seed || 7);
    this._buildGrain();
  }

  _buildClouds(seed) {
    const S = 256;
    const n = new Noise(seed ^ 0xC10D);
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;
    let i = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i += 4) {
        // tileable-ish: sample noise on a torus via two offset reads blended
        const fx = x / S, fy = y / S;
        const a = n.fbm01(x * 0.028, y * 0.028, 3, 2, 0.55);
        const b2 = n.fbm01((x - S) * 0.028, (y - S) * 0.028, 3, 2, 0.55);
        const v = lerp(a, b2, smoothstep(Math.max(fx, fy)));
        const alpha = smoothstep(invlerp(0.52, 0.8, v));
        d[i] = 30; d[i + 1] = 38; d[i + 2] = 58;
        d[i + 3] = alpha * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.clouds = c;
  }

  _buildGrain() {
    // sparse light/dark speckles with alpha baked in, so one plain
    // (source-over) draw is enough — no expensive blend modes per frame
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = Math.random();
      if (r < 0.5) { d[i + 3] = 0; continue; }
      const bright = r > 0.75;
      d[i] = d[i + 1] = d[i + 2] = bright ? 255 : 0;
      d[i + 3] = 10 + Math.random() * 14;
    }
    ctx.putImageData(img, 0, 0);
    this.grain = c;
  }

  // ---- world space (inside the camera transform): drifting cloud shadows ----
  drawClouds(ctx, game) {
    const w = game.weather;
    const density = 0.10 + (w ? w.gloom : 0) * 0.55;   // clearer sky -> fainter
    if (density <= 0.02) return;
    const view = game.view, t = game._time;
    const SCALE = 3.2;                                  // world px per cloud px
    const S = this.clouds.width * SCALE;                // one tile of cloud
    const ox = (t * 8.5) % S, oy = (t * 5.2) % S;
    const x0 = Math.floor((view.x + ox) / S) * S - ox;
    const y0 = Math.floor((view.y + oy) / S) * S - oy;
    // plain alpha draws of a dark cloud texture read as shadows but avoid the
    // costly 'multiply' blend (software renderers crawl on blend modes)
    ctx.save();
    ctx.globalAlpha = clamp(density * 0.75, 0, 0.45);
    for (let y = y0; y < view.y + view.h; y += S) {
      for (let x = x0; x < view.x + view.w; x += S) {
        ctx.drawImage(this.clouds, x, y, S, S);
      }
    }
    ctx.restore();
  }

  // ---- screen space, after lighting: rays, grade, grain ----
  drawPost(ctx, game) {
    const W = game.W, H = game.H;
    const dn = game.dayNight;
    // warm factor peaks mid-dawn / mid-dusk
    const h = dn.time;
    let warm = 0, morning = false;
    if (h > 17 && h < 20) warm = 1 - Math.abs((h - 18.5) / 1.5);
    if (h >= 5 && h < 8) { warm = 1 - Math.abs((h - 6.5) / 1.5); morning = true; }

    // god rays: soft light shafts sweeping from the sun's side of the sky
    if (warm > 0.08 && game.state !== 'map') {
      const sx = morning ? W + 60 : -60;     // sun off the right at dawn, left at dusk
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ang = (morning ? Math.PI : 0) + (i - 2) * 0.09 + Math.sin(game._time * 0.11 + i) * 0.02;
        ctx.save();
        ctx.translate(sx, -40);
        ctx.rotate(ang + (morning ? 0.5 : -0.5));
        const len = Math.hypot(W, H) * 1.4;
        const g = ctx.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, `rgba(255,214,150,${0.10 * warm})`);
        g.addColorStop(0.6, `rgba(255,200,130,${0.035 * warm})`);
        g.addColorStop(1, 'rgba(255,200,130,0)');
        ctx.fillStyle = g;
        const wdt = 60 + i * 34;
        ctx.fillRect(-wdt / 2, 0, wdt, len);
        ctx.restore();
      }
      ctx.restore();
    }

    // colour grade: one gentle tinted fill (plain alpha — cheap everywhere)
    const night = dn.night;
    if (night < 0.5) {
      ctx.fillStyle = `rgba(255,214,150,${0.06 * (1 - night * 2) + warm * 0.06})`;
    } else {
      ctx.fillStyle = `rgba(90,120,220,${0.07 * (night - 0.5) * 2})`;
    }
    ctx.fillRect(0, 0, W, H);

    // film grain: one cached screen-sized layer, plain draw, shifting offset
    if (!this._grainScreen || this._gw !== W || this._gh !== H) {
      this._gw = W; this._gh = H;
      const gs = document.createElement('canvas');
      gs.width = W; gs.height = H;
      const gctx = gs.getContext('2d');
      const S = this.grain.width;
      for (let y = 0; y < H; y += S) for (let x = 0; x < W; x += S) gctx.drawImage(this.grain, x, y);
      this._grainScreen = gs;
    }
    const jx = ((game._time * 61) % 8) | 0, jy = ((game._time * 47) % 8) | 0;
    ctx.drawImage(this._grainScreen, -jx, -jy);
  }
}
