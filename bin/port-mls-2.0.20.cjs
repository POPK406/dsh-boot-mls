'use strict';
// Ports the MLS cold-start overlay from dsh-desktop-next 2.0.19 to 2.0.20.
//   1) adds `screen` to the electron import
//   2) inserts the MLS block before createWindow()
//   3) replaces the ready-to-show handler with the overlay variant
//   4) patches web-document.js so the boot overlay marks sessionStorage
// Usage: node port-mls-2.0.20.cjs <stockMain.js> <stockWebDoc.js> <mlsBlock.js> <outDir>
const fs = require('fs');
const path = require('path');

const [mainPath, webDocPath, blockPath, outDir] = process.argv.slice(2);
if (!mainPath || !outDir) throw new Error('Usage: port-mls-2.0.20.cjs <main> <webDoc> <block> <outDir>');

let main = fs.readFileSync(mainPath, 'utf8');
let webDoc = fs.readFileSync(webDocPath, 'utf8');
const block = fs.readFileSync(blockPath, 'utf8');

// 1) electron import: add `screen`
const importFrom = 'import { BrowserWindow, Menu,';
const importTo = 'import { BrowserWindow, screen, Menu,';
if (!main.includes(importFrom)) throw new Error('electron import anchor not found');
if (!main.includes('BrowserWindow, screen')) main = main.replace(importFrom, importTo);

// 2) insert MLS block before createWindow(, right after WINDOWS_CAPTION_FILL
const captionFill = 'const WINDOWS_CAPTION_FILL = "#00000000";';
if (!main.includes(captionFill)) throw new Error('WINDOWS_CAPTION_FILL not found');
if (!main.includes('mlsBootOverlay')) {
  main = main.replace(captionFill, captionFill + '\n' + block);
} else {
  throw new Error('MWL block already present in this main.js (already ported)');
}

// 3) ready-to-show -> overlay handshake
const plainShow = '\twindow.once("ready-to-show", () => show(window));';
if (!main.includes(plainShow)) throw new Error('ready-to-show anchor not found');
const overlayShow = [
  '\twindow.once("ready-to-show", () => {',
  '\t\tif (primary && process.platform === "win32") {',
  '\t\t\tmlsBootOverlay({',
  '\t\t\t\twin: window,',
  '\t\t\t\treveal: () => { try { window.maximize(); } catch (error) {} show(window); }',
  '\t\t\t});',
  '\t\t\treturn;',
  '\t\t}',
  '\t\tif (primary) window.maximize();',
  '\t\tshow(window);',
  '\t});'
].join('\n');
main = main.replace(plainShow, overlayShow);

// 4) web-document.js: mark the boot as played so the in-page loader never double-runs
const webAnchor = 'body.toString().replace("<head>", "<head>" + LOADING_STYLE + APP_BOOT_SCRIPT)';
const webReplacement = 'body.toString().replace("<head>", "<head>" + LOADING_STYLE + APP_BOOT_SCRIPT + "<script>try{sessionStorage.setItem(\\"mar.boot.played\\",\\"1\\")}catch(e){}</script>")';
if (!webDoc.includes(webAnchor)) throw new Error('web-document anchor not found');
webDoc = webDoc.replace(webAnchor, webReplacement);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'main.js'), main);
fs.writeFileSync(path.join(outDir, 'web-document.js'), webDoc);
console.log('ported main.js bytes=' + main.length);
console.log('ported web-document.js bytes=' + webDoc.length);
for (const probe of ['mlsBootOverlay', 'screen,', 'mar.boot.played', 'MBL']) {
  console.log('  contains ' + probe + ': ' + (main.includes(probe) || webDoc.includes(probe)));
}
