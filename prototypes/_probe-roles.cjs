const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const dump = `(() => {
    const items = [...document.querySelectorAll('.v-studio .card-item')];
    return items.map(el => ({
      cls: el.className,
      name: el.querySelector('.card-name')?.textContent?.trim(),
      on: el.classList.contains('is-on'),
      active: el.getAttribute('aria-current'),
    }));
  })()`
  const before = await win.webContents.executeJavaScript(dump)
  // 点第三张卡
  await win.webContents.executeJavaScript(`document.querySelectorAll('.v-studio .card-item')[2].click()`)
  await wait(600)
  const after = await win.webContents.executeJavaScript(dump)
  const nav = await win.webContents.executeJavaScript(`({ title: document.querySelector('.nav-title')?.textContent, sub: document.querySelector('.nav-sub')?.textContent })`)
  console.log(JSON.stringify({ before, after, nav }, null, 2))
  app.exit(0)
})