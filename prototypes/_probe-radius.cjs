const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const cs = await win.webContents.executeJavaScript(`(() => {
    const pick = (s) => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el);
      return { r: c.borderRadius, shape: c.cornerShape, h: Math.round(el.getBoundingClientRect().height) }; };
    return { card: pick('.card'), input: pick('.input'), seg: pick('.segmented') };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'radius-match.png'),
    (await win.webContents.capturePage({ x: 280, y: 395, width: 760, height: 260 })).toPNG())
  console.log(JSON.stringify(cs, null, 2))
  app.exit(0)
})