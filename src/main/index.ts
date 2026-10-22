import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 去掉 Electron 默认菜单栏（File / Edit / View / Window）。
// 我们用自绘界面，那条黑条既不好看也占一行高度。
Menu.setApplicationMenu(null)

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const __dirnameEsm = fileURLToPath(new URL('.', import.meta.url))

/**
 * 透明窗口在 Windows 上有个坑：setFullScreen(true) 之后
 * 视觉上确实铺满了全屏，但 isFullScreen() 仍然返回 false。
 * 所以不能用 isFullScreen() 判断状态（会导致"永远进不了退出"），
 * 自己维护一份。
 */
const fullscreenState = new WeakMap<BrowserWindow, boolean>()

const isFs = (win: BrowserWindow): boolean => fullscreenState.get(win) ?? false

const setFs = (win: BrowserWindow, on: boolean): void => {
  fullscreenState.set(win, on)
  win.setFullScreen(on)
  if (!win.isDestroyed()) win.webContents.send('app:fullscreen-changed', on)
}

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

  // 双保险：即使系统仍画菜单栏，也把它藏掉
  win.setMenuBarVisibility(false)

  // 透明窗口在部分驱动上会闪白，先隐藏再由 ready-to-show 显示
  win.setBackgroundColor('#00000000')

  /* ---------- 全屏 ---------- */
  fullscreenState.set(win, false)

  // 非透明窗口上系统事件会来，同步一下我们自己记的状态
  win.on('enter-full-screen', () => {
    fullscreenState.set(win, true)
    if (!win.isDestroyed()) win.webContents.send('app:fullscreen-changed', true)
  })
  win.on('leave-full-screen', () => {
    fullscreenState.set(win, false)
    if (!win.isDestroyed()) win.webContents.send('app:fullscreen-changed', false)
  })

  // F11 切换；全屏时 Esc 退出。用 before-input-event 而不是全局快捷键，
  // 只在窗口聚焦时生效，不抢占系统级 F11。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      event.preventDefault()
      setFs(win, !isFs(win))
    } else if (input.key === 'Escape' && isFs(win)) {
      event.preventDefault()
      setFs(win, false)
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
  const next = !isFs(win)
  setFs(win, next)
  return next
})

ipcMain.handle('app:isFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? isFs(win) : false
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
        console.log('[SMOKE] menu       : ' + (Menu.getApplicationMenu() ? 'present' : 'none'))

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
