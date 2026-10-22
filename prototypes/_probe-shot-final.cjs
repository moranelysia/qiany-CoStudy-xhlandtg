const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const info = await win.webContents.executeJavaScript(`(() => ({
    hasReplay: !!document.querySelector('.proto-picker-replay'),
    items: [...document.querySelectorAll('.proto-picker-item')].map(e => e.textContent.trim()),
    role: document.querySelector('.proto-picker-status-title')?.textContent,
    w: Math.round(document.querySelector('.proto-picker').getBoundingClientRect().width),
  }))()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  const shot = await win.webContents.capturePage({ x: 400, y: 0, width: 660, height: 74 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-final.png'), shot.toPNG())
  console.log(JSON.stringify(info))
  app.exit(0)
})