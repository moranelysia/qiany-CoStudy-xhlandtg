// Measure the actual layout: why does the app look narrow and empty?
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(800)

  const m = await win.webContents.executeJavaScript(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
        maxWidth: cs.maxWidth, width: cs.width, display: cs.display,
        gridCols: cs.gridTemplateColumns,
      };
    };
    return {
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      rootContentVar: getComputedStyle(document.documentElement).getPropertyValue('--content').trim(),
      stage: box(q('#stage')),
      app: box(q('.app')),
      nav: box(q('.nav')),
      navInner: box(q('.nav-inner')),
      rail: box(q('.v-studio .rail')),
      preview: box(q('.v-studio .preview')),
      cardCount: document.querySelectorAll('.card').length,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlOverflow: getComputedStyle(document.documentElement).overflowX,
    };
  })()`)

  console.log(JSON.stringify(m, null, 2))
  app.exit(0)
})
