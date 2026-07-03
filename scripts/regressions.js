'use strict';
// Regression tests for the specific bugs found in code review.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.GAME && window.GAME.world);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.evaluate(() => { if (GAME.state !== 'playing') GAME.state = 'playing'; });

  const out = {};

  // #1 Blood moon fires exactly ONCE across a full blood night (day 3), not twice.
  out.bloodMoonFires = await page.evaluate(() => {
    const dn = new DayNight(0);
    dn.dayLength = 200; dn.day = 3; dn.time = 0;
    let c = 0; dn.onBloodMoon = () => c++;
    const dt = 1 / 60;
    for (let i = 0; i < 13000; i++) dn.update(dt); // covers ~26h -> crosses into day 4
    return c;
  });

  // #5 Weapon that breaks mid-swing still deals the swung weapon's damage.
  out.weaponBreak = await page.evaluate(() => {
    const p = GAME.player;
    p.weapons = [makeWeapon('claymore'), makeWeapon('sword')]; // claymore dmg 6, sword dmg 3
    p.weapons[0].dur = 1; // breaks on this swing
    p.wi = 0;
    p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y; p.facing = 'right';
    const e = GAME.spawnEnemy(p.x + 12, p.y, 'bokoblin');
    e.hp = 100; e.maxHp = 100; e.aggro = false;
    p._attack(GAME);                 // weapon breaks now (dur 1 -> 0, spliced)
    for (let i = 0; i < 20; i++) p.update(1 / 60, GAME); // resolve the swing
    return { enemyHp: e.hp, remainingWeapon: p.weapon.type, weaponCount: p.weapons.length };
  });

  // #3 Landing a paraglide next to a tower must NOT re-trigger the tower interaction.
  out.glideLand = await page.evaluate(async () => {
    const p = GAME.player;
    const t = GAME.world.structures.towers[0];
    t.activated = true;
    // place player on the tower's flattened (walkable) footprint, within interact range
    p.x = t.x - 14; p.y = t.y; p.state = 'normal'; p.kbx = p.kby = 0;
    p.startGlide(GAME);
    p.glideT = 0.05; p.x = t.x - 14; p.y = t.y; // still adjacent to tower
    // simulate pressing E to land
    GAME.input.pressed['KeyE'] = true;
    p.update(1 / 60, GAME);      // glide land should consume the E edge
    GAME._updateInteraction();   // must NOT see the consumed edge and re-glide
    const st1 = p.state;
    return { stateAfterLand: st1 };
  });

  console.log(JSON.stringify(out, null, 2));
  console.log('errors:', errors.length); errors.forEach(e => console.log('  ' + e));
  await browser.close();

  const fail = [];
  if (errors.length) fail.push('runtime errors');
  if (out.bloodMoonFires !== 1) fail.push('blood moon fired ' + out.bloodMoonFires + ' times (expected 1)');
  if (Math.abs(out.weaponBreak.enemyHp - 94) > 0.6) fail.push('weapon-break swing dealt wrong damage: enemyHp=' + out.weaponBreak.enemyHp + ' (expected ~94 = 100-6 claymore, not 97)');
  if (out.weaponBreak.remainingWeapon !== 'sword') fail.push('broken weapon not replaced by next (' + out.weaponBreak.remainingWeapon + ')');
  if (out.glideLand.stateAfterLand !== 'normal') fail.push('glide-land re-triggered interaction (state=' + out.glideLand.stateAfterLand + ')');
  console.log(fail.length ? ('RESULT: FAIL -> ' + fail.join('; ')) : 'RESULT: PASS');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
