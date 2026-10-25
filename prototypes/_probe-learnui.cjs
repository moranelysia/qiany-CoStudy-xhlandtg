const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  // 进 Companion -> 学习模式
  await win.webContents.executeJavaScript("window.__costudySetActive && window.__costudySetActive(2)")
  await wait(700)
  await win.webContents.executeJavaScript("window.__costudyEnterLearn && window.__costudyEnterLearn()")
  await wait(1400)
  const r = await win.webContents.executeJavaScript(`(() => {
    const t = document.querySelector('.v-comp .learn-thread')
    return {
      hasThread: !!t,
      msgCount: t ? t.querySelectorAll('.learn-msg').length : 0,
      phaseChip: document.querySelector('.v-comp .learn-top [data-phase]')?.textContent || 'none',
      firstBubble: t ? (t.querySelector('.learn-bubble')?.textContent || '').slice(0, 50) : '',
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  app.exit(0)
})