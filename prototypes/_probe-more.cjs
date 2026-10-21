// Verify progressive disclosure + undo in the browser (separate evaluations).
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
app.disableHardwareAcceleration()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 940,
    show: false,
    webPreferences: { offscreen: true },
  })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3' || /Uncaught|TypeError|SyntaxError/.test(String(e.message))) {
      errs.push(String(e.message).slice(0, 200))
    }
  })

  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(900)

  const before = await win.webContents.executeJavaScript(`(() => {
    const body = document.querySelector('[data-morebody]');
    const btn = document.querySelector('[data-more]');
    return {
      totalDims: document.querySelectorAll('.dim[data-dim]').length,
      moreDims: body ? body.querySelectorAll('.dim').length : 0,
      open: body ? body.classList.contains('is-open') : null,
      h: body ? Math.round(body.getBoundingClientRect().height) : -1,
      btn: btn ? btn.textContent.trim() : null,
    };
  })()`)

  await win.webContents.executeJavaScript(`document.querySelector('[data-more]').click()`)
  await wait(600)

  const after = await win.webContents.executeJavaScript(`(() => {
    const body = document.querySelector('[data-morebody]');
    const btn = document.querySelector('[data-more]');
    return {
      open: body.classList.contains('is-open'),
      h: Math.round(body.getBoundingClientRect().height),
      btn: btn.textContent.trim(),
    };
  })()`)

  const docH = await win.webContents.executeJavaScript(`Math.max(document.documentElement.scrollHeight, 900)`)
  win.setContentSize(1400, Math.min(docH, 3200))
  await wait(500)
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'studio-expanded.png'), img.toPNG())
  win.setContentSize(1400, 940)
  await wait(200)

  const undo = await win.webContents.executeJavaScript(`(() => {
    const range = document.querySelector('[data-dim="warmth"] [data-slider]');
    const start = range.value;
    range.value = '12';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    const bar = document.querySelector('.undo-bar');
    const btn = bar && bar.querySelector('button');
    const appeared = !!btn;
    if (btn) btn.click();
    return { start, appeared, restored: range.value, barGone: !document.querySelector('.undo-bar') };
  })()`)

  console.log(JSON.stringify({ before, after, undo }, null, 2))
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
