import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const __dirnameEsm = fileURLToPath(new URL('.', import.meta.url))

function createWindow(): BrowserWindow {
  // 大背景透明：窗口本身不铺底色，玻璃下面透出的是桌面。
  // Windows 11 22H2+ 叠一层系统亚克力（acrylic），macOS 用 vibrancy，
  // 其余平台只做 CSS 透明 —— 不支持时 Electron 会忽略这些选项。
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: !isSmoke,
    title: '伴学',
    transparent: true,
    backgroundColor: '#00000000',
    // 有系统材质时用系统材质，没有就纯透明
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    ...(process.platform === 'darwin'
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    hasShadow: true,
    webPreferences: {
      preload: join(__dirnameEsm, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 透明窗口在部分驱动上会闪白，先隐藏再由 ready-to-show 显示
  win.setBackgroundColor('#00000000')

  /* ---------- 全屏 ---------- */
  const broadcastFullscreen = (on: boolean): void => {
    if (!win.isDestroyed()) win.webContents.send('app:fullscreen-changed', on)
  }
  win.on('enter-full-screen', () => broadcastFullscreen(true))
  win.on('leave-full-screen', () => broadcastFullscreen(false))

  // F11 切换；全屏时 Esc 退出。用 before-input-event 而不是全局快捷键，
  // 只在窗口聚焦时生效，不抢占系统级 F11。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      event.preventDefault()
      win.setFullScreen(!win.isFullScreen())
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      event.preventDefault()
      win.setFullScreen(false)
    }
  })

  win.on('ready-to-show', () => {
    if (!isSmoke) win.show()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirnameEsm, '../renderer/index.html'))
  }

  return win
}

ipcMain.handle('app:toggleFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const next = !win.isFullScreen()
  win.setFullScreen(next)
  return next
})

ipcMain.handle('app:isFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isFullScreen() : false
})

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  platform: process.platform,
}))

app.whenReady().then(async () => {
  const win = createWindow()

  if (isSmoke) {
    const fail = (msg: string): void => {
      console.error('[SMOKE] FAIL: ' + msg)
      app.exit(1)
    }

    win.webContents.on('console-message', (event) => {
      console.log('[renderer:' + event.level + '] ' + event.message)
    })
    win.webContents.on('render-process-gone', (_e, d) => fail('renderer gone: ' + JSON.stringify(d)))
    win.webContents.on('did-fail-load', (_e, code, desc) => fail('did-fail-load ' + code + ' ' + desc))

    setTimeout(async () => {
      try {
        const title = win.getTitle()
        const text = (await win.webContents.executeJavaScript(
          'document.body.innerText',
        )) as string
        const info = (await win.webContents.executeJavaScript(
          'window.costudy ? window.costudy.info() : null',
        )) as unknown

        console.log('[SMOKE] title      : ' + title)
        console.log('[SMOKE] body text  : ' + text.replace(/\s+/g, ' ').trim().slice(0, 160))
        console.log('[SMOKE] ipc info   : ' + JSON.stringify(info))

        const ok =
          title.includes('伴学') &&
          text.includes('伴学') &&
          info !== null &&
          typeof info === 'object' &&
          'electron' in (info as Record<string, unknown>)

        console.log('[SMOKE] result     : ' + (ok ? 'PASS' : 'FAIL'))
        app.exit(ok ? 0 : 1)
      } catch (err) {
        fail('exception: ' + String(err))
      }
    }, 2500)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
