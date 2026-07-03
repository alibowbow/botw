'use strict';
/* capture.js — produces the curated screenshots used in the README
   (assets/screenshot.png hero + assets/night.png). Run manually with
   `node scripts/capture.js`; the automated tests write to .testshots/ instead. */

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.goto(url);
  await pg.waitForFunction(() => window.GAME && window.GAME.world);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
  await pg.evaluate(() => {
    GAME.state = 'playing';
    GAME.dayNight.time = 11; GAME.dayNight.day = 1; GAME.dayNight.bloodMoon = 0;
    GAME.player.hasBow = true; GAME.player.arrows = 20; GAME.player.giveWeapon('claymore');
  });
  // wander a little so chunks load and scenery is in frame
  for (const k of ['KeyD', 'KeyS', 'KeyD']) { await pg.keyboard.down(k); await pg.waitForTimeout(500); await pg.keyboard.up(k); }
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.resolve(__dirname, '..', 'assets', 'screenshot.png') });
  console.log('wrote assets/screenshot.png (day)');

  // night scene (avoid a blood-moon day so no red banner)
  await pg.evaluate(() => { GAME.dayNight.time = 22; GAME.dayNight.day = 2; GAME.dayNight.bloodMoon = 0; });
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.resolve(__dirname, '..', 'assets', 'night.png') });
  console.log('wrote assets/night.png (night)');

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
