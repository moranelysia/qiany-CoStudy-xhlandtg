const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true },
  })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const r = await win.webContents.executeJavaScript(`(() => {
    const sel = (el) => el ? getComputedStyle(el).userSelect : 'missing'
    const q = (s) => document.querySelector(s)
    return {
      body: sel(document.body),
      heroTitle: sel(q('.hero-title')),
      panelText: sel(q('.panel-name') || q('.panel')),
      bubble: sel(q('.bubble-ask') || q('.bubble')),
      input: sel(q('input.input')),
      textarea: sel(q('textarea')),
    }
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})