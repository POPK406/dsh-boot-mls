'use strict';
// Installs the 2.0.20 port into a live DSH NEXT install:
//   - rebuilds resources/app.asar.mls-transparent from the stock archive
//   - keeps resources/app.asar.stock-mls as the pristine backup
//   - copies the launcher to %LOCALAPPDATA%\mls-boot
// Usage: node install-2.0.20.cjs <appDir> <repoDir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [appDir, repoDir] = process.argv.slice(2);
if (!appDir || !repoDir) throw new Error('Usage: node install-2.0.20.cjs <appDir> <repoDir>');

const resources = path.join(appDir, 'resources');
const stock = path.join(resources, 'app.asar');
const variant = path.join(resources, 'app.asar.mls-transparent');
const backup = path.join(resources, 'app.asar.stock-mls');
const payload = path.join(repoDir, 'payload');

for (const required of [stock, path.join(payload, 'main.js'), path.join(payload, 'web-document.js')]) {
  if (!fs.existsSync(required)) throw new Error('missing required file: ' + required);
}

const lockProbe = (file) => {
  try { const fd = fs.openSync(file, 'r+'); fs.closeSync(fd); return true; } catch { return false; }
};
if (!lockProbe(stock)) throw new Error('app.asar is locked by the running app; quit DSH NEXT first');

if (!fs.existsSync(backup)) {
  fs.copyFileSync(stock, backup);
  console.log('backup created: ' + backup);
}

execFileSync(process.execPath, [
  path.join(__dirname, 'rebuild-asar.cjs'),
  stock,
  variant,
  'lib/main.js=' + path.join(payload, 'main.js'),
  'lib/web-document.js=' + path.join(payload, 'web-document.js')
], { stdio: 'inherit' });

execFileSync(process.execPath, [
  path.join(__dirname, 'verify-rebuild.cjs'),
  variant,
  '--expect-effects'
], { stdio: 'inherit' });

const launcherDir = path.join(process.env.LOCALAPPDATA, 'mls-boot');
fs.mkdirSync(launcherDir, { recursive: true });
const launcherSrc = path.join(payload, 'DSH-Boot-MLS.exe');
if (fs.existsSync(launcherSrc)) {
  fs.copyFileSync(launcherSrc, path.join(launcherDir, 'DSH-Boot-MLS.exe'));
  console.log('launcher installed: ' + path.join(launcherDir, 'DSH-Boot-MLS.exe'));
}

console.log('done. variant bytes=' + fs.statSync(variant).size);
