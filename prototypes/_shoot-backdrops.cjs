// Shoot the app over each backdrop to prove the shell is transparent.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const BACKDROPS = ['mesh', 'fog', 'photo']

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1300,
    height: 900,
    show: false,
    webPreferences: { offscreen: true },
  })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3' || /Uncaught|TypeError|SyntaxError/.test(String(e.message))) {
      errs.push(String(e.message).slice(0, 180))
    }
  })

  for (const bd of BACKDROPS) {
    await win.loadURL('file:///' + FILE.replace(/\\/g, '/') + '?v=1&backdrop=' + bd)
    await wait(1100)
    await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
    await wait(700)

    const info = await win.webContents.executeJavaScript(`(() => {
      const cs = (el) => getComputedStyle(el);
      return {
        bodyBg: cs(document.body).backgroundColor,
        stageBg: cs(document.getElementById('stage')).backgroundColor,
        appBg: cs(document.querySelector('.app')).backgroundColor,
        cardBg: cs(document.querySelector('.card')).backgroundColor,
        navBg: cs(document.querySelector('.nav')).backgroundColor,
        backdrop: document.body.dataset.backdrop,
        fog: cs(document.body, '::before').backgroundImage === 'none' ? 'none' : 'painted',
      };
    })()`)
    console.log(`[${bd}] ` + JSON.stringify(info))

    // crop to the top 900px so the file stays small
    win.setContentSize(1300, 900)
    await wait(400)
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1300, height: 900 })
    fs.writeFileSync(path.join(OUT, `bg-${bd}.png`), img.toPNG())
  }

  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
