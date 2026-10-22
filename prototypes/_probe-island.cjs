const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const p = document.querySelector('.proto-picker');
  const t = document.querySelector('.proto-picker-status-title');
  const s = document.querySelector('.proto-picker-status-sub');
  return { expanded: p.hasAttribute('data-expanded'), title: t.textContent, sub: s.textContent,
           w: Math.round(p.getBoundingClientRect().width) };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const collapsed = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[0].click()`)
  await wait(700)
  const expanded = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(900)
  const switched = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify({ collapsed, expanded, switched }, null, 2))
  app.exit(0)
})