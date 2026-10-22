const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { r: cs.borderRadius, shape: cs.cornerShape || '(none)' }; };
    return { card: pick('.card'), preview: pick('.v-studio .preview'), input: pick('.input'), rail: pick('.v-studio .rail') };
  })()`)
  const shot = await win.webContents.capturePage({ x: 250, y: 330, width: 760, height: 420 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'squircle.png'), shot.toPNG())
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})