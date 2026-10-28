'use strict';
// Rebuilds an ASAR with a small set of replaced entries, streaming to disk.
// Matches the official pickle layout: JSON header padded to 4 bytes, payload at 8+pickleSize.
// Usage: node rebuild-asar.cjs <src.asar> <out.asar> <rel=file> ...
const fs = require('fs');
const crypto = require('crypto');

const [srcPath, outPath, ...pairs] = process.argv.slice(2);
if (!srcPath || !outPath || !pairs.length) throw new Error('Usage: node rebuild-asar.cjs <src.asar> <out.asar> <rel=file> ...');
const replacements = new Map();
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  if (eq < 0) throw new Error('bad replacement spec: ' + pair);
  const rel = pair.slice(0, eq);
  const file = pair.slice(eq + 1);
  replacements.set(rel, fs.readFileSync(file));
}

const src = fs.openSync(srcPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(src, head, 0, 16, 0);
const jsonLen = head.readUInt32LE(12);
const padOld = (4 - (jsonLen % 4)) % 4;
const headerBuf = Buffer.alloc(jsonLen);
fs.readSync(src, headerBuf, 0, jsonLen, 16);
const header = JSON.parse(headerBuf.toString('utf8'));
const oldBase = 16 + jsonLen + padOld;

const newHeader = { files: {} };
const BLOCK = 4194304;
let cursor = 0;
let replacedCount = 0;

// Persist the new payload to a temp file first, then assemble the archive.
const tmpPayload = outPath + '.payload.tmp';
const payloadFd = fs.openSync(tmpPayload, 'w');

function copyRaw(en) {
  const buf = Buffer.alloc(en.size);
  let read = 0;
  while (read < buf.length) {
    const n = fs.readSync(src, buf, read, buf.length - read, oldBase + Number(en.offset) + read);
    if (!n) break;
    read += n;
  }
  return buf.subarray(0, read);
}

// The official archive packs entries back-to-back with NO per-entry alignment
// (verified: every original entry starts exactly where the previous one ended).
// Padding here would work but breaks contiguity for no benefit.
function writePadded(buf) {
  fs.writeSync(payloadFd, buf);
  cursor += buf.length;
}

function integrityOf(buf) {
  const whole = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length <= BLOCK) {
    return { algorithm: 'SHA256', hash: whole, blockSize: BLOCK, blocks: [whole] };
  }
  const blocks = [];
  for (let off = 0; off < buf.length; off += BLOCK) {
    blocks.push(crypto.createHash('sha256').update(buf.subarray(off, off + BLOCK)).digest('hex'));
  }
  return { algorithm: 'SHA256', hash: whole, blockSize: BLOCK, blocks };
}

let written = 0;
let verifiedUnchanged = 0;

function walk(nodeIn, base, dest) {
  for (const [name, child] of Object.entries(nodeIn.files || {})) {
    const rel = base ? base + '/' + name : name;
    if (child.files) {
      const dir = { files: {} };
      dest.files[name] = dir;
      walk(child, base ? base + '/' + name : name, dir);
      continue;
    }
    if (child.unpacked) {
      // Preserve every property of unpacked entries, including their integrity block:
      // dropping it silently shrinks the header and changes data the app may verify.
      dest.files[name] = JSON.parse(JSON.stringify(child));
      continue;
    }
    const replacement = replacements.get(rel);
    const eh = child.integrity && child.integrity.hash ? child.integrity.hash : undefined;
    if (replacement) {
      const en = { size: replacement.length, offset: String(cursor) };
      en.integrity = integrityOf(replacement);
      dest.files[name] = en;
      writePadded(replacement);
      replacedCount += 1;
    } else {
      const raw = copyRaw(child);
      const en = { size: raw.length, offset: String(cursor) };
      if (child.integrity) en.integrity = child.integrity;
      dest.files[name] = en;
      writePadded(raw);
      written += raw.length;
      const digest = crypto.createHash('sha256').update(raw).digest('hex');
      if (!eh || digest === eh) verifiedUnchanged += 1;
      else throw new Error('source entry changed unexpectedly: ' + rel);
    }
  }
}
walk(header, '', newHeader);
fs.closeSync(payloadFd);

const jsonOut = Buffer.from(JSON.stringify(newHeader), 'utf8');
const padNew = (4 - (jsonOut.length % 4)) % 4;
const picklePayloadLen = jsonOut.length + padNew + 4;
const pickleLen = picklePayloadLen + 4;
const jsonPadded = Buffer.concat([jsonOut, Buffer.alloc(padNew, 0x00)]);

const out = fs.openSync(outPath, 'w');
const prefix = Buffer.alloc(16);
prefix.writeUInt32LE(4, 0);
prefix.writeUInt32LE(pickleLen, 4);
prefix.writeUInt32LE(picklePayloadLen, 8);
prefix.writeUInt32LE(jsonOut.length, 12);
fs.writeSync(out, prefix);
fs.writeSync(out, jsonPadded);
// stream the payload
const payloadFdRead = fs.openSync(tmpPayload, 'r');
const chunk = Buffer.alloc(8 * 1024 * 1024);
let pos = 0;
for (;;) {
  const n = fs.readSync(payloadFdRead, chunk, 0, chunk.length, pos);
  if (!n) break;
  fs.writeSync(out, chunk.subarray(0, n));
  pos += n;
}
fs.closeSync(payloadFdRead);
fs.closeSync(out);
fs.closeSync(src);
fs.unlinkSync(tmpPayload);

console.log('rebuilt ' + outPath);
console.log('  replaced=' + replacedCount + ' copied=' + written + ' unchangedVerified=' + verifiedUnchanged);
console.log('  jsonLen=' + jsonOut.length + ' pad=' + padNew + ' pickle=' + pickleLen + ' payloadStart=' + (8 + pickleLen));
console.log('  bytes=' + fs.statSync(outPath).size + ' payloadBytes=' + cursor);
