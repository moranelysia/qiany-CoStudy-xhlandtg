// One case per process: node _fs-one.cjs <case>
const { app, BrowserWindow } = require('electron')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const CASES = {
  transparent: { transparent: true, backgroundColor: '#00000000' },
  acrylic: { backgroundMaterial: 'acrylic' },
  both: { transparent: true, backgroundColor: '#00000000', backgroundMaterial: 'acrylic' },
}

const which = process.argv[process.argv.length - 1]
const opts = CASES[which]

function log(...a) {
  console.log('[' + which + ']', ...a)
}

app.whenReady().then(async () => {
  if (!opts) {
    log('unknown case')
    return app.exit(2)
  }
  let win
  try {
    win = new BrowserWindow({ width: 1200, height: 800, show: true, ...opts })
    await wait(700)
    log('start full=' + win.isFullScreen() + ' bounds=' + JSON.stringify(win.getBounds()))

    win.setFullScreen(true)
    await wait(1000)
    log('enter full=' + win.isFullScreen() + ' bounds=' + JSON.stringify(win.getBounds()))

    win.setFullScreen(false)
    await wait(1000)
    log('exit  full=' + win.isFullScreen() + ' bounds=' + JSON.stringify(win.getBounds()))
    log('RESULT stuck=' + win.isFullScreen())
  } catch (e) {
    log('ERROR ' + (e && e.message))
  }
  app.exit(0)
})

process.on('uncaughtException', (e) => {
  log('UNCAUGHT ' + (e && e.message))
  app.exit(1)
})
