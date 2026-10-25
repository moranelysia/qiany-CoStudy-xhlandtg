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

  const info = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.proto-picker-item')]
    return items.map((b) => {
      const r = b.getBoundingClientRect()
      const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2)
      const hit = document.elementFromPoint(cx, cy)
      return {
        text: b.textContent.trim(),
        active: b.hasAttribute('data-active'),
        rect: { x: cx, y: cy, w: Math.round(r.width), h: Math.round(r.height) },
        topElement: hit ? (hit.className || hit.tagName) : 'none',
        region: hit ? getComputedStyle(hit).webkitAppRegion : '-',
      }
    })
  })()`)
  console.log('BEFORE ' + JSON.stringify(info, null, 1))

  // 真鼠标点第二项（新手引导）
  const target = info[1].rect
  win.webContents.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  await wait(900)

  const after = await win.webContents.executeJavaScript(`(() => ({
    active: [...document.querySelectorAll('.proto-picker-item')].map((b) => b.hasAttribute('data-active')),
    hasStudio: !!document.querySelector('.v-studio'),
    hasWiz: !!document.querySelector('.v-wiz'),
    hasComp: !!document.querySelector('.v-comp'),
  }))()`)
  console.log('AFTER ' + JSON.stringify(after))
  app.exit(0)
})