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

  // 通过 IPC 建两张卡
  const created = await win.webContents.executeJavaScript(`(async () => {
    const a = await window.costudy.cards.create('小明同学');
    const b = await window.costudy.cards.create('物理老师');
    return { a: a && a.name, b: b && b.name };
  })()`)

  // 切到 Wizard 再切回 Studio，触发重新挂载 -> 同步角色栏
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[1].click()`)
  await wait(700)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(1200)

  const rail = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')];
    return items.map(el => ({ name: el.querySelector('.card-name')?.textContent, on: el.classList.contains('is-on') }));
  })()`)

  const island1 = await win.webContents.executeJavaScript(`document.querySelector('.proto-picker-status-title')?.textContent`)

  // 点第二张卡
  await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')];
    items[1]?.click();
  })()`)
  await wait(900)

  const after = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')];
    return {
      on: items.map(el => el.classList.contains('is-on')),
      island: document.querySelector('.proto-picker-status-title')?.textContent,
      nameInput: document.querySelector('.v-studio [data-in="name"]')?.value,
    };
  })()`)

  win.setContentSize(1441, 960); await wait(250); win.setContentSize(1440, 960); await wait(400)
  fs.writeFileSync(path.join(__dirname, 'costudy-ui', '_shots', 'cards-wired.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify({ created, rail, island1, after }, null, 2))
  app.exit(0)
})