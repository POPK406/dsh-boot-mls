/* ASAR rebuild used by install.cjs / revert.cjs.
 *
 * Layout (Electron pickle):
 *   u32 4            size-of-size
 *   u32 pickleSize   jsonPadded + 8
 *   u32 payloadSize  jsonPadded + 4
 *   u32 jsonLen      UNPADDED json length
 *   JSON header at byte 16, padded with 0x00 to a 4-byte boundary
 *   file payload at 8 + pickleSize
 *
 * Entries are packed back-to-back with NO per-entry alignment (matches the
 * official archive: every entry starts exactly where the previous one ended).
 * Every entry carries a SHA-256 integrity block; replacements get a freshly
 * computed one and every untouched entry keeps its original block byte for byte.
 */
const fs = require('fs')
const crypto = require('crypto')

const BLOCK = 4194304
const padTo4 = (n) => (4 - (n % 4)) % 4

function integrityOf(buffer) {
  const whole = crypto.createHash('sha256').update(buffer).digest('hex')
  if (buffer.length <= BLOCK) {
    return { algorithm: 'SHA256', hash: whole, blockSize: BLOCK, blocks: [whole] }
  }
  const blocks = []
  for (let offset = 0; offset < buffer.length; offset += BLOCK) {
    blocks.push(crypto.createHash('sha256').update(buffer.subarray(offset, offset + BLOCK)).digest('hex'))
  }
  return { algorithm: 'SHA256', hash: whole, blockSize: BLOCK, blocks }
}

/**
 * Rebuild `srcPath` into `outPath`, replacing the given relative paths.
 * @param {{srcPath: string, outPath: string, replacements: Map<string, Buffer>}} options
 * @returns {{replaced: number, copied: number, verified: number, bytes: number, payloadBytes: number}}
 */
function rebuildArchive({ srcPath, outPath, replacements }) {
  const src = fs.openSync(srcPath, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(src, head, 0, 16, 0)
  const jsonLen = head.readUInt32LE(12)
  const oldPad = padTo4(jsonLen)
  const headerBuf = Buffer.alloc(jsonLen)
  fs.readSync(src, headerBuf, 0, jsonLen, 16)
  const header = JSON.parse(headerBuf.toString('utf8'))
  const oldBase = 16 + jsonLen + oldPad

  const tmpPayload = outPath + '.payload.tmp'
  const payloadFd = fs.openSync(tmpPayload, 'w')
  const newHeader = { files: {} }
  let cursor = 0
  let replaced = 0
  let copied = 0
  let verified = 0

  const copyRaw = (entry) => {
    const buffer = Buffer.alloc(entry.size)
    let read = 0
    while (read < buffer.length) {
      const n = fs.readSync(src, buffer, read, buffer.length - read, oldBase + Number(entry.offset) + read)
      if (!n) break
      read += n
    }
    return buffer.subarray(0, read)
  }

  const emit = (buffer) => {
    fs.writeSync(payloadFd, buffer)
    cursor += buffer.length
  }

  const walk = (nodeIn, base, dest) => {
    for (const [name, child] of Object.entries(nodeIn.files || {})) {
      const rel = base ? base + '/' + name : name
      if (child.files) {
        const dir = { files: {} }
        dest.files[name] = dir
        walk(child, base ? base + '/' + name : name, dir)
        continue
      }
      if (child.unpacked) {
        // Keep every property, including integrity: dropping it shrinks the header
        // and alters metadata the app may rely on.
        dest.files[name] = JSON.parse(JSON.stringify(child))
        continue
      }
      const replacement = replacements.get(rel)
      if (replacement) {
        dest.files[name] = { size: replacement.length, offset: String(cursor), integrity: integrityOf(replacement) }
        emit(replacement)
        replaced += 1
        continue
      }
      const raw = copyRaw(child)
      const entry = { size: raw.length, offset: String(cursor) }
      if (child.integrity) entry.integrity = child.integrity
      dest.files[name] = entry
      emit(raw)
      copied += raw.length
      if (child.integrity && child.integrity.hash) {
        const digest = crypto.createHash('sha256').update(raw).digest('hex')
        if (digest !== child.integrity.hash) throw new Error('source entry changed unexpectedly: ' + rel)
      }
      verified += 1
    }
  }
  walk(header, '', newHeader)
  fs.closeSync(payloadFd)

  const jsonOut = Buffer.from(JSON.stringify(newHeader), 'utf8')
  const pad = padTo4(jsonOut.length)
  const prefix = Buffer.alloc(16)
  prefix.writeUInt32LE(4, 0)
  prefix.writeUInt32LE(jsonOut.length + pad + 8, 4)
  prefix.writeUInt32LE(jsonOut.length + pad + 4, 8)
  prefix.writeUInt32LE(jsonOut.length, 12)

  const out = fs.openSync(outPath, 'w')
  fs.writeSync(out, prefix)
  fs.writeSync(out, jsonOut)
  if (pad) fs.writeSync(out, Buffer.alloc(pad, 0x00))
  const payloadRead = fs.openSync(tmpPayload, 'r')
  const chunk = Buffer.alloc(8 * 1024 * 1024)
  let pos = 0
  for (;;) {
    const n = fs.readSync(payloadRead, chunk, 0, chunk.length, pos)
    if (!n) break
    fs.writeSync(out, chunk.subarray(0, n))
    pos += n
  }
  fs.closeSync(payloadRead)
  fs.closeSync(out)
  fs.closeSync(src)
  fs.unlinkSync(tmpPayload)

  return { replaced, copied, verified, bytes: fs.statSync(outPath).size, payloadBytes: cursor }
}

module.exports = { rebuildArchive, integrityOf, padTo4 }
