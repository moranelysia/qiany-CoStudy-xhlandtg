const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const info = await win.webContents.executeJavaScript(`(() => {
    const i = document.querySelector('.input');
    const cs = getComputedStyle(i);
    return { bgImage: cs.backgroundImage.slice(0, 50), color: cs.backgroundColor, shadow: cs.boxShadow.slice(0, 80), count: document.querySelectorAll('.input, .textarea, .compiled-text').length };
  })()`)
  const shot = await win.webContents.capturePage({ x: 260, y: 340, width: 800, height: 420 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'liquid-input.png'), shot.toPNG())
  console.log(JSON.stringify(info, null, 2))
  app.exit(0)
})