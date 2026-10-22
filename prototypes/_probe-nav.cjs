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
    const nav = document.querySelector('.nav-inner');
    const kids = nav ? [...nav.children].map(el => ({ cls: (el.className||'').toString().slice(0,40), tag: el.tagName, text: (el.textContent||'').trim().slice(0, 40) })) : null;
    const wiz = document.querySelector('.v-wiz .steps');
    const steps = wiz ? [...wiz.querySelectorAll('li')].map(li => ({ active: li.hasAttribute('data-active') || li.getAttribute('aria-current'), text: li.textContent.trim().slice(0, 18) })) : null;
    return { kids, steps };
  })()`
  const studio = await win.webContents.executeJavaScript(dump)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(900)
  const wizard = await win.webContents.executeJavaScript(dump)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[2].click()`)
  await wait(900)
  const comp = await win.webContents.executeJavaScript(dump)
  console.log(JSON.stringify({ studio, wizard, companion: comp }, null, 2))
  app.exit(0)
})