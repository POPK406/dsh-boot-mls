'use strict';
// Injects the v2.1 cold-start effects (CSS + hooks) directly into a patched lib/main.js.
// Same transformations patch-archive.cjs performs on the MLS_BOOT_HTML literal, but the
// source is a file instead of an asar entry.
// Usage: node apply-effects-to-main.cjs <in.js> <out.js>
const fs = require('fs');
const path = require('path');

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: apply-effects-to-main.cjs <in.js> <out.js>');

const marker = '/* DSH-STARTUP-EFFECTS-V3 */';
const css = fs.readFileSync(path.join(__dirname, 'startup-effects.css'), 'utf8');
if (!css.includes('mb-logo-warp') || !css.includes('--mb-bend-y') || !css.includes('mb-hui-in')) {
  throw new Error('CSS payload missing/invalid');
}

let js = fs.readFileSync(input, 'utf8');
const prefix = 'const MLS_BOOT_HTML = ';
const begin = js.indexOf(prefix);
if (begin < 0) throw new Error('MLS_BOOT_HTML not found in ' + input);
const end = js.indexOf('\n', begin);
const found = js.slice(begin, end).replace(/\r$/, '').match(/^const MLS_BOOT_HTML = (.+);$/);
if (!found) throw new Error('Cannot parse MLS_BOOT_HTML literal');
let html = JSON.parse(found[1]);
if (html.includes(marker)) throw new Error('Already has ' + marker);

// strip any earlier generation of this same patch layer
html = html.replace(/\/\* DSH-STARTUP-EFFECTS-V\d+ \*\/[\s\S]*?(?=\n<\/style>)/, '');
html = html.replace('</style>', '\n' + marker + '\n' + css + '\n</style>');

// class hooks, injected after the DOM vars are all assigned
const entryPoint = "var caption = q('.mb-caption');";
if (!html.includes(entryPoint)) throw new Error('Intro hook anchor not found');
const inject = entryPoint + "\n  if (logoTop) logoTop.classList.add('mb-perspective-entry');\n  if (caption) caption.classList.add('mb-perspective-entry');\n  if (logoBlueBg) logoBlueBg.classList.add('mb-perspective-warp');";
html = html.replace(entryPoint, inject);

// shared-camera rush: normalize any previous generation back to the pristine form first
const transform = "els[j].style.transform = 'translate(-50%, -50%) scale(' + scale + ')';";
const bent = "if (els[j] && els[j].classList.contains('mb-hui')) { els[j].style.setProperty('--mb-scale', String(scale)); var bu = Math.min(t / 0.72, 1), bs = Math.sin(Math.PI * bu); bs = bs * bs; hostEl.style.setProperty('--mb-bend-y', (8 * bs).toFixed(3) + 'deg'); hostEl.style.setProperty('--mb-bend-x', (-5.5 * bs).toFixed(3) + 'deg'); } else { els[j].style.transform = 'translate(-50%, -50%) scale(' + scale + ')'; }";
const staleBend = /if \(els\[j\]\) if \(els\[j\] && els\[j\]\.classList\.contains\('mb-hui'\)\) \{ els\[j\]\.style\.setProperty\('--mb-scale'[\s\S]*?\} else \{ els\[j\]\.style\.transform = 'translate\(-50%, -50%\) scale\(' \+ scale \+ '\)'; \}/;
if (staleBend.test(html)) html = html.replace(staleBend, transform);
if (!html.includes(transform)) throw new Error('HUI transform anchor not found');
html = html.replace(transform, bent);

js = js.slice(0, begin) + 'const MLS_BOOT_HTML = ' + JSON.stringify(html) + ';' + js.slice(end);
fs.writeFileSync(output, js, 'utf8');
console.log('wrote ' + output + ' bytes=' + js.length + ' payloadChars=' + html.length);
for (const probe of [marker, 'mb-perspective-entry', '--mb-bend-y', 'mb-hui-in', 'rotateY(var(--mb-bend-y']) {
  console.log('  ' + probe + ': ' + html.includes(probe));
}
