const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => ({
    flag: localStorage.getItem('costudy.onboarding'),
    origin: location.origin,
    onboardingShown: !!document.querySelector('.ob-mask'),
    settingsShown: !!document.querySelector('.set-mask'),
    entryBtn: !!document.querySelector('.set-entry-btn'),
  }))()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})