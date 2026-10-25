const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => {
    window.__toast && window.__toast('动效自检')
    const t = document.querySelector('#toasts .toast')
    const bt = t ? getComputedStyle(t) : null
    return {
      hasToast: !!t,
      toastTransition: bt ? bt.transitionProperty + ' / ' + bt.transitionDuration : '-',
      toastEasing: bt ? bt.transitionTimingFunction : '-',
      supportsStartingStyle: CSS.supports('selector(:has(*))') ? 'ok' : 'unknown',
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  app.exit(0)
})