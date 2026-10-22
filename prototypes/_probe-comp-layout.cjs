const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[2].click()`)
  await wait(900)
  const info = await win.webContents.executeJavaScript(`(() => {
    const r = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const appEl = document.querySelector('.app.v-comp');
    const chat = document.querySelector('.v-comp .chat-pane');
    const gen = document.querySelector('.v-comp .gen');
    const title = document.querySelector('.v-comp .comp-title');
    const island = document.querySelector('.proto-picker');
    const ir = island.getBoundingClientRect();
    const tr = title ? title.getBoundingClientRect() : null;
    return {
      display: getComputedStyle(appEl).display,
      cols: getComputedStyle(appEl).gridTemplateColumns,
      chat: r(chat), gen: r(gen), title: r(title), island: r(island),
      clearedIsland: tr ? (tr.bottom <= ir.top || tr.top >= ir.bottom || tr.right <= ir.left || tr.left >= ir.right) : null,
    };
  })()`)
  win.setContentSize(1441, 960); await wait(250); win.setContentSize(1440, 960); await wait(450)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'chat-interview.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify(info, null, 2))
  app.exit(0)
})