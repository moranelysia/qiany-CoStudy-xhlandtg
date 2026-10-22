const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => {
    const bar = document.querySelector('[data-winbar]');
    const btns = bar ? [...bar.querySelectorAll('.win-btn')].map(b => b.dataset.win + ':' + b.textContent) : [];
    const navBtns = [...document.querySelectorAll('.nav-inner button')].map(b => (b.textContent||'').trim().slice(0,8));
    return { barExists: !!bar, btns, navBtns, stamp: !!document.querySelector('.build-stamp') };
  })()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})
