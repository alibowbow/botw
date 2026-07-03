'use strict';
// Exercises every major system by teleporting the player to features.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });

  await page.goto(url);
  await page.waitForFunction(() => window.GAME && window.GAME.world);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const tp = (x, y) => page.evaluate(([x, y]) => { GAME.player.x = x; GAME.player.y = y; GAME.player.kbx = GAME.player.kby = 0; GAME._centerCamera(); }, [x, y]);
  const pressE = async () => { await page.keyboard.press('KeyE'); await page.waitForTimeout(120); };
  const results = {};

  // TOWER
  let t = await page.evaluate(() => GAME.world.structures.towers[0]);
  await tp(t.x, t.y + 24); await page.waitForTimeout(120); await pressE();
  results.tower = await page.evaluate(() => ({ activated: GAME.world.structures.towers[0].activated, towersFound: GAME.player.towersFound }));
  // GLIDE (press E again while activated)
  await tp(t.x, t.y + 24); await page.waitForTimeout(120); await pressE();
  results.glide = await page.evaluate(() => GAME.player.state);
  await page.waitForTimeout(200);
  await page.evaluate(() => { GAME.player.state = 'normal'; GAME.player.glideT = 0; });

  // SHRINE
  let s = await page.evaluate(() => GAME.world.structures.shrines[0]);
  const beforeHearts = await page.evaluate(() => GAME.player.maxHearts);
  await tp(s.x, s.y + 20); await page.waitForTimeout(120); await pressE();
  results.shrine = await page.evaluate(([bh]) => ({ activated: GAME.world.structures.shrines[0].activated, shrines: GAME.player.shrines, heartsUp: GAME.player.maxHearts !== bh, maxHearts: GAME.player.maxHearts }), [beforeHearts]);

  // CHEST
  let c = await page.evaluate(() => { const ch = GAME.world.structures.chests[0]; return { x: ch.x, y: ch.y, item: ch.item }; });
  const wc0 = await page.evaluate(() => GAME.player.weapons.length);
  await tp(c.x, c.y + 14); await page.waitForTimeout(120); await pressE();
  results.chest = await page.evaluate(([w0]) => ({ opened: GAME.world.structures.chests[0].opened, weaponsGrew: GAME.player.weapons.length >= w0 }), [wc0]);

  // KOROK
  let k = await page.evaluate(() => GAME.world.structures.koroks[0]);
  await tp(k.x, k.y + 8); await page.waitForTimeout(120); await pressE();
  await page.waitForTimeout(400);
  results.korok = await page.evaluate(() => ({ done: GAME.world.structures.koroks[0].done, pickupExists: GAME.pickups.some(p => p.type === 'korok') }));

  // COOK
  await page.evaluate(() => { GAME.player.food.apple = 3; });
  let cp = await page.evaluate(() => GAME.world.structures.cookpots[0]);
  await tp(cp.x, cp.y + 14); await page.waitForTimeout(120); await pressE();
  results.cook = await page.evaluate(() => ({ cooked: GAME.player.food.cooked, apples: GAME.player.food.apple }));

  // SWIM: find a deep water tile
  const dw = await page.evaluate(() => {
    const w = GAME.world;
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === 0) { const tx = i % w.W, ty = Math.floor(i / w.W); return { x: tx * 16 + 8, y: ty * 16 + 8 }; }
    return null;
  });
  if (dw) { await tp(dw.x, dw.y); await page.waitForTimeout(200); results.swim = await page.evaluate(() => GAME.player.state); }

  // CLIMB: find a cliff tile with a walkable neighbor to its left
  const cliff = await page.evaluate(() => {
    const w = GAME.world;
    for (let ty = 3; ty < w.H - 3; ty++) for (let tx = 3; tx < w.W - 3; tx++) {
      if (w.tiles[ty * w.W + tx] === 9) { // CLIFF
        const left = w.tiles[ty * w.W + (tx - 1)];
        const lt = TILES[left];
        if (!lt.solid && !lt.deep) return { px: (tx - 1) * 16 + 8, py: ty * 16 + 8, cliffx: tx * 16 + 8 };
      }
    }
    return null;
  });
  if (cliff) {
    await tp(cliff.px, cliff.py); await page.waitForTimeout(80);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
    results.climb = await page.evaluate(() => ({ state: GAME.player.state, stamina: GAME.player.stamina.toFixed(2) }));
    await page.evaluate(() => { GAME.player.state = 'normal'; });
  }

  // COMBAT: spawn enemy next to player and attack
  const combat = await page.evaluate(async () => {
    const p = GAME.player; p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y; GAME._centerCamera();
    const e = GAME.spawnEnemy(p.x + 14, p.y, 'bokoblin');
    e.hp = 3; e.aggro = false;
    return { hp0: e.hp };
  });
  await page.evaluate(() => { GAME.player.facing = 'right'; });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(320); }
  await page.waitForTimeout(400);
  results.combat = await page.evaluate(() => ({ enemiesAlive: GAME.enemies.filter(e => e.alive).length, anyPickups: GAME.pickups.length }));

  // NIGHT + BLOOD MOON visuals
  await page.evaluate(() => { GAME.dayNight.time = 23.5; GAME.dayNight.day = 3; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'assets', 'night.png') });
  results.night = await page.evaluate(() => ({ nightAmt: GAME.dayNight.night.toFixed(2), phase: GAME.dayNight.phase, bloodMoon: GAME.dayNight.bloodMoon.toFixed(2) }));

  // BOW
  await page.evaluate(() => { GAME.dayNight.time = 12; GAME.player.hasBow = true; GAME.player.arrows = 5; GAME.player.x = GAME.world.spawn.x; GAME.player.y = GAME.world.spawn.y; });
  await page.keyboard.press('KeyK'); await page.waitForTimeout(150);
  results.bow = await page.evaluate(() => ({ projectiles: GAME.projectiles.length, arrows: GAME.player.arrows }));

  console.log(JSON.stringify(results, null, 2));
  console.log('ERRORS (' + errors.length + '):');
  for (const e of errors) console.log('  ' + e);

  await page.screenshot({ path: path.resolve(__dirname, '..', 'assets', 'screenshot.png') });
  await browser.close();

  // assertions
  const fail = [];
  if (errors.length) fail.push('runtime errors');
  if (!results.tower.activated) fail.push('tower not activated');
  if (results.glide !== 'glide') fail.push('glide did not start');
  if (!results.shrine.activated) fail.push('shrine not activated');
  if (!results.chest.opened) fail.push('chest not opened');
  if (!results.korok.done) fail.push('korok not lifted');
  if (results.cook.cooked < 1) fail.push('cooking failed');
  if (results.swim && results.swim !== 'swim') fail.push('swim state not entered (' + results.swim + ')');
  if (results.climb && results.climb.state !== 'climb' && results.climb.state !== 'normal') fail.push('climb weird state');
  if (results.bow.projectiles < 1) fail.push('bow did not fire');
  console.log(fail.length ? ('RESULT: FAIL -> ' + fail.join(', ')) : 'RESULT: PASS');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
