const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1800)
  const r = await win.webContents.executeJavaScript(`(() => {
    const d = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return 'missing'
      const cs = getComputedStyle(el)
      return {
        bg: cs.backgroundColor,
        img: cs.backgroundImage.slice(0, 40),
        filter: cs.filter,
        backdrop: cs.backdropFilter,
        color: cs.color,
        z: cs.zIndex,
        blend: cs.mixBlendMode,
      }
    }
    return {
      theme: document.documentElement.dataset.theme || 'none',
      body: d('body'),
      panel: d('.v-studio .panel'),
      input: d('.v-studio .input'),
      cardItem: d('.v-studio .card-item'),
      compiled: d('.compiled-text'),
      ask: d('.bubble-ask'),
      island: d('.proto-picker'),
      islandItem: d('.proto-picker-item'),
      railTitle: d('.rail-title'),
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  app.exit(0)
})