// Close-up crop of the sliders so the glass tube can be judged.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1100, show: false, webPreferences: { offscreen: true } })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3') errs.push(String(e.message).slice(0, 150))
  })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/') + '?backdrop=mesh')
  await wait(1200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(800)

  const rect = await win.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('[data-dims]') || document.querySelector('.v-studio .panel .dims');
    const host = card ? card.closest('.card') : null;
    const r = (host || card).getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.min(Math.round(r.height), 520) };
  })()`)

  const img = await win.webContents.capturePage({
    x: Math.max(0, rect.x - 10),
    y: Math.max(0, rect.y - 10),
    width: rect.w + 20,
    height: rect.h + 20,
  })
  fs.writeFileSync(path.join(OUT, 'sliders-closeup.png'), img.toPNG())
  console.log('crop ' + JSON.stringify(rect))
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
