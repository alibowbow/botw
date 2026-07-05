'use strict';
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.GAME && window.GAME.world);

  const res = {};
  res.touchEnabled = await page.evaluate(() => GAME.touch.enabled);
  res.bodyTouchClass = await page.evaluate(() => document.body.classList.contains('touch'));
  res.controlsExist = await page.evaluate(() => !!document.getElementById('touch') && !!document.querySelector('#touch .joy'));

  // Tap to start (upper area -> not on a menu option -> starts)
  await page.touchscreen.tap(195, 300);
  await page.waitForTimeout(200);
  res.stateAfterTap = await page.evaluate(() => GAME.state);

  // joystick drag (mouse fallback) to move right
  const joy = await page.evaluate(() => { const r = document.querySelector('#touch .joy').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
  const px0 = await page.evaluate(() => GAME.player.x);
  await page.mouse.move(joy.cx, joy.cy); await page.mouse.down();
  await page.mouse.move(joy.cx + 45, joy.cy); await page.waitForTimeout(600);
  const tm = await page.evaluate(() => ({ x: +GAME.input.touchMove.x.toFixed(2), y: +GAME.input.touchMove.y.toFixed(2) }));
  await page.mouse.up();
  const px1 = await page.evaluate(() => GAME.player.x);
  res.joystick = { touchMove: tm, movedRight: px1 - px0 };
  const tmAfter = await page.evaluate(() => GAME.input.touchMove.x);
  res.joystickReleasedZero = tmAfter === 0;

  // MAP button
  const mapBtn = await page.evaluate(() => { const r = document.querySelector('#touch .map').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(mapBtn.x, mapBtn.y); await page.waitForTimeout(200);
  res.mapOpened = await page.evaluate(() => GAME.state);
  await page.touchscreen.tap(195, 390); await page.waitForTimeout(200); // tap closes map
  res.mapClosed = await page.evaluate(() => GAME.state);

  // Pause via menu button, then tap Resume option
  const menuBtn = await page.evaluate(() => { const r = document.querySelector('#touch .menu').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(menuBtn.x, menuBtn.y); await page.waitForTimeout(200);
  res.paused = await page.evaluate(() => GAME.state);
  const resumeRect = await page.evaluate(() => { const r = GAME._menuRects[0]; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  await page.touchscreen.tap(resumeRect.x, resumeRect.y); await page.waitForTimeout(200);
  res.resumed = await page.evaluate(() => GAME.state);

  await page.screenshot({ path: path.resolve(__dirname, '..', '.testshots', 'touch.png') });
  console.log(JSON.stringify(res, null, 2));
  console.log('errors:', errors.length); errors.forEach(e => console.log('  ' + e));
  await browser.close();

  const fail = [];
  if (errors.length) fail.push('runtime errors');
  if (!res.touchEnabled) fail.push('touch not enabled');
  if (!res.controlsExist) fail.push('controls missing');
  if (res.stateAfterTap !== 'playing') fail.push('tap did not start (' + res.stateAfterTap + ')');
  if (!(res.joystick.touchMove.x > 0.5)) fail.push('joystick did not register (' + JSON.stringify(res.joystick.touchMove) + ')');
  if (!(res.joystick.movedRight > 3)) fail.push('joystick did not move player (' + res.joystick.movedRight + ')');
  if (!res.joystickReleasedZero) fail.push('joystick did not reset on release');
  if (res.mapOpened !== 'map') fail.push('MAP button failed (' + res.mapOpened + ')');
  if (res.mapClosed !== 'playing') fail.push('map close-tap failed (' + res.mapClosed + ')');
  if (res.paused !== 'pause') fail.push('pause button failed (' + res.paused + ')');
  if (res.resumed !== 'playing') fail.push('resume tap failed (' + res.resumed + ')');
  console.log(fail.length ? ('RESULT: FAIL -> ' + fail.join('; ')) : 'RESULT: PASS');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
