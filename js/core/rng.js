'use strict';
/* rng.js — seeded pseudo-random number generator and value/fractal noise. */

class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 1;
  }
  // mulberry32
  next() {
    let t = (this.s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  angle() { return this.next() * TAU; }
  // random point in a disc of radius r
  inDisc(r) {
    const a = this.angle(), d = Math.sqrt(this.next()) * r;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }
}

// 2D value noise with fractal (fBm) octaves. Deterministic from seed.
class Noise {
  constructor(seed) {
    this.seed = seed >>> 0;
  }
  _v(ix, iy) {
    // hashed gradient value in [-1,1]
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(this.seed, 2246822519);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h / 4294967296) * 2 - 1;
  }
  value(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v00 = this._v(x0, y0), v10 = this._v(x0 + 1, y0);
    const v01 = this._v(x0, y0 + 1), v11 = this._v(x0 + 1, y0 + 1);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy; // in [-1,1]
  }
  // fractal Brownian motion; returns approx [-1,1]
  fbm(x, y, octaves, lacunarity, gain) {
    octaves = octaves || 4; lacunarity = lacunarity || 2; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.value(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }
  // normalized [0,1] fbm
  fbm01(x, y, octaves, lacunarity, gain) {
    return this.fbm(x, y, octaves, lacunarity, gain) * 0.5 + 0.5;
  }
}
