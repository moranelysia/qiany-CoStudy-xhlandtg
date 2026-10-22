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
    const p = document.querySelector('.proto-picker');
    const c = getComputedStyle(p);
    const item = document.querySelector('.proto-picker-item');
    const hl = document.querySelector('.proto-picker-highlight');
    return {
      bgImage: c.backgroundImage.slice(0, 46),
      border: c.borderWidth,
      filterFirst: c.filter.slice(0, 40),
      itemColor: getComputedStyle(item).color,
      hlBg: getComputedStyle(hl).backgroundColor,
      w: Math.round(p.getBoundingClientRect().width),
    };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  const shot = await win.webContents.capturePage({ x: 330, y: 0, width: 800, height: 76 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-glass.png'), shot.toPNG())
  console.log(JSON.stringify(cs, null, 2))
  app.exit(0)
})