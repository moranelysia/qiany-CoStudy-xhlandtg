const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ROOT = path.join(__dirname, '..')
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, frame: false,
    webPreferences: { preload: path.join(ROOT, 'out', 'preload', 'index.js'), contextIsolation: true } })
  await win.loadURL('file:///' + path.join(ROOT, 'out', 'renderer', 'index.html').replace(/\\/g, '/'))
  await wait(1500)

  const first = await win.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('.ob-panel')
    return {
      shown: !!document.querySelector('.ob-mask'),
      modes: p ? [...p.querySelectorAll('.ob-mode')].map(b => b.querySelector('.ob-mode-name')?.textContent + (b.hasAttribute('data-dim') ? '(灰)' : '')) : [],
      hasKeyInput: !!p?.querySelector('[data-ob-key]'),
      buttons: p ? [...p.querySelectorAll('.ob-btn')].map(b => b.textContent.trim()) : [],
    }
  })()`)
  console.log('FIRST ' + JSON.stringify(first))

  // 点「先跳过」应该关掉并记住
  await win.webContents.executeJavaScript(`document.querySelector('[data-ob-skip]').click()`)
  await wait(300)
  const afterSkip = await win.webContents.executeJavaScript(`(() => ({
    gone: !document.querySelector('.ob-mask'),
    flag: localStorage.getItem('costudy.onboarding'),
  }))()`)
  console.log('AFTER_SKIP ' + JSON.stringify(afterSkip))

  // 重新加载：不应再弹
  await win.webContents.reload()
  await wait(1500)
  const reload = await win.webContents.executeJavaScript(`(() => ({ shownAgain: !!document.querySelector('.ob-mask') }))()`)
  console.log('RELOAD ' + JSON.stringify(reload))

  // 复位后应再弹（回到首次状态，方便用户自己看）
  await win.webContents.executeJavaScript(`localStorage.removeItem('costudy.onboarding')`)
  app.exit(0)
})