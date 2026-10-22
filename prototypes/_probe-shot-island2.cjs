const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[0].click()`)
  await wait(400)
  // 强制一轮重绘：窗口尺寸抖动一下
  win.setContentSize(1441, 960); await wait(250); win.setContentSize(1440, 960); await wait(500)
  const state = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('.proto-picker');
    const st = document.querySelector('.proto-picker-status');
    return { expanded: p.hasAttribute('data-expanded'), islandW: Math.round(p.getBoundingClientRect().width),
             statusW: Math.round(st.getBoundingClientRect().width), opacity: getComputedStyle(st).opacity };
  })()`)
  const shot = await win.webContents.capturePage({ x: 300, y: 0, width: 840, height: 78 })
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'island-expanded.png'), shot.toPNG())
  console.log(JSON.stringify(state))
  app.exit(0)
})