const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, show: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1400)
  const r = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.input');
    const g = () => getComputedStyle(el).backgroundImage.slice(0, 40);
    const before = { img: g(), focus: el.matches(':focus') };
    el.focus();
    const afterFocus = { img: getComputedStyle(el).backgroundImage.slice(0, 40), focus: el.matches(':focus') };
    // 找出所有命中 .input 且声明 background 的规则
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules) {
        if (!rule.selectorText) continue;
        if (!/\\.input/.test(rule.selectorText)) continue;
        if (/:focus|:active/.test(rule.selectorText)) {
          hits.push(rule.selectorText + ' => ' + (rule.style.background || rule.style.backgroundImage || '(no bg)').slice(0, 40));
        }
      }
    }
    el.blur();
    return { before, afterFocus, hits };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})