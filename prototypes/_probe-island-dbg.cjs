const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true,
    backgroundColor: '#00000000', webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1700)
  const r = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('.proto-picker');
    const c = getComputedStyle(p);
    const nav = document.querySelector('.nav');
    const ncs = nav ? getComputedStyle(nav) : null;
    const el = document.elementFromPoint(Math.round(p.getBoundingClientRect().x + 12), Math.round(p.getBoundingClientRect().y + 17));
    return {
      pickerBgColor: c.backgroundColor,
      pickerBgImage: c.backgroundImage.slice(0, 60),
      pickerOpacity: c.opacity,
      pickerFilter: c.filter.slice(0, 50),
      pickerZ: c.zIndex,
      behind: el ? (el.className || el.tagName).toString().slice(0, 40) : null,
      navBg: ncs ? ncs.backgroundColor : null,
      navFilter: ncs ? ncs.backdropFilter : null,
      navRectTop: ncs ? Math.round(nav.getBoundingClientRect().top) : null,
      navRectH: ncs ? Math.round(nav.getBoundingClientRect().height) : null,
      pickerRect: JSON.stringify(p.getBoundingClientRect().toJSON()),
    };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})