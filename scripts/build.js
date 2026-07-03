'use strict';
/* build.js — inlines index.html + styles.css + all game scripts into a single
   self-contained HTML file at dist/wilderland.html. Because the game uses no
   external assets (art & audio are procedural) the result runs offline from a
   double-click, and is small enough to paste anywhere. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

// Extract script sources in order.
const scriptRe = /<script src="([^"]+)"><\/script>/g;
let m, order = [];
while ((m = scriptRe.exec(html)) !== null) order.push(m[1]);

let js = '';
for (const src of order) {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  js += `\n/* ===== ${src} ===== */\n` + code + '\n';
}

// Build the standalone document: strip the <link> and <script src> tags,
// inline CSS in <head> and one big <script> before </body>.
let out = html
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
  .replace(/<!-- core -->[\s\S]*?<script src="js\/main.js"><\/script>/, `<script>\n'use strict';\n${js}\n</script>`);

const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
const outPath = path.join(distDir, 'wilderland.html');
fs.writeFileSync(outPath, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`Built ${outPath} (${kb} KB, ${order.length} scripts inlined).`);
