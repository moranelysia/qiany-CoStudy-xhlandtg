const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const r = await win.webContents.executeJavaScript(`(() => {
    document.documentElement.dataset.theme = 'dark'
    // 1) 主题规则到底有没有进样式表
    const sheets = [...document.styleSheets].map(s => (s.href || 'inline').split('/').pop())
    // 2) 强制写一个红底，看是不是被压掉
    const el = document.querySelector('.v-studio .input')
    const before = el ? getComputedStyle(el).backgroundColor : 'missing'
    const probe = document.createElement('style')
    probe.textContent = "html[data-theme='dark'] .v-studio .input { background-color: rgb(255,0,0) !important; }"
    document.head.appendChild(probe)
    const after = el ? getComputedStyle(el).backgroundColor : 'missing'
    return { sheets, before, after, cls: el ? el.className : '-' }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  app.exit(0)
})