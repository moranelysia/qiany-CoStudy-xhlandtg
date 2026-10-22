const { app, BrowserWindow } = require('electron')
const path = require('node:path')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 600, show: false,
    webPreferences: { contextIsolation: true } })
  await win.loadURL('data:text/html,<div id=x style="width:100px;height:100px;background:red"></div>')
  await wait(400)
  const r = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('x');
    const supports = (p, v) => CSS.supports(p, v);
    const out = {
      chrome: navigator.userAgent.match(/Chrome\\/(\\d+)/)?.[1] ?? 'n/a',
      cornerShape: supports('corner-shape', 'squircle'),
      superellipse: supports('corner-shape', 'superellipse(4)'),
      bevel: supports('corner-shape', 'bevel'),
      applyResult: null,
    };
    el.style.borderRadius = '32px';
    el.style.cornerShape = 'superellipse(4)';
    const cs = getComputedStyle(el);
    out.applyResult = { radius: cs.borderRadius, shape: cs.cornerShape || '(unsupported)' };
    return out;
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})