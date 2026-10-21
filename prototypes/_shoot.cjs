// Headless screenshot harness for the prototype.
// Captures BOTH surfaces per variant: card creation + learning.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..')
const PAGE = path.join(ROOT, 'prototypes', 'costudy-ui', 'index.html')
const OUT = path.join(ROOT, 'prototypes', 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })

const errors = []

// selector that switches each variant into its learning surface
const TO_LEARN = [
  '[data-golearn]', // studio: 去学习 →
  '[data-preview-learn]', // wizard: 预览学习界面 →
  '[data-go-learn]', // companion: needs interview finished first
]

app.disableHardwareAcceleration()

async function shot(win, file) {
  const h = await win.webContents.executeJavaScript(
    `Math.max(document.documentElement.scrollHeight, 900)`
  )
  win.setContentSize(1400, Math.min(h, 2800))
  await new Promise((r) => setTimeout(r, 650))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(file, img.toPNG())
  return fs.statSync(file).size
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 940,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  })

  win.webContents.on('console-message', (event) => {
    const level = String(event.level || '')
    const text = String(event.message || '')
    if (level === '3' || /Uncaught|TypeError|ReferenceError/.test(text)) {
      errors.push(text.slice(0, 260))
    }
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push('did-fail-load ' + code + ' ' + desc))

  await win.loadURL('file:///' + PAGE.replace(/\\/g, '/'))
  await new Promise((r) => setTimeout(r, 1200))

  const names = ['studio', 'wizard', 'companion']

  for (let i = 0; i < names.length; i++) {
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.proto-picker-item')[${i}].click()`
    )
    await new Promise((r) => setTimeout(r, 900))

    const b1 = await shot(win, path.join(OUT, `${i + 1}-${names[i]}-create.png`))
    console.log(`[SHOT] ${names[i]} create  ${Math.round(b1 / 1024)}KB`)

    // switch to the learning surface
    let switched = false
    if (i === 2) {
      // companion: answer all four interview questions via the chips
      const chips = await win.webContents.executeJavaScript(
        `document.querySelectorAll('[data-chip]').length`
      )
      for (let k = 0; k < 4; k++) {
        const ok = await win.webContents.executeJavaScript(
          `(() => { const c = document.querySelector('[data-chip]'); if (!c) return false; c.click(); return true; })()`
        )
        if (!ok) break
        await new Promise((r) => setTimeout(r, 450))
      }
      switched = await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('[data-go-learn]'); if (!b) return false; b.click(); return true; })()`
      )
      void chips
    } else {
      switched = await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('${TO_LEARN[i]}'); if (!b) return false; b.click(); return true; })()`
      )
    }
    await new Promise((r) => setTimeout(r, 900))

    if (switched) {
      const b2 = await shot(win, path.join(OUT, `${i + 1}-${names[i]}-learn.png`))
      console.log(`[SHOT] ${names[i]} learn   ${Math.round(b2 / 1024)}KB`)
    } else {
      console.log(`[SHOT] ${names[i]} learn   SKIPPED (no switch button found)`)
    }

    // back to edit for the next variant (re-mount handles it)
    win.setContentSize(1400, 940)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log('')
  if (errors.length) {
    console.log('[ERRORS] ' + errors.length)
    errors.slice(0, 10).forEach((e) => console.log('  - ' + e))
  } else {
    console.log('[ERRORS] none')
  }
  console.log('[OUT] ' + OUT)
  app.exit(errors.length ? 1 : 0)
})
