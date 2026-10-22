const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[2].click()`)
  await wait(800)
  const has = await win.webContents.executeJavaScript(`!!document.querySelector('[data-go-learn]')`)
  await win.webContents.executeJavaScript(`document.querySelector('[data-go-learn]')?.click()`)
  await wait(800)
  const info = await win.webContents.executeJavaScript(`(() => {
    const r = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const appEl = document.querySelector('.app.v-comp');
    const thread = document.querySelector('.v-comp .learn-thread');
    const dock = document.querySelector('.v-comp .dock');
    const top = document.querySelector('.v-comp .learn-top');
    const island = document.querySelector('.proto-picker');
    const ir = island.getBoundingClientRect();
    const tr = top ? top.getBoundingClientRect() : null;
    return {
      hasLearn: !!document.querySelector('.v-comp .learn-thread'),
      appH: appEl ? Math.round(appEl.getBoundingClientRect().height) : null,
      viewportH: window.innerHeight,
      learnTop: r(top), thread: r(thread), dock: r(dock), island: r(island),
      cleared: tr ? tr.bottom <= ir.top || tr.top >= ir.bottom : null,
      docScroll: document.documentElement.scrollHeight - window.innerHeight,
    };
  })()`)
  console.log(JSON.stringify({ has, info }, null, 2))
  app.exit(0)
})