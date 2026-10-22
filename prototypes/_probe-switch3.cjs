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
  await win.webContents.executeJavaScript(`document.querySelector('.switch-row input:checked + .switch-track')?.scrollIntoView({ block: 'center' })`)
  await wait(900)
  win.setContentSize(1441, 960); await wait(250); win.setContentSize(1440, 960); await wait(500)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'switch-full.png'), shot.toPNG())
  const r = await win.webContents.executeJavaScript(`(() => {
    const tr = document.querySelector('.switch-row input:checked + .switch-track');
    const b = tr.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  })()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})