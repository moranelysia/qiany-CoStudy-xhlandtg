const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const read = `(() => {
    const p = document.querySelector('.proto-picker');
    const hl = document.querySelector('.proto-picker-highlight');
    const items = [...document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
    return {
      activeIdx: items.findIndex(e => e.hasAttribute('data-active')),
      hl: { w: hl.style.width, t: hl.style.transform, rectX: Math.round(hl.getBoundingClientRect().x) },
      itemRects: items.map(e => ({ t: e.textContent.trim(), l: e.offsetLeft, w: e.offsetWidth, x: Math.round(e.getBoundingClientRect().x) })),
      pickerPos: getComputedStyle(p).position,
    };
  })()`
  const before = await win.webContents.executeJavaScript(read)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(700)
  const after = await win.webContents.executeJavaScript(read)
  console.log(JSON.stringify({ before, after }, null, 2))
  app.exit(0)
})