const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await new Promise((r) => setTimeout(r, 1800))
  const r = await win.webContents.executeJavaScript(`(() => {
    const t = document.querySelector('.compiled-text')
    const s = t ? t.textContent : ''
    return { len: s.length, hasDeclared: s.includes('学习者自己说的'), head: s.slice(0, 120) }
  })()`)
  console.log(JSON.stringify(r))
  app.exit(0)
})