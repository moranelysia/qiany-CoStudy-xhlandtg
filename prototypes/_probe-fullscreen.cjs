// Verify the fullscreen chain: renderer -> preload -> IPC -> win.setFullScreen
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'out', 'renderer', 'index.html')
const PRELOAD = path.join(ROOT, 'out', 'preload', 'index.js')

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 和 main/index.ts 里一致的 IPC 处理
const { ipcMain } = require('electron')
ipcMain.handle('app:toggleFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const next = !win.isFullScreen()
  win.setFullScreen(next)
  return next
})
ipcMain.handle('app:isFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isFullScreen() : false
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1000)

  const hasApi = await win.webContents.executeJavaScript(
    `({ api: typeof window.costudy === 'object', fn: typeof window.costudy?.toggleFullscreen })`
  )
  const before = win.isFullScreen()

  await win.webContents.executeJavaScript(`window.costudy.toggleFullscreen()`)
  await wait(900)
  const afterOn = win.isFullScreen()

  await win.webContents.executeJavaScript(`window.costudy.toggleFullscreen()`)
  await wait(900)
  const afterOff = win.isFullScreen()

  const btnText = await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.nav-inner .btn')].find(x => /全屏/.test(x.textContent)); return b ? b.textContent : null; })()`
  )

  console.log(JSON.stringify({ hasApi, before, afterOn, afterOff, btnText }, null, 2))
  const ok = hasApi.api && hasApi.fn === 'function' && before === false && afterOn === true && afterOff === false
  console.log('[FULLSCREEN_CHAIN] ' + ok)
  app.exit(ok ? 0 : 1)
})
