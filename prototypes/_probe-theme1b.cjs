const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'dark'`)
  await wait(500)
  const dark = await win.webContents.executeJavaScript(`(() => {
    const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : 'missing' }
    return { theme: document.documentElement.dataset.theme,
             bodyColor: cs('body','color'), panelBg: cs('.v-studio .panel','backgroundColor'),
             inputBg: cs('.v-studio .input','backgroundColor'), cardItemBg: cs('.card-item','backgroundColor') }
  })()`)
  console.log('DARK ' + JSON.stringify(dark))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1240, height: 794 })
  fs.writeFileSync(path.join(ROOT, 'prototypes', '_shots', 'theme-step1-dark.png'), img.toPNG())
  console.log('saved dark shot')
  app.exit(0)
})