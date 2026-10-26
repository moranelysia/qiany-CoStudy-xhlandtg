const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(2600)
  const hasEntry = await win.webContents.executeJavaScript("!!document.querySelector('.cv-entry')")
  const r = await win.webContents.executeJavaScript(`(async () => {
    const btn = document.querySelector('.cv-entry')
    if (!btn) return { error: 'no entry' }
    btn.click()
    await new Promise((r) => setTimeout(r, 700))
    const panel = document.querySelector('.cv-panel')
    if (!panel) return { error: 'no panel' }
    const secs = [...panel.querySelectorAll('[data-sec]')].map((s) => s.getAttribute('data-sec'))
    const editBtn = panel.querySelector('[data-edit="catchphrase"]')
    editBtn.click()
    await new Promise((r) => setTimeout(r, 250))
    const ta = panel.querySelector('[data-edit-input]')
    ta.value = '先定第一步，不贪多'
    panel.querySelector('[data-save]').click()
    await new Promise((r) => setTimeout(r, 600))
    return { secs, saved: true }
  })()`)
  console.log(JSON.stringify({ hasEntry, ...r }, null, 1))
  app.exit(0)
})