const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const st = document.querySelector('.proto-picker-status');
  const ti = document.querySelector('.proto-picker-status-title');
  const su = document.querySelector('.proto-picker-status-sub');
  const cs = getComputedStyle(st);
  return {
    inline: st.getAttribute('style'),
    cs: { display: cs.display, maxWidth: cs.maxWidth, width: cs.width, opacity: cs.opacity, flex: cs.flex, overflow: cs.overflow },
    rect: Math.round(st.getBoundingClientRect().width),
    titleRect: Math.round(ti.getBoundingClientRect().width),
    subRect: Math.round(su.getBoundingClientRect().width),
    titleText: ti.textContent, subText: su.textContent,
  };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[0].click()`)
  await wait(600)
  const r = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})