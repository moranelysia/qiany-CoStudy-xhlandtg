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
  const cs = await win.webContents.executeJavaScript(`(() => {
    const t = document.querySelector('.proto-picker-status-title');
    const c = getComputedStyle(t);
    return { img: c.backgroundImage.slice(0, 60), fill: c.webkitTextFillColor, clip: c.backgroundClip || c.webkitBackgroundClip, size: c.fontSize };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-grad-role.png'),
    (await win.webContents.capturePage({ x: 500, y: 4, width: 420, height: 50 })).toPNG())
  console.log(JSON.stringify(cs, null, 2))
  app.exit(0)
})