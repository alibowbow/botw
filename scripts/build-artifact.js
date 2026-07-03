'use strict';
/* build-artifact.js — emits dist/artifact.html containing ONLY body content
   (a <style>, the canvas/overlays, and one inlined <script>) so it can be
   published as a self-contained claude.ai Artifact, whose host wraps it in a
   <!doctype html><head></head><body> skeleton. No external references. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

const scriptRe = /<script src="([^"]+)"><\/script>/g;
let m, order = [];
while ((m = scriptRe.exec(html)) !== null) order.push(m[1]);

let js = '';
for (const src of order) {
  js += `\n/* ===== ${src} ===== */\n` + fs.readFileSync(path.join(ROOT, src), 'utf8') + '\n';
}

const body = `<title>Wilderland — Breath of the Top-Down</title>
<style>
${css}
</style>
<div id="wrap">
  <canvas id="game"></canvas>
  <div id="loading">Generating Wilderland…</div>
  <div id="hint">WASD move · Shift sprint · J attack · E interact · M map · Esc pause</div>
</div>
<script>
'use strict';
${js}
</script>
`;

const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
const outPath = path.join(distDir, 'artifact.html');
fs.writeFileSync(outPath, body);
console.log(`Built ${outPath} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB, body-content only).`);
