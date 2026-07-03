'use strict';
// Headless smoke test: boots the game, drives input, checks for runtime errors.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); else logs.push(m.type() + ': ' + m.text()); });

  await page.goto(url);
  await page.waitForFunction(() => window.GAME && window.GAME.world, null, { timeout: 15000 });

  const boot = await page.evaluate(() => ({
    state: GAME.state,
    W: GAME.world.W, H: GAME.world.H,
    objects: GAME.world.objects.length,
    towers: GAME.world.structures.towers.length,
    shrines: GAME.world.structures.shrines.length,
    camps: GAME.world.structures.camps.length,
    koroks: GAME.world.structures.koroks.length,
    spawn: GAME.world.spawn,
    hearts: GAME.player.maxHearts,
    zoom: GAME.zoom,
  }));
  console.log('BOOT:', JSON.stringify(boot));

  // Start the game (Enter on the title screen).
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const started = await page.evaluate(() => GAME.state);
  console.log('after Enter, state =', started);

  const p0 = await page.evaluate(() => ({ x: GAME.player.x, y: GAME.player.y }));

  // Move right for ~1.2s
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  const p1 = await page.evaluate(() => ({ x: GAME.player.x, y: GAME.player.y, state: GAME.player.state, hp: GAME.player.health }));
  console.log('moved:', JSON.stringify(p0), '->', JSON.stringify(p1));

  // Sprint down
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyS');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyS'); await page.keyboard.up('ShiftLeft');
  const stam = await page.evaluate(() => GAME.player.stamina);
  console.log('stamina after sprint:', stam);

  // Attack a few times
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(200); }
  // Bomb
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(2200);
  // Open map, inventory, pause, howto
  await page.keyboard.press('KeyM'); await page.waitForTimeout(200);
  let s = await page.evaluate(() => GAME.state); console.log('map state:', s);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
  await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  s = await page.evaluate(() => GAME.state); console.log('inventory state:', s);
  await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  s = await page.evaluate(() => GAME.state); console.log('pause state:', s);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // Let the world simulate to spawn enemies etc.
  await page.waitForTimeout(2500);
  const sim = await page.evaluate(() => ({
    state: GAME.state,
    enemies: GAME.enemies.length,
    pickups: GAME.pickups.length,
    projectiles: GAME.projectiles.length,
    particles: GAME.particles.list.length,
    px: GAME.player.x, py: GAME.player.y, hp: GAME.player.health,
    chunks: GAME.world._chunks.size,
    day: GAME.dayNight.day, time: GAME.dayNight.time.toFixed(2),
  }));
  console.log('SIM:', JSON.stringify(sim));

  await page.screenshot({ path: path.resolve(__dirname, '..', 'assets', 'screenshot.png') });

  // fps sanity: measure frames over 1s
  await page.evaluate(() => { window.__frames = 0; const o = GAME.render.bind(GAME); GAME.render = function () { window.__frames++; return o(); }; });
  await page.waitForTimeout(1000);
  const fps = await page.evaluate(() => window.__frames);
  console.log('approx render calls in 1s:', fps);

  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  console.log('--- ERRORS (' + errors.length + ') ---');
  for (const e of errors) console.log(e);

  await browser.close();

  let fail = false;
  if (errors.length) { console.log('FAIL: runtime errors present'); fail = true; }
  if (started !== 'playing') { console.log('FAIL: game did not start'); fail = true; }
  if (moved < 5) { console.log('FAIL: player did not move (' + moved.toFixed(1) + 'px)'); fail = true; }
  if (fps < 20) { console.log('WARN: low fps (' + fps + ')'); }
  console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(2); });
