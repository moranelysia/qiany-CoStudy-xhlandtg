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
  await win.webContents.executeJavaScript("localStorage.removeItem('costudy.onboarding')")
  await win.webContents.executeJavaScript("window.__costudyShowOnboarding && window.__costudyShowOnboarding()")
  await wait(1200)
  const r = await win.webContents.executeJavaScript(`(() => {
    const ob = document.querySelector('.ob-panel')
    if (!ob) return { onboarding: 'none' }
    const modes = ob.querySelector('.ob-modes')
    return {
      onboarding: 'shown',
      keyInput: !!ob.querySelector('[data-ob-key]'),
      modesHidden: modes ? getComputedStyle(modes).display === 'none' : true,
    }
  })()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})