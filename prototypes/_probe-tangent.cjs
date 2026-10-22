// Check: thumb right edge coincides with fill right edge at several values,
// and the thumb stays inside the tube at 0% / 100%.
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
  win.webContents.on('console-message', (e) => { if (String(e.level) === '3') errs.push(String(e.message).slice(0, 140)) })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/') + '?backdrop=mesh')
  await wait(1100)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(700)

  const probe = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-dim="warmth"]');
    const input = row.querySelector('[data-slider]');
    const fill = row.querySelector('.ice-fill');
    const thumb = row.querySelector('.ice-thumb');
    const track = row.querySelector('.ice-track');
    const set = (v) => { input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true })); };
    const snap = (v) => {
      set(v);
      const f = fill.getBoundingClientRect();
      const t = thumb.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      return {
        v,
        fillRight: +f.right.toFixed(2),
        thumbRight: +t.right.toFixed(2),
        rightGap: +(f.right - t.right).toFixed(2),
        thumbLeft: +t.left.toFixed(2),
        trackLeft: +tr.left.toFixed(2),
        leftGap: +(t.left - tr.left).toFixed(2),
        insideTop: +(t.top - tr.top).toFixed(2),
        thumbW: +t.width.toFixed(2),
        thumbH: +t.height.toFixed(2),
        radius: getComputedStyle(thumb).borderRadius,
      };
    };
    return [snap(0), snap(25), snap(50), snap(78), snap(100)];
  })()`)

  // screenshot at 78%
  await win.webContents.executeJavaScript(`(() => {
    const i = document.querySelector('[data-dim="warmth"] [data-slider]');
    i.value = '78'; i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await wait(300)
  const rect = await win.webContents.executeJavaScript(`(() => {
    const host = document.querySelector('[data-dims]')?.closest('.card');
    const r = host.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: 220 };
  })()`)
  const img = await win.webContents.capturePage({ x: Math.max(0, rect.x - 6), y: Math.max(0, rect.y - 6), width: rect.w + 12, height: rect.h })
  fs.writeFileSync(path.join(OUT, 'thumb-tangent.png'), img.toPNG())

  probe.forEach((r) => {
    console.log(`v=${String(r.v).padStart(3)}  rightGap=${String(r.rightGap).padStart(6)}  leftGap=${String(r.leftGap).padStart(6)}  insideTop=${r.insideTop}`)
  })
  // v=0 时填充宽度为 0，只检查圆贴左内沿；其余检查右缘相切
  const ok =
    Math.abs(probe[0].leftGap) < 1 &&
    probe.slice(1).every((r) => Math.abs(r.rightGap) < 1)
  console.log('[TANGENT_TO_FILL_END] ' + ok)
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
