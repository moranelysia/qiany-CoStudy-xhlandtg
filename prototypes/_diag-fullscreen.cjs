// Diagnose fullscreen with per-case try/catch so a crash in one case doesn't kill the run.
const { app, BrowserWindow } = require('electron')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function snap(win, tag) {
  const b = win.getBounds()
  return `${tag}: full=${win.isFullScreen()} max=${win.isMaximized()} bounds=${b.width}x${b.height}`
}

async function runCase(label, options) {
  let win = null
  try {
    win = new BrowserWindow({ width: 1200, height: 800, show: true, ...options })
    await wait(700)
    const lines = [snap(win, 'start')]
    win.setFullScreen(true)
    await wait(900)
    lines.push(snap(win, 'enter'))
    win.setFullScreen(false)
    await wait(900)
    lines.push(snap(win, 'exit'))
    const stuck = win.isFullScreen()
    return { label, lines, stuck, error: null }
  } catch (err) {
    return { label, lines: [], stuck: false, error: String(err && err.message ? err.message : err) }
  } finally {
    try { if (win) win.destroy() } catch { /* ignore */ }
  }
}

app.whenReady().then(async () => {
  const cases = [
    ['normal', {}],
    ['transparent', { transparent: true, backgroundColor: '#00000000' }],
    ['acrylic only', { backgroundMaterial: 'acrylic' }],
    ['transparent+acrylic', { transparent: true, backgroundColor: '#00000000', backgroundMaterial: 'acrylic' }],
  ]
  for (const [label, opts] of cases) {
    const r = await runCase(label, opts)
    if (r.error) {
      console.log('### ' + label + '  ERROR: ' + r.error)
      continue
    }
    console.log('### ' + label + (r.stuck ? '   <-- 退出失败' : ''))
    r.lines.forEach((l) => console.log('  ' + l))
  }
  console.log('[DONE]')
  app.exit(0)
})

process.on('uncaughtException', (e) => {
  console.log('[UNCAUGHT] ' + (e && e.message))
  app.exit(1)
})
