const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const n = document.querySelector('.nav'); const c = getComputedStyle(n);
  return { scrolled: n.hasAttribute('data-scrolled'), bg: c.backgroundColor,
           blur: c.backdropFilter, y: Math.round(window.scrollY) };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const top = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`window.scrollTo(0, 300)`)
  await wait(400)
  const scrolled = await win.webContents.executeJavaScript(READ)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'nav-scrolled.png'),
    (await win.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 120 })).toPNG())
  await win.webContents.executeJavaScript(`window.scrollTo(0, 0)`)
  await wait(400)
  const back = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify({ top, scrolled, back }, null, 2))
  app.exit(0)
})