'use strict';
/* main.js — bootstraps the canvas and runs the fixed-cap game loop. */

(function () {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.GAME = game; // handy for debugging

  function fit() { game.resize(); }
  window.addEventListener('resize', fit);
  fit();

  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-out
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) { game.update(STEP); acc -= STEP; guard++; }
    if (guard >= 5) acc = 0; // avoid spiral of death
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
