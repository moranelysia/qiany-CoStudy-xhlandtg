const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const STATE = `(() => ({
  onCard: document.querySelector('.v-studio .card-item.is-on .card-name')?.textContent?.trim() || null,
  onIsTemplate: document.querySelector('.v-studio [data-template].is-on') ? 'yes' : 'no',
  island: document.querySelector('.proto-picker-status-title')?.textContent,
  islandW: Math.round(document.querySelector('.proto-picker').getBoundingClientRect().width),
}))()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const a = await win.webContents.executeJavaScript(STATE)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[2].click()`)
  await wait(500)
  const b = await win.webContents.executeJavaScript(STATE)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio [data-template]')[2].click()`)
  await wait(500)
  const c = await win.webContents.executeJavaScript(STATE)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  const shot = await win.webContents.capturePage({ x: 300, y: 0, width: 850, height: 76 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-role.png'), shot.toPNG())
  console.log(JSON.stringify({ initial: a, afterCard: b, afterTemplate: c }, null, 2))
  app.exit(0)
})