const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(2300)
  const r = await win.webContents.executeJavaScript(`(() => {
    const f = document.querySelector('.v-studio .footer-bar')
    return {
      buttons: f ? [...f.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
      hasPolish: !!document.querySelector('.pol-entry'),
      styleInjected: !!document.getElementById('polish-ui-style'),
    }
  })()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})