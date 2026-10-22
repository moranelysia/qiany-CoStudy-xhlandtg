// Verify panel gradient applies and hover shifts background-position.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'out', 'renderer', 'index.html')
const PRELOAD = path.join(ROOT, 'out', 'preload', 'index.js')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })

app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const READ = `(() => {
  const card = document.querySelector('.card');
  const cs = getComputedStyle(card);
  return {
    image: cs.backgroundImage.slice(0, 64),
    size: cs.backgroundSize,
    pos: cs.backgroundPosition,
  };
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1500)

  const before = await win.webContents.executeJavaScript(READ)
  const img1 = await win.webContents.capturePage({ x: 260, y: 340, width: 700, height: 320 })
  fs.writeFileSync(path.join(OUT, 'panel-idle.png'), img1.toPNG())

  // 真实鼠标移动 -> Chromium 会进入 :hover
  const box = await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('.card').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40) };
  })()`)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y })
  await wait(500)

  const during = await win.webContents.executeJavaScript(READ)
  const img2 = await win.webContents.capturePage({ x: 260, y: 340, width: 700, height: 320 })
  fs.writeFileSync(path.join(OUT, 'panel-hover.png'), img2.toPNG())

  // 移开鼠标，确认能回到初始位置
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
  await wait(500)
  const after = await win.webContents.executeJavaScript(READ)

  console.log(JSON.stringify({ before, during, after }, null, 2))
  const hasGradient = /gradient/.test(before.image)
  const shifted = before.pos !== during.pos
  const restored = after.pos === before.pos
  console.log('[PANEL_GRADIENT] ' + hasGradient)
  console.log('[HOVER_SHIFT] ' + shifted)
  console.log('[RESTORE] ' + restored)
  app.exit(hasGradient && shifted && restored ? 0 : 1)
})
