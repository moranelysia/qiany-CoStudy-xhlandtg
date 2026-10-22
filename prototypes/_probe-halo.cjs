const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1400)
  const r = await win.webContents.executeJavaScript(`(() => {
    const pick = (s) => { const el = document.querySelector(s); if (!el) return null; const cs = getComputedStyle(el);
      return { r: cs.borderRadius, shape: cs.cornerShape, filter: cs.filter.slice(0, 46) }; };
    return { card: pick('.card'), preview: pick('.v-studio .preview'), input: pick('.input') };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})