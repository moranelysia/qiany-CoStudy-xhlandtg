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
  const box = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.v-studio .preview');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             radius: cs.borderRadius, shape: cs.cornerShape, border: cs.borderTopWidth + ' ' + cs.borderTopColor,
             shadow: cs.boxShadow.slice(0, 60) };
  })()`)
  // 右上角 + 右下角特写
  const img = await win.webContents.capturePage({ x: box.x + box.w - 90, y: box.y - 6, width: 100, height: 90 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'corner-tr.png'), img.toPNG())
  const img2 = await win.webContents.capturePage({ x: box.x + box.w - 90, y: box.y + box.h - 84, width: 100, height: 90 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'corner-br.png'), img2.toPNG())
  console.log(JSON.stringify(box, null, 2))
  app.exit(0)
})