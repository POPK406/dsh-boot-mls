'use strict';
// Verifies a rebuilt asar completely: pickle layout, every packed entry readable,
// integrity hashes, offset contiguity, and the two patched files' expected content.
// Usage: node verify-rebuild.cjs <archive> [--expect-effects]
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const archive = process.argv[2];
const expectEffects = process.argv.includes('--expect-effects');
if (!archive) throw new Error('Usage: node verify-rebuild.cjs <archive> [--expect-effects]');

const fd = fs.openSync(archive, 'r');
const size = fs.fstatSync(fd).size;
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const lead = head.readUInt32LE(0);
const pickleLen = head.readUInt32LE(4);
const picklePayloadLen = head.readUInt32LE(8);
const jsonLen = head.readUInt32LE(12);
if (lead !== 4) throw new Error('bad lead: ' + lead);
if (picklePayloadLen !== jsonLen + (4 - (jsonLen % 4)) % 4 + 4) throw new Error('pickle payload mismatch');
if (pickleLen !== picklePayloadLen + 4) throw new Error('pickle mismatch');
const padLen = (4 - (jsonLen % 4)) % 4;
const hb = Buffer.alloc(jsonLen);
fs.readSync(fd, hb, 0, jsonLen, 16);
const header = JSON.parse(hb.toString('utf8'));
const base = 16 + jsonLen + padLen + (0);
const payloadStart = 8 + pickleLen;
console.log('layout: jsonLen=' + jsonLen + ' pad=' + padLen + ' payloadStart=' + payloadStart + ' fileSize=' + size);

let packed = 0;
let integrityOk = 0;
let integrityMissing = 0;
const problems = [];
const ranges = [];

function verify(node, prefix) {
  for (const [name, e] of Object.entries(node.files || {})) {
    const rel = prefix ? prefix + '/' + name : name;
    if (e.files) { verify(e, rel); continue; }
    if (e.unpacked) continue;
    packed += 1;
    const start = payloadStart + Number(e.offset);
    if (start + e.size > size) { problems.push(rel + ': out of bounds'); continue; }
    const buf = Buffer.alloc(e.size);
    let read = 0;
    while (read < buf.length) {
      const n = fs.readSync(fd, buf, read, buf.length - read, start + read);
      if (!n) break;
      read += n;
    }
    if (read !== e.size) { problems.push(rel + ': short read'); continue; }
    ranges.push({ rel, o: Number(e.offset), s: e.size });
    if (!e.integrity) { integrityMissing += 1; continue; }
    if (e.integrity.blockSize === 4194304 && buf.length > 4194304) {
      const blocks = [];
      for (let off = 0; off < buf.length; off += 4194304) {
        blocks.push(crypto.createHash('sha256').update(buf.subarray(off, off + 4194304)).digest('hex'));
      }
      const whole = crypto.createHash('sha256').update(buf).digest('hex');
      if (whole === e.integrity.hash && JSON.stringify(blocks) === JSON.stringify(e.integrity.blocks)) integrityOk += 1;
      else problems.push(rel + ': integrity mismatch');
    } else {
      const digest = crypto.createHash('sha256').update(buf).digest('hex');
      if (digest === e.integrity.hash) integrityOk += 1;
      else problems.push(rel + ': integrity mismatch');
    }
    if (rel === 'lib/main.js') {
      const text = buf.toString('utf8');
      const marker = 'const MLS_BOOT_HTML = ';
      const at = text.indexOf(marker);
      const end = text.indexOf('\n', at);
      const literal = JSON.parse(text.slice(at + marker.length, end).replace(/\r$/, '').replace(/;$/, ''));
      const probe = path.join(os.tmpdir(), 'verify-main-check.mjs');
      fs.writeFileSync(probe, text);
      execFileSync(process.execPath, ['--check', probe], { stdio: 'inherit' });
      fs.unlinkSync(probe);
      console.log('main.js: bytes=' + buf.length + ' overlayChars=' + literal.length + ' syntax=ok');
      // mlsBootOverlay is a JS function around the payload, not part of the HTML literal.
      if (!text.includes('function mlsBootOverlay')) problems.push('main.js missing mlsBootOverlay');
      if (!text.includes('screen,')) problems.push('main.js missing screen import');
      for (const probe2 of ['mb-logo-top', '--mb-t-hui']) {
        if (!literal.includes(probe2)) problems.push('main.js overlay missing ' + probe2);
      }
      if (expectEffects) {
        for (const probe3 of ['DSH-STARTUP-EFFECTS-V3', '--mb-bend-y', 'mb-hui-in', 'mb-perspective-entry', 'rotateY(var(--mb-bend-y']) {
          if (!literal.includes(probe3)) problems.push('effects missing ' + probe3);
        }
      }
    }
    if (rel === 'lib/web-document.js') {
      const text = buf.toString('utf8');
      const probe = path.join(os.tmpdir(), 'verify-webdoc-check.mjs');
      fs.writeFileSync(probe, text);
      execFileSync(process.execPath, ['--check', probe], { stdio: 'inherit' });
      fs.unlinkSync(probe);
      console.log('web-document.js: bytes=' + buf.length + ' syntax=ok  marBootPlayed=' + text.includes('mar.boot.played'));
    }
  }
}
verify(header, '');
fs.closeSync(fd);

ranges.sort((a, b) => a.o - b.o);
let prev = 0;
let gaps = 0;
for (const r of ranges) { if (r.o !== prev) gaps += 1; prev = r.o + r.s; }
const payloadTail = size - payloadStart;

const result = {
  packed,
  integrityOk,
  integrityMissing,
  nonContiguous: gaps,
  payloadBytes: prev,
  payloadTail,
  problems
};
console.log(JSON.stringify(result, null, 2));
if (problems.length || gaps !== 0 || prev !== payloadTail) process.exitCode = 1;
