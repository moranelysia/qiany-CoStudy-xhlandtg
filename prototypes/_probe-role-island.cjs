const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const p = document.querySelector('.proto-picker');
  return { name: document.querySelector('.proto-picker-status-title')?.textContent,
           sub: document.querySelector('.proto-picker-status-sub')?.textContent,
           islandW: Math.round(p.getBoundingClientRect().width),
           expanded: p.hasAttribute('data-expanded') };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const initial = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[2].click()`)
  await wait(500)
  const afterCard = await win.webContents.executeJavaScript(READ)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[5].click()`)
  await wait(500)
  const afterCard2 = await win.webContents.executeJavaScript(READ)
  // 展开看副标题
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[0].click()`)
  await wait(500)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  const expanded = await win.webContents.executeJavaScript(READ)
  const shot = await win.webContents.capturePage({ x: 300, y: 0, width: 840, height: 76 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-role.png'), shot.toPNG())
  console.log(JSON.stringify({ initial, afterCard, afterCard2, expanded }, null, 2))
  app.exit(0)
})