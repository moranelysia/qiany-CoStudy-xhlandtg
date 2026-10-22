const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = `(() => ({
  role: document.querySelector('.proto-picker-status-title')?.textContent,
  islandW: Math.round(document.querySelector('.proto-picker').getBoundingClientRect().width),
}))()`
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const steps = {}
  steps.studio = await win.webContents.executeJavaScript(READ)
  // 换角色
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[2].click()`)
  await wait(400)
  steps.afterPick = await win.webContents.executeJavaScript(READ)
  // 切到 Wizard
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(900)
  steps.wizard = await win.webContents.executeJavaScript(READ)
  // 切到 Companion
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[2].click()`)
  await wait(900)
  steps.companion = await win.webContents.executeJavaScript(READ)
  // 切回 Studio，看是否还是那个角色
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[0].click()`)
  await wait(900)
  steps.backToStudio = await win.webContents.executeJavaScript(READ)
  console.log(JSON.stringify(steps, null, 2))
  app.exit(0)
})