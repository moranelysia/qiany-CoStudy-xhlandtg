const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)

  const read = () => win.webContents.executeJavaScript(`(() => {
    const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : 'missing' }
    return {
      theme: document.documentElement.dataset.theme || 'none',
      bodyBg: cs('body', 'backgroundImage').slice(0, 34),
      bodyColor: cs('body', 'color'),
      panelBg: cs('.v-studio .panel', 'backgroundColor'),
      panelText: cs('.panel-name', 'color'),
      inputBg: cs('.v-studio .input', 'backgroundColor'),
      switchAt: !!document.querySelector('.theme-switch'),
    }
  })()`)

  console.log('LIGHT ' + JSON.stringify(await read()))
  const pos = await win.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('.theme-switch'); const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  await wait(600)
  console.log('DARK  ' + JSON.stringify(await read()))

  // 截图给用户看第 1 步的效果
  const img = await win.webContents.capturePage({
    x: 0, y: 0, width: 1000, height: 640,
  })
  require('node:fs').writeFileSync(path.join(ROOT, 'prototypes', '_shots', 'theme-step1-dark.png'), img.toPNG())
  console.log('screenshot saved')
  app.exit(0)
})