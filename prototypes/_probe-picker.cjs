const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  const errs = []
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errs.push(msg) })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1800)
  const info = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('.proto-picker');
    const items = [...document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
    return {
      picker: !!p,
      items: items.map(el => el.textContent),
      active: items.findIndex(el => el.hasAttribute('data-active')),
      highlightW: document.querySelector('.proto-picker-highlight')?.style.width,
      ready: p?.hasAttribute('data-ready'),
      styles: document.querySelectorAll('style[data-harness="variant"]').length,
      nav: !!document.querySelector('.nav-inner'),
    };
  })()`)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'variant-studio.png'),
    (await win.webContents.capturePage()).toPNG())
  // 切到 Wizard
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[1].click()`)
  await wait(1400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'variant-wizard.png'),
    (await win.webContents.capturePage()).toPNG())
  const info2 = await win.webContents.executeJavaScript(`(() => ({
    styles: document.querySelectorAll('style[data-harness="variant"]').length,
    fullscreen: !!document.querySelector('[data-role="fullscreen"]'),
    stamp: !!document.querySelector('.build-stamp'),
    hasWizard: !!document.querySelector('.v-wiz'),
  }))()`)
  // 再切到 Companion
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')[2].click()`)
  await wait(1400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'variant-companion.png'),
    (await win.webContents.capturePage()).toPNG())
  const info3 = await win.webContents.executeJavaScript(`(() => ({ styles: document.querySelectorAll('style[data-harness="variant"]').length, hasComp: !!document.querySelector('.v-comp') }))()`)
  console.log(JSON.stringify({ studio: info, wizard: info2, companion: info3, errors: errs.slice(0, 5) }, null, 2))
  app.exit(0)
})