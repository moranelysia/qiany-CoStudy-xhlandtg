import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const __dirnameEsm = fileURLToPath(new URL('.', import.meta.url))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: !isSmoke,
    title: '伴学',
    webPreferences: {
      preload: join(__dirnameEsm, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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

    win.webContents.on('console-message', (_e, level, message) => {
      console.log('[renderer:' + level + '] ' + message)
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
