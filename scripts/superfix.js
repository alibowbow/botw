'use strict';
// Regression tests for the 7 review fixes on the Super Saiyan upgrade.
// Serves the repo over HTTP (so localStorage works) and drives the game headless.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const fp = path.normalize(path.join(ROOT, u));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (e, data) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); res.end(data); });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.GAME && window.GAME.world);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.evaluate(() => { if (GAME.state !== 'playing') GAME.state = 'playing'; });
  const R = {};

  // #1 flurry gated on slow-mo + cooldown
  R.flurry = await page.evaluate(() => {
    const p = GAME.player; p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y; p.state = 'normal'; p.dodgeT = 0; p.dodgeCd = 0; p.flurry = 0; p.flurryCd = 0; p.stamina = 1; p.awaken = 0;
    const e = GAME.spawnEnemy(p.x + 20, p.y, 'bokoblin'); e.aggro = true;
    p._dodge(GAME);
    const armed = p.flurry > 0 && GAME.slowmoT > 0;
    // end the slow-mo; player.update must clear flurry (2x cannot leak to full speed)
    GAME.slowmoT = 0; p.update(1 / 60, GAME);
    const clearedAfterSlowmo = p.flurry === 0;
    // immediate re-dodge must NOT re-arm flurry (cooldown)
    p.dodgeCd = 0; p._dodge(GAME);
    const noSpamRearm = p.flurry === 0;
    return { armed, clearedAfterSlowmo, noSpamRearm };
  });

  // #4 struck-bolt visual is aged even after the storm ends
  R.bolt = await page.evaluate(() => {
    GAME.weather.state = 'storm'; GAME.weather._boltAt = { x: 0, y: 0, t: 0.2 };
    GAME.weather.state = 'clear';
    GAME.weather.update(0.3, GAME);
    return { cleared: GAME.weather._boltAt === null };
  });

  // #8 slow-mo reset on death
  R.death = await page.evaluate(() => {
    GAME.slowmoT = 2; GAME.timeScale = 0.3;
    GAME.onPlayerDied();
    return { reset: GAME.slowmoT === 0 && GAME.timeScale === 1 };
  });
  await page.evaluate(() => { GAME.player.state = 'normal'; GAME.player.health = GAME.player.maxHearts; GAME.state = 'playing'; });

  // #5 body clang does not lock out the ore in the same swing
  R.bossOre = await page.evaluate(() => {
    const t = GAME.world.structures.talus[0];
    GAME.player.x = t.x; GAME.player.y = t.y - 40; GAME.player.awaken = 0; GAME._checkBoss();
    const b = GAME.boss; if (!b) return { ok: false };
    b.hp = b.maxHp;
    const p = GAME.player; p.x = b.x - 30; p.y = b.y; p.facing = 'right'; p.aim = 0; // player left of boss, facing right into it
    const w = { dmg: 6, reach: 30, arc: 2.1 };
    b.oreAng = 0; // ore on the FAR (right) side -> out of reach: a body clang, not an ore hit
    b.meleeHit(p, w, GAME, 101); // same swing id
    const hpAfterClang = b.hp;
    b.oreAng = Math.PI; // ore now on the near (left) side, inside the arc
    const oreHit = b.meleeHit(p, w, GAME, 101); // SAME swing -> must still be allowed
    return { clangDidNoDamage: hpAfterClang === b.maxHp, oreHitAfterClang: oreHit && b.hp < hpAfterClang };
  });
  await page.evaluate(() => { GAME.boss = null; });

  // Persistence: defeat talus + damage a weapon, save, reload, verify
  const before = await page.evaluate(() => {
    const p = GAME.player;
    p.x = GAME.world.spawn.x; p.y = GAME.world.spawn.y;
    GAME.world.structures.talus[0].defeated = true;
    p.weapons = [makeWeapon('claymore')]; p.weapons[0].dur = 3; p.wi = 0;
    p.maxHearts = 8;
    GAME._save();
    return { seed: GAME.world.seed, dur: p.weapons[0].dur };
  });
  await page.reload();
  await page.waitForFunction(() => window.GAME && window.GAME.world);
  const after = await page.evaluate(() => {
    const p = GAME.player;
    return { seed: GAME.world.seed, talusDefeated: GAME.world.structures.talus[0].defeated, weaponDur: p.weapons[0].dur, maxHearts: p.maxHearts };
  });
  R.persist = { sameSeed: after.seed === before.seed, talusDefeated: after.talusDefeated, durKept: after.weaponDur === 3, heartsKept: after.maxHearts === 8 };

  console.log(JSON.stringify(R, null, 2));
  console.log('errors:', errors.length); errors.forEach(e => console.log('  ' + e));
  await browser.close(); server.close();

  const fail = [];
  if (errors.length) fail.push('runtime errors');
  if (!(R.flurry.armed && R.flurry.clearedAfterSlowmo && R.flurry.noSpamRearm)) fail.push('flurry gating ' + JSON.stringify(R.flurry));
  if (!R.bolt.cleared) fail.push('bolt not aged after storm');
  if (!R.death.reset) fail.push('slowmo not reset on death');
  if (!(R.bossOre.clangDidNoDamage && R.bossOre.oreHitAfterClang)) fail.push('boss ore lockout ' + JSON.stringify(R.bossOre));
  if (!(R.persist.sameSeed && R.persist.talusDefeated && R.persist.durKept && R.persist.heartsKept)) fail.push('persistence ' + JSON.stringify(R.persist));
  console.log(fail.length ? ('RESULT: FAIL -> ' + fail.join('; ')) : 'RESULT: PASS');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); try { server.close(); } catch (_) {} process.exit(2); });
