const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[5].click()`)
  await wait(700)
  const d = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio .card-item')];
    return {
      classes: items.map(e => e.className),
      names: items.map(e => e.querySelector('.card-name')?.textContent?.trim()),
      railHTMLlen: document.querySelector('.v-studio .rail')?.innerHTML.length,
      navTitle: document.querySelector('.nav-title')?.textContent,
      nameInput: document.querySelector('.v-studio .input')?.value,
    };
  })()`)
  console.log(JSON.stringify(d, null, 2))
  app.exit(0)
})