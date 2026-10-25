// 直接跑主进程逻辑，验证：加密存盘 -> 读出 -> 永不回明文
const { app, safeStorage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

app.whenReady().then(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'costudy-set-'))
  const out = {}
  try {
    // 动态加载编译产物里的 settings 模块
    const settings = require(path.join(__dirname, '..', 'out', 'main', 'index.js'))
    out.loaded = 'index (unexpected)'
  } catch (e) {
    out.loaded = 'need-standalone'
  }
  out.safeStorage = (() => { try { return safeStorage.isEncryptionAvailable() } catch { return false } })()
  if (out.safeStorage) {
    const enc = safeStorage.encryptString('sk-test-123456')
    const dec = safeStorage.decryptString(enc)
    out.roundTrip = dec === 'sk-test-123456'
    out.cipherLen = enc.length
    out.base64 = enc.toString('base64').slice(0, 16) + '…'
  }
  console.log(JSON.stringify(out, null, 1))
  app.exit(0)
})