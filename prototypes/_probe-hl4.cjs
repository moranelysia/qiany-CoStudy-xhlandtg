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
    const hl = document.querySelector('.proto-picker-highlight');
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules } catch { continue }
      const walk = (list, media) => {
        for (const rule of list) {
          if (rule.cssRules && rule.media) { walk(rule.cssRules, rule.media.mediaText); continue }
          if (!rule.selectorText) continue;
          let m = false; try { m = hl.matches(rule.selectorText) } catch { continue }
          if (!m) continue;
          const l = rule.style.left, t = rule.style.transform, imp = rule.style.getPropertyPriority('left');
          if (l || t) hits.push({ sel: rule.selectorText.slice(0, 70), media: media || '-', left: l || '-', leftImp: imp || '-', transform: t || '-' });
        }
      };
      walk(rules, '');
    }
    return { computedLeft: getComputedStyle(hl).left, hits };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  app.exit(0)
})