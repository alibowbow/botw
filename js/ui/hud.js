'use strict';
/* hud.js — heads-up display drawn in screen space: hearts, stamina wheel,
   equipped weapon + durability, ammo, rupees, koroks, clock, temperature,
   interaction prompt and toast messages. */

class HUD {
  constructor(game) { this.game = game; }

  draw(ctx, W, H) {
    const g = this.game, p = g.player;
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    this._hearts(ctx, p, 16, 16);
    this._stamina(ctx, p, W, H);
    this._topRight(ctx, g, p, W);
    this._weapon(ctx, g, p, 14, H - 58);
    this._temperature(ctx, g, p, W, H);
    this._prompt(ctx, g, W, H);
    this._toasts(ctx, g, W, H);
    this._bloodMoon(ctx, g, W, H);

    ctx.restore();
  }

  _panel(ctx, x, y, w, h, r) {
    r = r || 6;
    ctx.fillStyle = 'rgba(20,26,34,0.55)';
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,200,0.25)'; ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
  }

  _hearts(ctx, p, x, y) {
    const per = 10, size = 15;
    for (let i = 0; i < p.maxHearts; i++) {
      const frac = clamp(p.health - i, 0, 1);
      const hx = x + (i % per) * (size + 2);
      const hy = y + Math.floor(i / per) * (size + 2);
      drawHeartHUD(ctx, hx, hy, size, frac);
    }
  }

  _stamina(ctx, p, W, H) {
    if (p.stamina >= p.maxStamina - 0.001 && !p.staminaLock) return; // hide when full
    // wheel near player? draw a fixed gauge under hearts for clarity
    const cx = 24, cy = 16 + Math.ceil(p.maxHearts / 10) * 17 + 18, r = 12;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(cx, cy, r, -HALF_PI, -HALF_PI + TAU); ctx.stroke();
    const frac = clamp(p.stamina / p.maxStamina, 0, 1);
    ctx.strokeStyle = p.staminaLock ? '#e8a030' : '#7bd24a';
    ctx.beginPath(); ctx.arc(cx, cy, r, -HALF_PI, -HALF_PI + TAU * frac); ctx.stroke();
  }

  _topRight(ctx, g, p, W) {
    const x = W - 190, y = 14;
    this._panel(ctx, x, y, 176, 60, 8);
    ctx.font = '12px monospace'; ctx.textAlign = 'left';
    // clock
    const dn = g.dayNight;
    ctx.fillStyle = '#dfe8ee';
    ctx.fillText(`${dn.phase}  Day ${dn.day}`, x + 12, y + 20);
    ctx.fillStyle = '#9fb8c8';
    ctx.fillText(formatClock(dn.time), x + 12, y + 36);
    // resources
    ctx.textAlign = 'right';
    const icoR = g.sprites.icon.rupeeGreen, icoK = g.sprites.icon.korok, icoA = g.sprites.icon.arrow;
    if (icoR) ctx.drawImage(icoR, x + 96, y + 8, 14, 14);
    ctx.fillStyle = '#a6f0b8'; ctx.fillText(String(p.rupees), x + 130, y + 20);
    if (icoK) ctx.drawImage(icoK, x + 136, y + 8, 14, 14);
    ctx.fillStyle = '#bfe6a0'; ctx.fillText(String(p.koroks), x + 168, y + 20);
    if (icoA) ctx.drawImage(icoA, x + 96, y + 26, 14, 14);
    ctx.fillStyle = '#e0d0a0'; ctx.fillText(String(p.arrows), x + 130, y + 38);
    ctx.fillStyle = '#8fd0f0'; ctx.textAlign = 'left';
    ctx.fillText(`Shrines ${p.shrines}`, x + 12, y + 52);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c8b0e0';
    ctx.fillText(`Towers ${p.towersFound}/${g.world.structures.towers.length}`, x + 168, y + 52);
  }

  _weapon(ctx, g, p, x, y) {
    this._panel(ctx, x, y, 150, 44, 8);
    const w = p.weapon;
    const icon = g.sprites.icon[w.icon];
    if (icon) ctx.drawImage(icon, x + 8, y + 12, 22, 22);
    ctx.font = '11px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8eef2';
    ctx.fillText(w.name.length > 16 ? w.name.slice(0, 15) + '…' : w.name, x + 36, y + 18);
    ctx.fillStyle = '#9fb8c8'; ctx.fillText('ATK ' + w.dmg, x + 36, y + 33);
    // durability bar
    if (isFinite(w.maxDur)) {
      const bw = 100, bx = x + 36, by = y + 36;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, 3);
      const frac = clamp(w.dur / w.maxDur, 0, 1);
      ctx.fillStyle = frac > 0.4 ? '#7bd24a' : (frac > 0.18 ? '#e8c23a' : '#e0483a');
      ctx.fillRect(bx, by, bw * frac, 3);
    }
    // weapon count / cycle hint
    if (p.weapons.length > 1) { ctx.fillStyle = '#7f98a8'; ctx.textAlign = 'right'; ctx.fillText(`[Q] ${p.wi + 1}/${p.weapons.length}`, x + 144, y + 18); }
  }

  _temperature(ctx, g, p, W, H) {
    if (p.temp > -0.2 && p.temp < 0.2 && p.coldResist <= 0) return;
    const x = W - 40, y = H / 2 - 40, h = 80;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, x, y, 12, h, 6); ctx.fill();
    // marker
    const t = clamp((p.temp + 1) / 2, 0, 1); // 0 cold bottom, 1 hot top
    const my = y + h - t * h;
    const cold = p.temp < -0.35 && p.coldResist <= 0;
    ctx.fillStyle = cold ? '#6ab0ff' : (p.temp > 0.3 ? '#ff8a4a' : '#bfe0ff');
    ctx.beginPath(); ctx.arc(x + 6, my, 5, 0, TAU); ctx.fill();
    if (p.coldResist > 0) { ctx.fillStyle = '#ffb84a'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('warm', x + 6, y - 4); }
  }

  _prompt(ctx, g, W, H) {
    if (!g.currentInteract) return;
    const label = g.currentInteract.label;
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width + 28;
    const x = W / 2 - tw / 2, y = H - 96;
    this._panel(ctx, x, y, tw, 26, 8);
    ctx.fillStyle = '#ffe9a0';
    ctx.fillText(label, W / 2, y + 18);
  }

  _toasts(ctx, g, W, H) {
    ctx.textAlign = 'center'; ctx.font = '13px monospace';
    let y = H - 130;
    for (let i = 0; i < g.toasts.length; i++) {
      const t = g.toasts[i];
      ctx.globalAlpha = clamp(t.life, 0, 1);
      const tw = ctx.measureText(t.msg).width + 24;
      this._panel(ctx, W / 2 - tw / 2, y - 15, tw, 22, 6);
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = '#eef4f8';
      ctx.fillText(t.msg, W / 2, y);
      y -= 26;
    }
    ctx.globalAlpha = 1;
  }

  _bloodMoon(ctx, g, W, H) {
    const b = g.dayNight.bloodMoon;
    if (b < 0.1) return;
    ctx.globalAlpha = b;
    ctx.fillStyle = '#e04040'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Blood Moon Rising', W / 2, 60);
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeartHUD(ctx, x, y, size, frac) {
  const cx = x + size / 2, cy = y + size / 2;
  // container
  heartPath(ctx, cx, cy, size * 0.5);
  ctx.fillStyle = 'rgba(20,10,14,0.7)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  if (frac > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size * frac, size);
    ctx.clip();
    heartPath(ctx, cx, cy, size * 0.5);
    ctx.fillStyle = '#e8434f'; ctx.fill();
    heartPath(ctx, cx - size * 0.12, cy - size * 0.1, size * 0.22);
    ctx.fillStyle = '#ff9aa0'; ctx.fill();
    ctx.restore();
  }
}
