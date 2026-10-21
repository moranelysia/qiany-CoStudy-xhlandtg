// Prove the three first-screen titles share one spec.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const SEL = ['.hero-title', '.wiz-title', '.comp-title']

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1100)

  const rows = []
  for (let i = 0; i < 3; i++) {
    await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[${i}].click()`)
    await wait(700)
    const r = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('${SEL[i]}');
      if (!el) return { missing: true };
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || '').trim().slice(0, 14),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        fontWeight: cs.fontWeight,
        fill: cs.webkitTextFillColor,
        clip: cs.backgroundClip || cs.webkitBackgroundClip,
      };
    })()`)
    rows.push(r)
  }

  console.log(JSON.stringify(rows, null, 2))
  const same = rows.every(
    (r) => !r.missing && r.fontSize === rows[0].fontSize && r.lineHeight === rows[0].lineHeight &&
      r.letterSpacing === rows[0].letterSpacing && r.fontWeight === rows[0].fontWeight
  )
  console.log('[SAME_SPEC] ' + same)
  app.exit(0)
})
