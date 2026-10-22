const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const r = await win.webContents.executeJavaScript(`(() => {
    const hl = document.querySelector('.proto-picker-highlight');
    const out = { before: { left: getComputedStyle(hl).left, inline: hl.style.left } };
    document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click();
    out.afterClick = { left: getComputedStyle(hl).left, inline: hl.style.left,
                       offsetLeft: hl.offsetLeft,
                       animations: document.getAnimations().map(a => ({ type: a.constructor.name, state: a.playState, t: Math.round(a.currentTime || 0) })) };
    return out;
  })()`)
  await wait(1000)
  const r2 = await win.webContents.executeJavaScript(`(() => {
    const hl = document.querySelector('.proto-picker-highlight');
    return { left: getComputedStyle(hl).left, offsetLeft: hl.offsetLeft,
             animations: document.getAnimations().map(a => ({ state: a.playState, t: Math.round(a.currentTime || 0) })),
             visibility: document.visibilityState };
  })()`)
  console.log(JSON.stringify({ r, afterOneSecond: r2 }, null, 2))
  app.exit(0)
})