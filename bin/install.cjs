/* Installs the MLS cold-start overlay into a DSH NEXT (dsh-desktop-next) install.
 *
 *   node bin/install.cjs --app "C:\Users\you\AppData\Local\Programs\DSH NEXT"
 *   node bin/install.cjs --check        report only, writes nothing
 *   node bin/install.cjs --force        proceed even when the shell hashes differ
 *
 * It never touches a running app's archive: the patched archive is written next
 * to it as app.asar.mls-transparent, and the launcher swaps it in while the app
 * is closed (with a stock backup and automatic rollback).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { readArchive, findInstall } = require('./asar.cjs')
const { rebuildArchive } = require('./rebuild.cjs')

const ROOT = path.resolve(__dirname, '..')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'payload', 'manifest.json'), 'utf8'))

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : null
}
const appDir = findInstall(flag('--app'))
const checkOnly = argv.includes('--check')
const force = argv.includes('--force')
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

if (!appDir) {
  console.error('找不到 DSH NEXT 安装目录，请用 --app "<安装目录>" 指定（该目录下应有 resources\\app.asar）')
  process.exit(2)
}

const resources = path.join(appDir, 'resources')
const stock = path.join(resources, 'app.asar')
const target = path.join(resources, 'app.asar.mls-transparent')
const backup = path.join(resources, 'app.asar.stock-mls')

console.log('安装目录 : ' + appDir)
const archive = readArchive(stock)
const pkgBuffer = archive.read('package.json')
if (!pkgBuffer) {
  console.error('这个 app.asar 里没有 package.json，不是 DSH NEXT 的安装包')
  archive.close()
  process.exit(2)
}
const pkg = JSON.parse(pkgBuffer.toString('utf8'))
console.log('产品     : ' + pkg.name + ' ' + pkg.version)
if (pkg.name !== MANIFEST.product) {
  console.error('产品不匹配：期望 ' + MANIFEST.product + '，实际 ' + pkg.name)
  archive.close()
  process.exit(2)
}

const current = {
  'lib/main.js': sha256(archive.read('lib/main.js')),
  'lib/web-document.js': sha256(archive.read('lib/web-document.js'))
}
archive.close()

let mismatch = 0
for (const name of Object.keys(current)) {
  const expected = MANIFEST.stock[name]
  const ok = expected === current[name]
  console.log('校验 ' + name + ' : ' + (ok ? '通过' : '不一致'))
  if (!ok) {
    mismatch += 1
    console.log('   清单 ' + expected)
    console.log('   实际 ' + current[name])
  }
}
if (mismatch && !force) {
  console.error('壳版本与清单不一致（本次未写入任何文件）。确认要尝试可加 --force；也可先运行 tools/make-manifest.cjs 重新生成清单。')
  process.exit(3)
}
if (mismatch) console.log('--force：忽略壳版本差异继续。')

if (checkOnly) {
  console.log('仅检查模式，未写入任何文件。')
  process.exit(0)
}

const replacements = new Map([
  ['lib/main.js', fs.readFileSync(path.join(ROOT, 'payload', 'main.js'))],
  ['lib/web-document.js', fs.readFileSync(path.join(ROOT, 'payload', 'web-document.js'))]
])

const result = rebuildArchive({ srcPath: stock, outPath: target, replacements })
console.log('写入     : ' + target + ' (' + result.bytes + ' 字节)')
console.log('条目     : 替换 ' + result.replaced + ' 个，原样复制 ' + result.verified + ' 个并逐一校验通过')

if (!fs.existsSync(backup)) {
  fs.copyFileSync(stock, backup)
  console.log('备份     : ' + backup)
}

console.log('')
console.log('下一步：关闭 DSH NEXT（含托盘），双击 launcher\\dsh-boot.cmd 或 %LOCALAPPDATA%\\mls-boot\\DSH-Boot-MLS.exe。')
