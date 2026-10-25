const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)

  const read = () => win.webContents.executeJavaScript(`(() => {
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : 'missing' }
    return {
      theme: document.documentElement.dataset.theme || 'none',
      switch: !!document.querySelector('.theme-switch'),
      bodyBg: cs('body', 'backgroundImage').slice(0, 46),
      ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
      thumb: cs('.theme-switch-thumb', 'backgroundColor'),
      thumbX: cs('.theme-switch-thumb', 'transform'),
    }
  })()`)

  console.log('LIGHT ' + JSON.stringify(await read()))
  // 真实鼠标点开关（它在 42px 之下，应该点得到）
  const pos = await win.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('.theme-switch'); const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  await wait(700)
  console.log('DARK  ' + JSON.stringify(await read()))
  app.exit(0)
})