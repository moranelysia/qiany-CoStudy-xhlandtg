// Three-width audit: layout metrics + overflow/clipping detection + screenshots.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
fs.mkdirSync(OUT, { recursive: true })
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const WIDTHS = [1280, 1600, 1920]
const VARIANTS = ['studio', 'wizard', 'companion']

// runs inside the page: find layout problems
const AUDIT = `(() => {
  const out = { overflowX: 0, clipped: [], outOfBounds: [], metrics: {} };
  const de = document.documentElement;
  out.overflowX = Math.max(0, de.scrollWidth - de.clientWidth);

  const vpW = innerWidth;
  const app = document.querySelector('.app');
  const nav = document.querySelector('.nav-inner');
  if (app) {
    const r = app.getBoundingClientRect();
    out.metrics.app = { x: Math.round(r.x), w: Math.round(r.width) };
    out.metrics.appFillPct = Math.round((r.width / vpW) * 100);
    const cs = getComputedStyle(app);
    out.metrics.appCols = cs.gridTemplateColumns;
  }
  if (nav) {
    const r = nav.getBoundingClientRect();
    out.metrics.nav = { x: Math.round(r.x), w: Math.round(r.width) };
  }

  // text clipping: content wider/taller than the box, with hidden overflow
  const candidates = document.querySelectorAll(
    '.card-name, .card-line, .segmented, .segmented-item, .btn, .dim-name, .dim-val, ' +
    '.nav-title, .nav-sub, .panel-name, .kp-name, .kp-sub, .learn-bubble, .bubble, ' +
    '.reply, .compiled-text, .side-item, .step-label, .step-sub, .tpl-name, .tpl-line, ' +
    'h1, h2, h3, .goal-t, .row-label, .switch-label, .switch-hint'
  );
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    const hidden = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    if (hidden && (dx > 2 || dy > 2)) {
      out.clipped.push({
        sel: el.className || el.tagName,
        text: (el.textContent || '').trim().slice(0, 22),
        dx, dy,
      });
    }
  }

  // elements sticking out of their parent horizontally
  for (const el of document.querySelectorAll('.app *')) {
    const p = el.parentElement;
    if (!p || !p.getBoundingClientRect) continue;
    const a = el.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    if (a.width < 2) continue;
    if (a.right - b.right > 3 && getComputedStyle(p).overflow === 'visible') {
      out.outOfBounds.push({
        sel: el.className || el.tagName,
        text: (el.textContent || '').trim().slice(0, 18),
        overshoot: Math.round(a.right - b.right),
      });
    }
  }

  out.clipped = out.clipped.slice(0, 8);
  out.outOfBounds = out.outOfBounds.slice(0, 8);
  return out;
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { offscreen: true } })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3' || /Uncaught|TypeError|SyntaxError/.test(String(e.message))) {
      errs.push(String(e.message).slice(0, 160))
    }
  })

  const report = {}

  for (const w of WIDTHS) {
    win.setContentSize(w, 900)
    await win.loadURL('file:///' + FILE.replace(/\\/g, '/') + '?backdrop=mesh')
    await wait(900)

    for (let i = 0; i < VARIANTS.length; i++) {
      await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[${i}].click()`)
      await wait(700)
      const a = await win.webContents.executeJavaScript(AUDIT)
      report[w + ':' + VARIANTS[i]] = a

      const flag =
        a.overflowX > 0 || a.clipped.length || a.outOfBounds.length ? 'ISSUE' : 'ok   '
      console.log(
        `[${flag}] ${w} ${VARIANTS[i].padEnd(9)} fill=${a.metrics.appFillPct}%` +
          ` overflowX=${a.overflowX} clipped=${a.clipped.length} outOfBounds=${a.outOfBounds.length}`
      )
      if (a.metrics.appCols) console.log(`         cols: ${a.metrics.appCols}`)
      a.clipped.forEach((c) => console.log(`         clip ${c.sel} "${c.text}" dx=${c.dx} dy=${c.dy}`))
      a.outOfBounds.forEach((c) => console.log(`         oob  ${c.sel} "${c.text}" +${c.overshoot}px`))

      if (i === 0) {
        // 不要按文档全高截图：超大 surface 会让 capturePage 挂住。
        // 固定 1000px 高度，够看首屏与布局。
        win.setContentSize(w, 1000)
        await wait(350)
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(OUT, `w${w}-studio.png`), img.toPNG())
        win.setContentSize(w, 900)
        await wait(150)
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log('')
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
