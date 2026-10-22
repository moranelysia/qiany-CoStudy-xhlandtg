const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1600)
  const r = await win.webContents.executeJavaScript(`(() => {
    const pv = document.querySelector('.v-studio .preview');
    const pr = pv.getBoundingClientRect();
    const y = Math.round(pr.y + 12);
    const rows = [];
    for (let x = Math.round(pr.right) - 26; x <= Math.round(pr.right) + 8; x += 4) {
      const el = document.elementFromPoint(x, y);
      const cs = el ? getComputedStyle(el) : null;
      rows.push({
        x,
        el: el ? (el.className || el.tagName).toString().slice(0, 42) : null,
        bg: cs ? cs.backgroundColor : null,
        radius: cs ? cs.borderRadius : null,
        shape: cs ? (cs.cornerShape || '-') : null,
      });
    }
    const pcs = getComputedStyle(pv);
    return {
      preview: { right: Math.round(pr.right), w: Math.round(pr.width), radius: pcs.borderRadius, shape: pcs.cornerShape,
                 border: pcs.borderTopWidth + '/' + pcs.borderTopStyle, bgImage: pcs.backgroundImage.slice(0, 30) },
      rows,
    };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})