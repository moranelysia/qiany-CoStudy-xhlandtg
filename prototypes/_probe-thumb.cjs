// Prove the thumb is inside the tube and tangent to its inner edge.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
const OUT = path.join(__dirname, 'costudy-ui', '_shots')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true } })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3') errs.push(String(e.message).slice(0, 140))
  })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/') + '?backdrop=mesh')
  await wait(1200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(800)

  const geo = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-dim="warmth"]');
    const track = row.querySelector('.ice-track');
    const thumb = row.querySelector('.ice-thumb');
    const t = track.getBoundingClientRect();
    const h = thumb.getBoundingClientRect();
    const cs = getComputedStyle(thumb);
    return {
      track: { top: +t.top.toFixed(2), bottom: +t.bottom.toFixed(2), height: +t.height.toFixed(2) },
      thumb: { top: +h.top.toFixed(2), bottom: +h.bottom.toFixed(2), height: +h.height.toFixed(2) },
      // 玻璃壁 1.5px，内径 = track.height - 3
      innerDiameter: +(t.height - 3).toFixed(2),
      gapTop: +(h.top - t.top).toFixed(2),
      gapBottom: +(t.bottom - h.bottom).toFixed(2),
      bg: cs.backgroundImage.slice(0, 46),
      radius: cs.borderRadius,
    };
  })()`)

  const rect = await win.webContents.executeJavaScript(`(() => {
    const host = document.querySelector('[data-dims]')?.closest('.card') || document.querySelector('.card');
    const r = host.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.min(Math.round(r.height), 300) };
  })()`)
  const img = await win.webContents.capturePage({
    x: Math.max(0, rect.x - 8), y: Math.max(0, rect.y - 8),
    width: rect.w + 16, height: rect.h + 16,
  })
  fs.writeFileSync(path.join(OUT, 'thumb-inside.png'), img.toPNG())

  console.log(JSON.stringify(geo, null, 2))
  const tangent = Math.abs(geo.gapTop - geo.gapBottom) < 0.6 && Math.abs(geo.gapTop - 1.5) < 0.8
  console.log('[TANGENT_TO_INNER_EDGE] ' + tangent)
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
