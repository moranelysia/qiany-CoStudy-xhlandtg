const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)
  const created = await win.webContents.executeJavaScript(`(async () => {
    const a = await window.costudy.cards.create('小明同学');
    const b = await window.costudy.cards.create('物理老师');
    return { a: a && a.name, b: b && b.name };
  })()`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[1].click()`)
  await wait(600)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(1000)
  const rail = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')];
    return items.map(el => ({ name: el.querySelector('.card-name')?.textContent, on: el.classList.contains('is-on') }));
  })()`)
  const island1 = await win.webContents.executeJavaScript(`document.querySelector('.proto-picker-status-title')?.textContent`)
  await win.webContents.executeJavaScript(`(() => { const items=[...document.querySelectorAll('.v-studio [data-cards] .card-item')]; items[1]?.click(); })()`)
  await wait(800)
  const after = await win.webContents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')];
    return { on: items.map(el => el.classList.contains('is-on')),
             island: document.querySelector('.proto-picker-status-title')?.textContent,
             nameInput: document.querySelector('.v-studio [data-in="name"]')?.value };
  })()`)
  console.log(JSON.stringify({ created, rail, island1, after }, null, 2))
  app.exit(0)
})