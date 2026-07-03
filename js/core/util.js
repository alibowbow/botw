'use strict';
/* util.js — math, vectors, collision, color and misc helpers.
   Loaded as a classic script; all names below are shared globals. */

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function invlerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function sqr(v) { return v * v; }

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function vlen(x, y) { return Math.hypot(x, y); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angDiff(a, b) { let d = (b - a) % TAU; if (d < -Math.PI) d += TAU; if (d > Math.PI) d -= TAU; return d; }
function approach(cur, target, step) {
  if (cur < target) return Math.min(cur + step, target);
  if (cur > target) return Math.max(cur - step, target);
  return cur;
}
function approachAngle(cur, target, step) {
  const d = angDiff(cur, target);
  if (Math.abs(d) <= step) return target;
  return cur + sign(d) * step;
}

// Normalize a 2D vector; returns {x,y} unit vector (0,0 stays 0,0).
function normalize(x, y) {
  const l = Math.hypot(x, y);
  if (l < 1e-8) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

// Axis-aligned overlap tests
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px < rx + rw && py >= ry && py < ry + rh;
}
// Distance from circle center to the nearest point of a rect (0 if inside).
function circleRectDist(cx, cy, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  return dist(cx, cy, nx, ny);
}
function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  return circleRectDist(cx, cy, rx, ry, rw, rh) < r;
}
function circlesOverlap(ax, ay, ar, bx, by, br) {
  const rr = ar + br; return dist2(ax, ay, bx, by) < rr * rr;
}

// Facing: convert a direction vector into one of 'down','up','left','right'
function facingFromVec(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
function vecFromFacing(f) {
  switch (f) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
  return { x: 0, y: 1 };
}

/* -------- Color helpers (work on {r,g,b}) -------- */
function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }
function rgba(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function mixRGB(a, b, t) {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}
function shade(c, amt) {
  // amt in [-1,1]; negative darkens, positive lightens
  if (amt >= 0) return { r: lerp(c.r, 255, amt), g: lerp(c.g, 255, amt), b: lerp(c.b, 255, amt) };
  return { r: lerp(c.r, 0, -amt), g: lerp(c.g, 0, -amt), b: lerp(c.b, 0, -amt) };
}
function css(c, a) { return a === undefined ? rgb(c.r, c.g, c.b) : rgba(c.r, c.g, c.b, a); }

// Cheap deterministic hash -> [0,1)
function hash01(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 ? ((h ^ (h >>> 16)) >>> 0) / 4294967296 : 0;
}

function formatClock(hours) {
  // hours in [0,24)
  let h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const ampm = h < 12 ? 'AM' : 'PM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${m < 10 ? '0' + m : m} ${ampm}`;
}

// Round a world position to the nearest device pixel for crisp rendering.
function pxSnap(v, zoom) { return Math.round(v * zoom) / zoom; }
