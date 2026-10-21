// Probe computed styles to find why tokens look unapplied.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const FILE = path.join(__dirname, 'Costudy-UI-原型.html')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 940, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('file:///' + FILE.replace(/\\/g, '/'))
  await new Promise((r) => setTimeout(r, 1200))

  const probe = await win.webContents.executeJavaScript(`(() => {
    const out = {};
    out.sheets = document.styleSheets.length;
    out.rootFill1 = getComputedStyle(document.documentElement).getPropertyValue('--fill-1').trim();
    out.rootBg = getComputedStyle(document.body).backgroundColor;

    const card = document.querySelector('.card');
    out.card = card ? getComputedStyle(card).backgroundColor : 'none';

    const range = document.querySelector('input[type=range]');
    if (range) {
      const cs = getComputedStyle(range);
      out.rangePct = cs.getPropertyValue('--pct').trim();
      // pseudo-element style
      out.trackBg = getComputedStyle(range, '::-webkit-slider-runnable-track').backgroundImage;
      out.thumbW = getComputedStyle(range, '::-webkit-slider-thumb').width;
    }

    const btn = document.querySelector('.btn');
    out.btnBg = btn ? getComputedStyle(btn).backgroundColor : 'none';

    const sw = document.querySelector('.switch-track');
    out.switchBg = sw ? getComputedStyle(sw).backgroundColor : 'none';

    const seg = document.querySelector('.segmented');
    out.segBg = seg ? getComputedStyle(seg).backgroundColor : 'none';

    // count how many CSS rules each sheet exposes
    out.ruleCounts = [];
    for (const sh of document.styleSheets) {
      try { out.ruleCounts.push(sh.cssRules.length); } catch (e) { out.ruleCounts.push('err'); }
    }
    out.styles = [...document.querySelectorAll('style')].map(s => s.textContent.length);
    return out;
  })()`)

  console.log(JSON.stringify(probe, null, 2))
  app.exit(0)
})
