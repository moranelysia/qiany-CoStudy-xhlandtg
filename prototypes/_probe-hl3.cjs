const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const hl = document.querySelector('.proto-picker-highlight');
  const items = [...document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
  const cs = getComputedStyle(hl);
  return {
    styleAttr: hl.getAttribute('style'),
    csLeft: cs.left, csPos: cs.position,
    rect: Math.round(hl.getBoundingClientRect().x),
    activeIdx: items.findIndex(e => e.hasAttribute('data-active')),
    item0: Math.round(items[0].getBoundingClientRect().x),
    item1: Math.round(items[1].getBoundingClientRect().x),
  };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const before = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(1200)
  const after = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify({ before, after }, null, 2))
  app.exit(0)
})