'use strict';
// Verifies the "Super Saiyan" upgrade: lighting, weather, awakening, dodge/flurry,
// boss, elemental status. Captures screenshots for visual inspection.
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
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.evaluate(() => { if (GAME.state !== 'playing') GAME.state = 'playing'; });
  const shot = (n) => page.screenshot({ path: path.resolve(__dirname, '..', '.testshots', n) });
  const R = {};

  // world has talus lairs
  R.talusCount = await page.evaluate(() => GAME.world.structures.talus.length);

  // NIGHT + lighting
  await page.evaluate(() => { GAME.dayNight.time = 22; GAME.dayNight.day = 2; GAME.weather.state = 'clear'; GAME.weather.gloom = 0; });
  await page.waitForTimeout(500); await shot('ss_night.png');

  // STORM + rain + lightning strike setup (metal weapon)
  await page.evaluate(() => { GAME.dayNight.time = 14; GAME.weather.state = 'storm'; GAME.weather.blend = 1; GAME.weather.gloom = 0.5; GAME.weather.rainAmt = 1; });
  await page.waitForTimeout(600); await shot('ss_storm.png');
  R.gloom = await page.evaluate(() => +GAME.weather.gloom.toFixed(2));

  // lightning strike: force it
  R.strike = await page.evaluate(() => {
    GAME.dayNight.time = 14; GAME.weather.state = 'storm';
    GAME.player.weapons = [makeWeapon('claymore')]; GAME.player.wi = 0; GAME.player.awaken = 0;
    const hp0 = GAME.player.health;
    GAME.weather.strikeTimer = 0.001;
    for (let i = 0; i < 6; i++) GAME.weather.update(0.05, GAME); // schedule
    const scheduled = !!GAME.weather.strike;
    for (let i = 0; i < 40; i++) GAME.weather.update(0.05, GAME); // let it land
    return { scheduled, tookDamage: GAME.player.health < hp0 };
  });

  // AWAKENING
  await page.evaluate(() => { GAME.dayNight.time = 20; GAME.weather.state = 'clear'; GAME.weather.rainAmt = 0; GAME.player.awakenMeter = 1; GAME.player.awaken = 0; });
  await page.keyboard.press('KeyR'); await page.waitForTimeout(300);
  R.awaken = await page.evaluate(() => ({ active: GAME.player.awaken > 0, meter: GAME.player.awakenMeter }));
  await page.waitForTimeout(200); await shot('ss_awaken.png');

  // DODGE roll
  R.dodge = await page.evaluate(() => {
    const p = GAME.player;
    p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y;
    p.awaken = 0; p.state = 'normal'; p.dodgeT = 0; p.dodgeCd = 0; p.stamina = 1; p.kbx = 0; p.kby = 0;
    GAME.input.down['KeyD'] = true; // moving right
    const x0 = p.x;
    GAME.input.pressed['Space'] = true;
    p.update(1 / 60, GAME);
    const dodging = p.dodgeT > 0, iframes = p.invuln > 0;
    for (let i = 0; i < 10; i++) p.update(1 / 60, GAME);
    GAME.input.down['KeyD'] = false;
    return { dodging, moved: +(p.x - x0).toFixed(1), iframes };
  });

  // FLURRY RUSH (perfect dodge near an aggro enemy -> slow-mo)
  R.flurry = await page.evaluate(() => {
    const p = GAME.player; p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y; p.state = 'normal'; p.dodgeT = 0; p.dodgeCd = 0; p.stamina = 1; p.awaken = 0;
    const e = GAME.spawnEnemy(p.x + 20, p.y, 'bokoblin'); e.aggro = true;
    GAME.input.pressed['Space'] = true;
    p._dodge(GAME);
    return { flurry: p.flurry > 0, slowmo: GAME.slowmoT > 0 };
  });

  // BOSS: spawn via proximity, damage the ore, verify reward on defeat
  R.boss = await page.evaluate(() => {
    const t = GAME.world.structures.talus[0];
    GAME.player.x = t.x; GAME.player.y = t.y - 40; GAME.player.awaken = 0; GAME._checkBoss();
    const spawned = !!GAME.boss;
    const hearts0 = GAME.player.maxHearts;
    if (GAME.boss) { GAME.boss.hp = 6; const ore = GAME.boss.orePos(); GAME.boss._takeDamage(10, ore.x, ore.y, GAME); }
    return { spawned, defeated: GAME.boss ? GAME.boss.dead : false, heartUp: GAME.player.maxHearts > hearts0 };
  });
  await page.waitForTimeout(200);

  // ELEMENTAL status: fire weapon burns an enemy
  R.elem = await page.evaluate(() => {
    const p = GAME.player; p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y; p.awaken = 0;
    p.weapons = [makeWeapon('sword_fire')]; p.wi = 0; p.facing = 'right';
    const w = p.weapon;
    const e = GAME.spawnEnemy(p.x + 12, p.y, 'bokoblin'); e.hp = 30; e.aggro = false;
    e.applyStatus('fire', GAME);
    const burning = e.status === 'fire';
    const hp0 = e.hp;
    for (let i = 0; i < 60; i++) e.update(1 / 60, GAME); // burn ticks
    return { elementName: w.name, burning, burned: e.hp < hp0 };
  });

  console.log(JSON.stringify(R, null, 2));
  console.log('errors:', errors.length); errors.forEach(e => console.log('  ' + e));
  await browser.close();

  const fail = [];
  if (errors.length) fail.push('runtime errors');
  if (R.talusCount < 1) fail.push('no talus placed');
  if (!R.awaken.active) fail.push('awaken did not activate');
  if (!R.dodge.dodging || R.dodge.moved < 10) fail.push('dodge failed ' + JSON.stringify(R.dodge));
  if (!(R.flurry.flurry && R.flurry.slowmo)) fail.push('flurry rush failed ' + JSON.stringify(R.flurry));
  if (!R.boss.spawned) fail.push('boss did not spawn');
  if (!R.boss.defeated || !R.boss.heartUp) fail.push('boss defeat/reward failed ' + JSON.stringify(R.boss));
  if (!R.elem.burning || !R.elem.burned) fail.push('elemental burn failed ' + JSON.stringify(R.elem));
  if (!R.strike.tookDamage) fail.push('lightning strike failed ' + JSON.stringify(R.strike));
  console.log(fail.length ? ('RESULT: FAIL -> ' + fail.join('; ')) : 'RESULT: PASS');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
