const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const hl = document.querySelector('.proto-picker-highlight');
  const items = [...document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
  return { rect: Math.round(hl.getBoundingClientRect().x), csLeft: getComputedStyle(hl).left,
           activeIdx: items.findIndex(e => e.hasAttribute('data-active')),
           item1: Math.round(items[1].getBoundingClientRect().x) };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  // 关掉过渡，只看逻辑是否正确
  await win.webContents.insertCSS('.proto-picker-highlight{transition:none !important}')
  await wait(200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(800)
  const noTransition = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify({ noTransition }, null, 2))
  app.exit(0)
})