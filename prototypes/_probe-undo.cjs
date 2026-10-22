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
  await wait(1700)
  const before = await win.webContents.executeJavaScript(`document.querySelectorAll('.undo-bar').length`)
  // 拖动第一个滑条三次
  await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('.ice-range');
    const input = r && r.querySelector('input');
    if (!input) return 'no-input';
    for (const v of [70, 75, 80]) {
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return 'dragged';
  })()`)
  await wait(500)
  const after = await win.webContents.executeJavaScript(`(() => ({
    bars: document.querySelectorAll('.undo-bar').length,
    navText: document.querySelector('.nav-inner')?.textContent?.replace(/\\s+/g, ' ').trim(),
  }))()`)
  console.log(JSON.stringify({ before, after }, null, 2))
  app.exit(0)
})