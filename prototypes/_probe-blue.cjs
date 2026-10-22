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
    const pick = (s) => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el);
      return { img: c.backgroundImage.slice(0, 56), weight: c.fontWeight }; };
    return { dimName: pick('.dim-name'), fieldLabel: pick('.field-label'), switchLabel: pick('.switch-label') };
  })()`)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  // 滚到教学取向区域
  await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('.switch-label'); el?.scrollIntoView({ block: 'center' }); })()`)
  await wait(600)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'titles-blue.png'),
    (await win.webContents.capturePage({ x: 290, y: 200, width: 720, height: 520 })).toPNG())
  console.log(JSON.stringify(cs, null, 2))
  app.exit(0)
})