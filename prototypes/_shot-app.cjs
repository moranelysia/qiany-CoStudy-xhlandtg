// Capture the built Electron renderer (what the real app shows).
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3' || /Uncaught|TypeError/.test(String(e.message))) {
      errs.push(String(e.message).slice(0, 160))
    }
  })
  win.webContents.on('did-fail-load', (_e, c, d) => errs.push('did-fail-load ' + c + ' ' + d))

  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1600)

  const info = await win.webContents.executeJavaScript(`(() => ({
    stageLen: (document.getElementById('stage')?.innerHTML || '').length,
    sliders: document.querySelectorAll('.ice-range').length,
    bars: document.querySelectorAll('.bar').length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    rootH: Math.round(document.documentElement.scrollHeight),
  }))()`)

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 960 })
  fs.writeFileSync(path.join(OUT, 'electron-app.png'), img.toPNG())

  console.log(JSON.stringify(info, null, 2))
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
