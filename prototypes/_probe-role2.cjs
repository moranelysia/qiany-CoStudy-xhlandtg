const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const STATE = `(() => ({
  onCard: document.querySelector('.v-studio .card-item.is-on .card-name')?.textContent?.trim(),
  onIndex: [...document.querySelectorAll('.v-studio .card-item')].findIndex(e => e.classList.contains('is-on')),
  island: document.querySelector('.proto-picker-status-title')?.textContent,
  count: document.querySelectorAll('.v-studio .card-item').length,
}))()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const a = await win.webContents.executeJavaScript(STATE)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[5].click()`)
  await wait(600)
  const b = await win.webContents.executeJavaScript(STATE)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[1].click()`)
  await wait(600)
  const c = await win.webContents.executeJavaScript(STATE)
  console.log(JSON.stringify({ a, b, c }, null, 2))
  app.exit(0)
})