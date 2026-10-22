// Verify the fullscreen toggle works on a TRANSPARENT window (the failing case).
// Uses the real built preload + the real main-process handler logic.
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'out', 'renderer', 'index.html')
const PRELOAD = path.join(ROOT, 'out', 'preload', 'index.js')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 与 src/main/index.ts 相同的状态跟踪
const fullscreenState = new WeakMap()
const isFs = (w) => fullscreenState.get(w) ?? false
const setFs = (w, on) => {
  fullscreenState.set(w, on)
  w.setFullScreen(on)
  if (!w.isDestroyed()) w.webContents.send('app:fullscreen-changed', on)
}

ipcMain.handle('app:toggleFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const next = !isFs(win)
  setFs(win, next)
  return next
})
ipcMain.handle('app:isFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? isFs(win) : false
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  fullscreenState.set(win, false)

  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(900)

  const startBounds = win.getBounds()
  const steps = []
  steps.push({ tag: 'start', flag: isFs(win), native: win.isFullScreen(), h: win.getBounds().height })

  await win.webContents.executeJavaScript(`window.costudy.toggleFullscreen()`)
  await wait(900)
  steps.push({ tag: 'toggle1', flag: isFs(win), native: win.isFullScreen(), h: win.getBounds().height })

  await win.webContents.executeJavaScript(`window.costudy.toggleFullscreen()`)
  await wait(900)
  steps.push({ tag: 'toggle2', flag: isFs(win), native: win.isFullScreen(), h: win.getBounds().height })

  const btn = await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.nav-inner .btn')].find(x => /全屏/.test(x.textContent)); return b ? b.textContent : null; })()`
  )

  const restored = Math.abs(win.getBounds().height - startBounds.height) <= 2
  const ok =
    steps[0].flag === false &&
    steps[1].flag === true &&
    steps[2].flag === false &&
    steps[2].h < steps[1].h &&
    restored

  console.log(JSON.stringify({ steps, btn, startBounds, restored }, null, 2))
  console.log('[TRANSPARENT_TOGGLE_OK] ' + ok)
  app.exit(ok ? 0 : 1)
})

process.on('uncaughtException', (e) => {
  console.log('[UNCAUGHT] ' + (e && e.message))
  app.exit(1)
})
