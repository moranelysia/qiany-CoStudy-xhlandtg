const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => {
  const p = document.querySelector('.proto-picker');
  return { expanded: p.hasAttribute('data-expanded'), w: Math.round(p.getBoundingClientRect().width) };
})()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const before = await win.webContents.executeJavaScript(READ)
  // 双击当前项（等于两次 click）
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelectorAll('.proto-picker-item')[0];
    el.click(); el.click();
  })()`)
  await wait(500)
  const afterDouble = await win.webContents.executeJavaScript(READ)
  // 切到 Wizard 再双击
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[1].click()`)
  await wait(700)
  await win.webContents.executeJavaScript(`(() => { const el = document.querySelectorAll('.proto-picker-item')[1]; el.click(); el.click(); })()`)
  await wait(500)
  const wizardDouble = await win.webContents.executeJavaScript(READ)
  win.setContentSize(1441, 960); await wait(200); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-nodbl.png'),
    (await win.webContents.capturePage({ x: 500, y: 4, width: 420, height: 50 })).toPNG())
  console.log(JSON.stringify({ before, afterDouble, wizardDouble }, null, 2))
  app.exit(0)
})