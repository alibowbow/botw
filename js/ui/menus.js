'use strict';
/* menus.js — title, how-to, pause, inventory and death overlays. Rendering
   only; the game state machine drives selection and transitions. */

class Menus {
  constructor(game) { this.game = game; this.t = 0; }

  update(dt) { this.t += dt; }

  _backdrop(ctx, W, H, alpha) {
    ctx.fillStyle = `rgba(6,10,16,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawTitle(ctx, W, H, options, index) {
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a3d6b'); sky.addColorStop(0.5, '#6a7fb0'); sky.addColorStop(1, '#c8a878');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = 'rgba(255,220,150,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.72, H * 0.34, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,190,0.35)';
    ctx.beginPath(); ctx.arc(W * 0.72, H * 0.34, 72, 0, TAU); ctx.fill();
    // layered hills
    const hills = [['#4a6a4a', 0.66, 90], ['#3a5840', 0.74, 120], ['#2c4432', 0.84, 150]];
    for (const [col, base, amp] of hills) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        const y = H * base + Math.sin(x * 0.008 + base * 10) * (amp * 0.12) + Math.sin(x * 0.02) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    // a distant tower silhouette
    ctx.fillStyle = '#20303a';
    ctx.fillRect(W * 0.2 - 6, H * 0.5, 12, H * 0.34);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.5, 4, 0, TAU); ctx.fill();

    // title
    ctx.textAlign = 'center';
    const cx = W / 2, ty = H * 0.30;
    ctx.save();
    ctx.font = "bold 20px monospace"; ctx.fillStyle = '#d8e6c8';
    ctx.fillText('THE LEGEND OF', cx, ty - 34);
    ctx.font = "bold 54px monospace";
    ctx.lineWidth = 6; ctx.strokeStyle = '#1c2a1c'; ctx.strokeText('WILDERLAND', cx, ty + 12);
    const grad = ctx.createLinearGradient(cx - 200, 0, cx + 200, 0);
    grad.addColorStop(0, '#f0d878'); grad.addColorStop(0.5, '#fff4d0'); grad.addColorStop(1, '#c8a24a');
    ctx.fillStyle = grad; ctx.fillText('WILDERLAND', cx, ty + 12);
    ctx.font = "italic 15px monospace"; ctx.fillStyle = '#e8eec8';
    ctx.fillText('~ Breath of the Top-Down ~', cx, ty + 40);
    ctx.restore();

    this.drawMenuList(ctx, options, index, cx, H * 0.62);

    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px monospace';
    ctx.fillText('Arrow keys / W,S to choose · Enter to select · or just press Enter to begin', cx, H - 24);
  }

  drawMenuList(ctx, options, index, cx, y) {
    ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace';
    for (let i = 0; i < options.length; i++) {
      const sel = i === index;
      const oy = y + i * 30;
      if (sel) {
        const w = ctx.measureText(options[i]).width + 44;
        ctx.fillStyle = 'rgba(255,235,150,0.16)';
        roundRect(ctx, cx - w / 2, oy - 18, w, 26, 6); ctx.fill();
        ctx.fillStyle = '#ffe98a';
        ctx.fillText('▸ ' + options[i] + ' ◂', cx, oy);
      } else {
        ctx.fillStyle = 'rgba(230,238,244,0.7)';
        ctx.fillText(options[i], cx, oy);
      }
    }
  }

  drawHowTo(ctx, W, H) {
    this._backdrop(ctx, W, H, 0.9);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe98a'; ctx.font = 'bold 24px monospace';
    ctx.fillText('HOW TO PLAY', W / 2, 60);
    const lines = [
      ['Move', 'W A S D  or  Arrow Keys'],
      ['Sprint (uses stamina)', 'Hold Shift'],
      ['Climb cliffs (uses stamina)', 'Walk into a cliff'],
      ['Swim (uses stamina)', 'Walk into deep water'],
      ['Attack / Slash', 'J  or  Left-Click'],
      ['Shoot bow', 'K  or  Right-Click (aim with mouse)'],
      ['Throw bomb (rune)', 'B'],
      ['Interact / Open / Activate', 'E  or  Space'],
      ['Cycle weapon', 'Q'],
      ['Eat food (heal)', 'F'],
      ['Map', 'M'],
      ['Inventory', 'Tab'],
      ['Pause', 'Esc  or  P'],
      ['Mute sound / music', '0 / 9'],
    ];
    ctx.font = '14px monospace';
    let y = 100;
    const lx = W / 2 - 220, rx = W / 2 + 210;
    for (const [k, v] of lines) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#cfe0ea'; ctx.fillText(k, lx, y);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffe0a0'; ctx.fillText(v, rx, y);
      y += 24;
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#9fb8c8'; ctx.font = '13px monospace';
    ctx.fillText('Goal: explore, climb towers to reveal the map, clear camps,', W / 2, y + 20);
    ctx.fillText('activate shrines for heart containers, and find hidden Koroks!', W / 2, y + 40);
    ctx.fillStyle = '#ffe98a'; ctx.fillText('Press Esc or Enter to go back', W / 2, H - 30);
  }

  drawPause(ctx, W, H, options, index) {
    this._backdrop(ctx, W, H, 0.6);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8eef2'; ctx.font = 'bold 30px monospace';
    ctx.fillText('PAUSED', W / 2, H * 0.3);
    this.drawMenuList(ctx, options, index, W / 2, H * 0.45);
  }

  drawInventory(ctx, W, H, game) {
    this._backdrop(ctx, W, H, 0.9);
    const p = game.player;
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe98a'; ctx.font = 'bold 22px monospace';
    ctx.fillText('INVENTORY', W / 2, 50);

    // Weapons
    ctx.textAlign = 'left'; ctx.font = '15px monospace'; ctx.fillStyle = '#cfe0ea';
    let x = W / 2 - 240, y = 90;
    ctx.fillText('Weapons', x, y); y += 26;
    ctx.font = '13px monospace';
    for (let i = 0; i < p.weapons.length; i++) {
      const w = p.weapons[i];
      const icon = game.sprites.icon[w.icon];
      if (icon) ctx.drawImage(icon, x, y - 12, 16, 16);
      ctx.fillStyle = i === p.wi ? '#ffe98a' : '#cfe0ea';
      ctx.fillText(`${w.name}  (ATK ${w.dmg}${isFinite(w.maxDur) ? ', ' + Math.ceil(w.dur) + '/' + w.maxDur : ''})`, x + 22, y);
      y += 22;
    }
    y += 6;
    ctx.fillStyle = '#cfe0ea'; ctx.font = '15px monospace'; ctx.fillText('Runes & Ammo', x, y); y += 24;
    ctx.font = '13px monospace';
    ctx.fillText(`Bow: ${p.hasBow ? 'Yes' : 'None'}   Arrows: ${p.arrows}`, x, y); y += 20;
    ctx.fillText(`Bomb Rune: ready in ${Math.max(0, p.bombCd).toFixed(1)}s`, x, y); y += 20;

    // Right column: food + stats
    let rx = W / 2 + 30; y = 90;
    ctx.fillStyle = '#cfe0ea'; ctx.font = '15px monospace'; ctx.fillText('Food (press F to eat best)', rx, y); y += 24;
    ctx.font = '13px monospace';
    const foods = [['apple', 'Apple (+½)'], ['mushroom', 'Mushroom (+¾)'], ['meat', 'Meat (+1½)'], ['cooked', 'Cooked Meal (+3, warm)']];
    for (const [k, label] of foods) {
      const icon = game.sprites.icon[k === 'cooked' ? 'meat' : k];
      if (icon) ctx.drawImage(icon, rx, y - 12, 16, 16);
      ctx.fillStyle = '#e8eef2';
      ctx.fillText(`${label} × ${p.food[k] || 0}`, rx + 22, y); y += 22;
    }
    y += 10;
    ctx.fillStyle = '#cfe0ea'; ctx.font = '15px monospace'; ctx.fillText('Adventure Log', rx, y); y += 24;
    ctx.font = '13px monospace'; ctx.fillStyle = '#e8eef2';
    ctx.fillText(`Hearts: ${p.maxHearts}    Rupees: ${p.rupees}`, rx, y); y += 20;
    ctx.fillText(`Shrines activated: ${p.shrines}`, rx, y); y += 20;
    ctx.fillText(`Towers: ${p.towersFound}/${game.world.structures.towers.length}`, rx, y); y += 20;
    ctx.fillText(`Korok seeds: ${p.koroks}`, rx, y); y += 20;

    // cook hint
    ctx.textAlign = 'center'; ctx.fillStyle = '#9fb8c8'; ctx.font = '12px monospace';
    ctx.fillText('Tip: stand by a cooking pot and press E to cook ingredients into a warm meal.', W / 2, H - 54);
    ctx.fillStyle = '#ffe98a'; ctx.fillText('Press Tab or Esc to close', W / 2, H - 30);
  }

  drawDeath(ctx, W, H, t) {
    ctx.fillStyle = `rgba(40,0,0,${clamp(0.6 * (1 - t / 2.2), 0, 0.6)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffdada'; ctx.font = 'bold 34px monospace';
    ctx.globalAlpha = clamp(1 - t / 2.2, 0, 1);
    ctx.fillText('You Died', W / 2, H / 2 - 8);
    ctx.font = '14px monospace'; ctx.fillStyle = '#e8c0c0';
    ctx.fillText('Returning to your last resting place…', W / 2, H / 2 + 22);
    ctx.globalAlpha = 1;
  }
}
