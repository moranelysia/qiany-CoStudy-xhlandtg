const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(2200)
  const r = await win.webContents.executeJavaScript(`(() => {
    const footer = document.querySelector('.v-studio .footer-bar')
    const btns = footer ? [...footer.querySelectorAll('button')].map(b => b.textContent.trim()) : []
    const entry = document.querySelector('.set-entry-btn')
    const go = footer ? footer.querySelector('[data-golearn]') : null
    const rect = (el) => el ? Math.round(el.getBoundingClientRect().x) : null
    // 合成点击验证弹窗
    entry && entry.click()
    return {
      hasFooter: !!footer,
      buttons: btns,
      entryText: entry ? entry.textContent.trim() : 'none',
      entryX: rect(entry),
      goLearnX: rect(go),
      toTheRight: entry && go ? rect(entry) > rect(go) : false,
      dotOn: entry ? entry.querySelector('.set-entry-dot')?.hasAttribute('data-on') : null,
    }
  })()`)
  await wait(600)
  const panel = await win.webContents.executeJavaScript(`(() => ({
    open: !!document.querySelector('.set-mask'),
    fields: [...document.querySelectorAll('.set-panel .set-input')].map(e => e.tagName + (e.type ? ':' + e.type : '')),
    actions: [...document.querySelectorAll('.set-panel .set-btn')].map(b => b.textContent.trim()),
  }))()`)
  console.log('ENTRY ' + JSON.stringify(r))
  console.log('PANEL ' + JSON.stringify(panel))
  app.exit(0)
})