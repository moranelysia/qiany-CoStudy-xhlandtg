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
  const info = await win.webContents.executeJavaScript(`(() => {
    const tr = document.querySelector('.switch-row input:checked + .switch-track');
    if (!tr) return 'no-checked-switch';
    const c = getComputedStyle(tr);
    tr.scrollIntoView({ block: 'center' });
    return { img: c.backgroundImage.slice(0, 70), bgColor: c.backgroundColor, backdrop: c.backdropFilter };
  })()`)
  await wait(700)
  const box = await win.webContents.executeJavaScript(`(() => {
    const tr = document.querySelector('.switch-row input:checked + .switch-track');
    const r = tr.getBoundingClientRect();
    return { x: Math.round(r.x) - 30, y: Math.round(r.y) - 20, w: Math.round(r.width) + 60, h: Math.round(r.height) + 40 };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'switch-crystal.png'),
    (await win.webContents.capturePage(box)).toPNG())
  console.log(JSON.stringify(info, null, 2))
  app.exit(0)
})