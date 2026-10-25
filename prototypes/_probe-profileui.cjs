const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(2400)
  const r = await win.webContents.executeJavaScript(`(() => {
    const f = document.querySelector('.v-studio .footer-bar')
    const ob = document.querySelector('.ob-panel')
    return {
      footerButtons: f ? [...f.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
      hasProfileEntry: !!document.querySelector('.pf-entry'),
      onboardingModes: ob ? [...ob.querySelectorAll('.ob-mode')].map(b => b.querySelector('.ob-mode-name')?.textContent + (b.hasAttribute('data-dim') ? '(灰)' : '')) : 'no-onboarding',
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  app.exit(0)
})