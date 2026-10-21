// Verify the new ice slider component: interaction, sync, keyboard focus.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true } })
  const errs = []
  win.webContents.on('console-message', (e) => {
    if (String(e.level) === '3' || /Uncaught|TypeError/.test(String(e.message))) errs.push(String(e.message).slice(0, 160))
  })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await wait(1200)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.proto-picker-item')[0].click()`)
  await wait(800)

  const r = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-dim="warmth"]');
    const input = row.querySelector('[data-slider]');
    const fill = row.querySelector('[data-fill]');
    const thumb = row.querySelector('[data-thumb]');
    const val = row.querySelector('[data-val]');
    const out = { initial: { w: fill.style.width, left: thumb.style.left, val: val.textContent } };

    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    out.afterInput = { w: fill.style.width, left: thumb.style.left, val: val.textContent, aria: input.getAttribute('aria-valuenow') };

    // 程序化同步（预设/撤销走这条路径）
    const before = fill.style.width;
    const ev = new Event('input', { bubbles: true });
    input.value = '90';
    input.dispatchEvent(ev);
    out.afterSecond = { w: fill.style.width, left: thumb.style.left, val: val.textContent };

    // 输入层是否可点（z-index 与尺寸）
    const box = input.getBoundingClientRect();
    out.inputBox = { w: Math.round(box.width), h: Math.round(box.height), z: getComputedStyle(input).zIndex };
    out.fillBox = (() => { const b = fill.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })();

    // 预设应用后是否同步
    document.querySelector('[data-card]')?.click();
    return out;
  })()`)

  await wait(400)
  const afterPreset = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-dim="warmth"]');
    return { w: row.querySelector('[data-fill]').style.width, val: row.querySelector('[data-val]').textContent };
  })()`)

  console.log(JSON.stringify({ ...r, afterPreset }, null, 2))
  console.log('[ERRORS] ' + (errs.length ? errs.join(' | ') : 'none'))
  app.exit(0)
})
