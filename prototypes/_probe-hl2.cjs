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
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => {
    const hls = [...document.querySelectorAll('.proto-picker-highlight')];
    const hl = hls[0];
    const cs = getComputedStyle(hl);
    const items = [...document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
    const pickers = document.querySelectorAll('.proto-picker').length;
    return {
      pickers, highlights: hls.length,
      inline: hl.style.transform,
      computed: cs.transform,
      rect: Math.round(hl.getBoundingClientRect().x),
      wizardX: Math.round(items[1].getBoundingClientRect().x),
      wizardOffset: items[1].offsetLeft,
      activeIdx: items.findIndex(e => e.hasAttribute('data-active')),
    };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})