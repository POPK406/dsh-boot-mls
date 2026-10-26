/* Minimal Electron asar reader/rebuilder.
 *
 * Layout (header = pickle):
 *   u32 4            pickle header size
 *   u32 jsonLen + 8  f1
 *   u32 jsonLen + 4  f2
 *   u32 jsonLen      f3
 *   JSON header at byte 16, first file data at 16 + jsonLen (+ padding)
 *
 * The JSON block is padded with 0x20 (spaces) — padding with 0x00 makes
 * Chromium reject the whole archive, which looks like "the app won't start".
 */
const fs = require('fs')
const path = require('path')

function padTo4(n) {
  return (4 - (n % 4)) % 4
}

function readArchive(file) {
  const fd = fs.openSync(file, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const jsonLen = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(jsonLen)
  fs.readSync(fd, jsonBuf, 0, jsonLen, 16)
  const header = JSON.parse(jsonBuf.toString('utf8'))
  const dataBase = 16 + jsonLen + padTo4(jsonLen)
  const size = fs.statSync(file).size

  function node(relPath) {
    let current = header
    for (const part of relPath.split('/').filter(Boolean)) {
      if (!current || !current.files || !current.files[part]) return null
      current = current.files[part]
    }
    return current
  }

  function read(relPath) {
    const entry = node(relPath)
    if (!entry || entry.files || entry.unpacked) return null
    const buffer = Buffer.alloc(entry.size)
    fs.readSync(fd, buffer, 0, entry.size, dataBase + Number(entry.offset))
    return buffer
  }

  return { file, fd, header, head, dataBase, size, node, read, close: () => fs.closeSync(fd) }
}

function rebuild(archive, replacements, outFile) {
  const fd = archive.fd
  const dataBase = archive.dataBase
  const newHeader = { files: {} }
  const chunks = []
  let cursor = 0
  let replaced = 0
  let skipped = 0

  function copyPacked(entry) {
    const buffer = Buffer.alloc(entry.size)
    fs.readSync(fd, buffer, 0, entry.size, dataBase + Number(entry.offset))
    return buffer
  }

  function walk(nodeIn, base, dest) {
    for (const [name, child] of Object.entries(nodeIn.files || {})) {
      const rel = (base + '/' + name).replace(/^\//, '')
      if (child.files) {
        const dir = { files: {} }
        dest.files[name] = dir
        walk(child, base + '/' + name, dir)
        continue
      }
      if (child.unpacked) {
        dest.files[name] = { size: child.size, unpacked: true }
        continue
      }
      const data = Object.prototype.hasOwnProperty.call(replacements, rel) ? replacements[rel] : copyPacked(child)
      if (Object.prototype.hasOwnProperty.call(replacements, rel)) replaced += 1
      else skipped += 1
      const entry = { size: data.length, offset: String(cursor) }
      if (child.integrity && !Object.prototype.hasOwnProperty.call(replacements, rel)) entry.integrity = child.integrity
      dest.files[name] = entry
      chunks.push(data)
      cursor += data.length
      const pad = padTo4(data.length)
      if (pad) {
        chunks.push(Buffer.alloc(pad))
        cursor += pad
      }
    }
  }

  walk(archive.header, '', newHeader)

  const jsonOut = Buffer.from(JSON.stringify(newHeader), 'utf8')
  const jsonPadded = Buffer.concat([jsonOut, Buffer.alloc(padTo4(jsonOut.length), 0x20)])
  const prefix = Buffer.alloc(16)
  prefix.writeUInt32LE(archive.head.readUInt32LE(0), 0)
  prefix.writeUInt32LE(jsonPadded.length + 8, 4)
  prefix.writeUInt32LE(jsonPadded.length + 4, 8)
  prefix.writeUInt32LE(jsonPadded.length, 12)

  const out = fs.openSync(outFile, 'w')
  fs.writeSync(out, prefix)
  fs.writeSync(out, jsonPadded)
  for (const chunk of chunks) fs.writeSync(out, chunk)
  fs.closeSync(out)

  return { outFile, bytes: fs.statSync(outFile).size, replaced, skipped }
}

/* Walks every packed entry and hashes it, so a rebuild can be compared against
 * the original archive entry by entry. */
function hashes(archive, skip) {
  const result = new Map()
  const crypto = require('crypto')
  function walk(nodeIn, base) {
    for (const [name, child] of Object.entries(nodeIn.files || {})) {
      const rel = (base + '/' + name).replace(/^\//, '')
      if (child.files) {
        walk(child, base + '/' + name)
        continue
      }
      if (child.unpacked) continue
      if (skip && skip.includes(rel)) continue
      const buffer = Buffer.alloc(child.size)
      fs.readSync(archive.fd, buffer, 0, child.size, archive.dataBase + Number(child.offset))
      result.set(rel, crypto.createHash('sha256').update(buffer).digest('hex'))
    }
  }
  walk(archive.header, '')
  return result
}

function findInstall(explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (process.env.DSH_NEXT_APP) candidates.push(process.env.DSH_NEXT_APP)
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'DSH NEXT'))
  candidates.push('C:\\Program Files\\DSH NEXT', 'D:\\DSH NEXT', 'D:\\Software\\DSH NEXT')
  for (const candidate of candidates) {
    try {
      if (fs.statSync(path.join(candidate, 'resources', 'app.asar')).isFile()) return candidate
    } catch (error) {}
  }
  return null
}

module.exports = { readArchive, rebuild, hashes, findInstall, padTo4 }
