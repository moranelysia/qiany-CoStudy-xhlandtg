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
  await wait(1700)
  // 切到 Companion 的学习界面
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[2].click()`)
  await wait(900)
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('.v-comp [data-golearn]') || document.querySelector('[data-back]');
    if (b) { b.click(); return b.className; }
    return 'no-button';
  })()`)
  await wait(900)
  const info = await win.webContents.executeJavaScript(`(() => {
    const app = document.querySelector('.app.v-comp');
    const dock = document.querySelector('.v-comp .dock');
    const thread = document.querySelector('.v-comp .learn-thread');
    const island = document.querySelector('.proto-picker');
    const top = document.querySelector('.v-comp .learn-top');
    const rect = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const ir = island.getBoundingClientRect();
    const tr = top.getBoundingClientRect();
    return {
      appH: Math.round(app.getBoundingClientRect().height),
      viewportH: window.innerHeight,
      dock: rect(dock), thread: rect(thread), learnTop: rect(top),
      island: rect(island),
      overlapTopVsIsland: !(tr.bottom <= ir.top || tr.top >= ir.bottom || tr.right <= ir.left || tr.left >= ir.right),
      threadScrollable: thread.scrollHeight > thread.clientHeight,
    };
  })()`)
  win.setContentSize(1441, 960); await wait(250); win.setContentSize(1440, 960); await wait(450)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'chat-fullscreen.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify({ clicked, info }, null, 2))
  app.exit(0)
})