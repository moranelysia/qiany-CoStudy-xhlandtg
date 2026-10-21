// Verify the STANDALONE file mounts all three variants over file://
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const logs = []
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 940,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  })

  win.webContents.on('console-message', (e) => {
    const level = String(e.level || '')
    const text = String(e.message || '')
    logs.push(level + ': ' + text)
    if (level === '3' || /Uncaught|TypeError|ReferenceError|not defined/.test(text)) {
      errors.push(text.slice(0, 240))
    }
  })
  win.webContents.on('did-fail-load', (_e, c, d) => errors.push('did-fail-load ' + c + ' ' + d))

  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await new Promise((r) => setTimeout(r, 1000))

  const names = ['studio', 'wizard', 'companion']
  for (let i = 0; i < names.length; i++) {
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.proto-picker-item')[${i}].click()`
    )
    await win.webContents.executeJavaScript('window.scrollTo(0,0)')
    await new Promise((r) => setTimeout(r, 800))

    const info = await win.webContents.executeJavaScript(
      `(() => {
         const s = document.getElementById('stage');
         return {
           len: (s.innerHTML || '').length,
           text: (s.innerText || '').replace(/\\s+/g,' ').slice(0, 60),
           active: document.querySelector('.proto-picker-item[data-active]')?.textContent,
           hl: document.querySelector('.proto-picker-highlight')?.style.width,
         };
       })()`
    )
    console.log(`[V] ${names[i].padEnd(10)} html=${String(info.len).padStart(6)}  active=${info.active}  hl=${info.hl}`)
    console.log(`    text: ${info.text}`)

    // screenshot the current variant
    await win.webContents.executeJavaScript('window.scrollTo(0,0)')
    const h = await win.webContents.executeJavaScript(`Math.max(document.documentElement.scrollHeight, 900)`)
    win.setContentSize(1400, Math.min(h, 2800))
    await new Promise((r) => setTimeout(r, 600))
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `standalone-${i + 1}-${names[i]}.png`), img.toPNG())
    win.setContentSize(1400, 940)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log('')
  console.log('[ERRORS] ' + (errors.length ? errors.length : 'none'))
  errors.slice(0, 8).forEach((e) => console.log('  - ' + e))
  if (logs.length) {
    console.log('[CONSOLE] ' + logs.length + ' messages')
    logs.slice(0, 6).forEach((l) => console.log('  ' + l.slice(0, 160)))
  }
  app.exit(errors.length ? 1 : 0)
})
