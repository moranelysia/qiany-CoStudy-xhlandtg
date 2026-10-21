// Verify the Liquid Glass layer actually composites and reacts.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 940, show: false, webPreferences: { offscreen: true } })
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

  const probe = await win.webContents.executeJavaScript(`(() => {
    const nav = document.querySelector('.nav');
    const card = document.querySelector('.card');
    const btn = document.querySelector('.btn.primary');
    const cs = (el) => getComputedStyle(el);
    const r = {
      navBackdrop: cs(nav).backdropFilter || cs(nav).webkitBackdropFilter,
      navBg: cs(nav).backgroundColor,
      cardBackdrop: cs(card).backdropFilter || cs(card).webkitBackdropFilter,
      cardBg: cs(card).backgroundColor,
      btnBg: cs(btn).backgroundImage.slice(0, 60),
      pageFog: (() => {
        const b = getComputedStyle(document.body, '::before');
        return { opacity: b.opacity, filter: b.filter.slice(0, 30), hasBg: b.backgroundImage !== 'none' };
      })(),
    };

    // simulate a pointer move over the nav to check the specular highlight vars
    const rect = nav.getBoundingClientRect();
    nav.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: rect.left + rect.width * 0.75, clientY: rect.top + 10,
    }));
    return r;
  })()`)

  await wait(300)
  const afterMove = await win.webContents.executeJavaScript(`(() => {
    const nav = document.querySelector('.nav');
    return { mx: nav.style.getPropertyValue('--mx'), my: nav.style.getPropertyValue('--my') };
  })()`)

  // capture
  const docH = await win.webContents.executeJavaScript(`Math.max(document.documentElement.scrollHeight, 900)`)
  win.setContentSize(1400, Math.min(docH, 3000))
  await wait(600)
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'glass-studio.png'), img.toPNG())

  console.log(JSON.stringify({ ...probe, afterMove }, null, 2))
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
