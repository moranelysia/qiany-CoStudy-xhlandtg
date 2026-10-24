const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true },
  })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1800)
  const r = await win.webContents.executeJavaScript(`(() => {
    const region = (el) => el ? getComputedStyle(el).webkitAppRegion : 'none';
    const q = (s) => document.querySelector(s);
    return {
      body: region(document.body),
      nav: region(q('.nav')),
      hero: region(q('.hero')),
      panel: region(q('.panel')),
      button: region(q('.btn') || q('button')),
      input: region(q('input.input')),
      winbar: region(q('[data-winbar]')),
      protoPicker: region(q('.proto-picker')),
    };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})
