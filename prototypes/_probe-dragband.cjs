const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const r = await win.webContents.executeJavaScript(`(() => {
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return 'none'
      return (el.className || el.tagName) + ' -> ' + getComputedStyle(el).webkitAppRegion
    }
    return {
      strip: !!document.querySelector('.titlebar-drag'),
      at_200_20: at(200, 20),
      at_600_20: at(600, 20),
      padTop: getComputedStyle(document.body).paddingTop,
    }
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})