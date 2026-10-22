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
  const box = await win.webContents.executeJavaScript(`(() => {
    const tr = document.querySelector('.switch-row input:checked + .switch-track');
    tr.scrollIntoView({ block: 'center' });
    return null;
  })()`)
  await wait(800)
  const r = await win.webContents.executeJavaScript(`(() => {
    const tr = document.querySelector('.switch-row input:checked + .switch-track');
    const b = tr.getBoundingClientRect();
    return { x: Math.round(b.x) - 24, y: Math.round(b.y) - 14, width: Math.round(b.width) + 48, height: Math.round(b.height) + 28 };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'switch-crystal.png'), (await win.webContents.capturePage(r)).toPNG())
  console.log(JSON.stringify(r))
  app.exit(0)
})