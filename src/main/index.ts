import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGACY_NAMES, ensureDirs, loadConfig } from './config'
import type { CostudyConfig } from './config'
import { CardStore } from './cards'
import { buildSystemPrompt } from './prompt'
import { runCardSelfTest } from './selftest'

// 去掉 Electron 默认菜单栏（File / Edit / View / Window）。
// 我们用自绘界面，那条黑条既不好看也占一行高度。
Menu.setApplicationMenu(null)

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const isSelfTest = process.argv.includes('--selftest')
const isUiTest = process.argv.includes('--uitest')
const __dirnameEsm = fileURLToPath(new URL('.', import.meta.url))

/**
 * 配置在 app 就绪前就要读一部分（应用名要早于窗口创建）。
 * Electron 在 ready 之前就允许调用 getAppPath()。
 */
const config: CostudyConfig = loadConfig({ projectRoot: app.getAppPath() })

/** 角色卡仓库：增删改查 / 导入导出 / 切换当前卡 */
const cards = new CardStore(config.dataDir)

// 应用身份中性化：名字与 ID 全部来自配置，代码里不再出现任何角色名
app.setName(config.appName)
if (process.platform === 'win32') app.setAppUserModelId(config.appId)

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
    title: config.appName,
    transparent: true,
    backgroundColor: '#00000000',
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

/* ---------- IPC：应用 ---------- */

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

/** 渲染进程需要的配置子集（不含绝对路径，避免把本机目录结构漏进界面） */
ipcMain.handle('app:config', () => ({
  appName: config.appName,
  stage: config.stage,
}))

/** 当前角色卡摘要（每次调用都重读文件，改完立刻生效） */
ipcMain.handle('app:card', () => {
  const card = cards.activeCard(config.cardPath)
  return {
    name: card.name,
    emoji: card.emoji,
    address: card.cosplay.address,
    ageRating: card.ageRating,
    hasContent: Boolean(card.personality || card.description || card.cosplay.style),
  }
})

/* ---------- IPC：角色卡仓库 ---------- */

ipcMain.handle('cards:list', () => cards.list())

ipcMain.handle('cards:get', (_e, id: string) => {
  const card = cards.read(String(id))
  if (!card) return null
  return {
    id: String(id),
    name: card.name,
    emoji: card.emoji,
    address: card.cosplay.address,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    firstMes: card.firstMes,
    mesExample: card.mesExample,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    style: card.cosplay.style,
    rules: card.cosplay.rules,
    behavior: card.cosplay.behavior,
    opening: card.cosplay.opening,
    ageRating: card.ageRating,
  }
})

ipcMain.handle('cards:create', (_e, name?: string) => {
  const card = cards.create(typeof name === 'string' && name.trim() ? name.trim() : '新角色')
  return cards.list().find((c) => c.id === card.cosplay.id) ?? null
})

ipcMain.handle('cards:duplicate', (_e, id: string) => {
  const card = cards.duplicate(String(id))
  if (!card) return null
  return cards.list().find((c) => c.id === card.cosplay.id) ?? null
})

ipcMain.handle('cards:delete', (_e, id: string) => cards.remove(String(id)))

ipcMain.handle('cards:setActive', (_e, id: string) => cards.setActive(String(id)))

ipcMain.handle('cards:import', (_e, text: string) => {
  const result = cards.importJson(String(text ?? ''))
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, card: cards.list().find((c) => c.id === result.card.cosplay.id) ?? null }
})

ipcMain.handle('cards:export', (_e, id: string) => cards.exportJson(String(id)))

/**
 * 保存编辑器改过的字段。
 * 只接受白名单字段，避免渲染进程塞进来任意结构。
 */
ipcMain.handle('cards:save', (_e, id: string, patch: Record<string, unknown>) => {
  const card = cards.read(String(id))
  if (!card) return { ok: false, error: '找不到这张卡' }

  const text = (key: string): string | undefined => {
    const value = patch[key]
    return typeof value === 'string' ? value : undefined
  }

  const name = text('name')
  if (name !== undefined) card.name = name.trim() || card.name
  const emoji = text('emoji')
  if (emoji !== undefined) card.emoji = emoji
  const description = text('description')
  if (description !== undefined) card.description = description
  const personality = text('personality')
  if (personality !== undefined) card.personality = personality
  const scenario = text('scenario')
  if (scenario !== undefined) card.scenario = scenario
  const firstMes = text('firstMes')
  if (firstMes !== undefined) card.firstMes = firstMes
  const mesExample = text('mesExample')
  if (mesExample !== undefined) card.mesExample = mesExample
  const systemPrompt = text('systemPrompt')
  if (systemPrompt !== undefined) card.systemPrompt = systemPrompt
  const postHistory = text('postHistoryInstructions')
  if (postHistory !== undefined) card.postHistoryInstructions = postHistory
  const style = text('style')
  if (style !== undefined) card.cosplay.style = style
  const rules = text('rules')
  if (rules !== undefined) card.cosplay.rules = rules
  const behavior = text('behavior')
  if (behavior !== undefined) card.cosplay.behavior = behavior
  const opening = text('opening')
  if (opening !== undefined) card.cosplay.opening = opening
  const address = text('address')
  if (address !== undefined) card.cosplay.address = address.trim() || card.cosplay.address

  cards.save(card)
  return { ok: true, card: cards.list().find((c) => c.id === String(id)) ?? null }
})

/* ---------- 启动 ---------- */

if (isSelfTest) {
  app.whenReady().then(() => {
    app.exit(runCardSelfTest())
  })
} else {
  app.whenReady().then(async () => {
    ensureDirs(config)
    cards.ensure()
    const win = createWindow()

    /* ---------- UI 连接性自检：用真实 IPC 走一遍角色栏 ---------- */
    if (isUiTest) {
      setTimeout(async () => {
        const run = async (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const out: Record<string, unknown> = {}
        try {
          // 清掉上次残留的测试卡，保证从已知状态开始
          for (const c of cards.list()) if (c.name.startsWith('UITEST')) cards.remove(c.id)
          cards.create('UITEST-甲')
          cards.create('UITEST-乙')

          // 切到 Wizard 再切回 Studio，触发挂载后同步角色栏
          await run("document.querySelectorAll('.proto-picker-item')[1].click()")
          await new Promise((r) => setTimeout(r, 700))
          await run("document.querySelectorAll('.proto-picker-item')[0].click()")
          await new Promise((r) => setTimeout(r, 1200))

          out.diag = await run(`(() => ({
            hasStudio: !!document.querySelector('.v-studio'),
            hasRail: !!document.querySelector('.v-studio [data-cards]'),
            railLen: document.querySelector('.v-studio [data-cards]')?.innerHTML.length ?? -1,
            pickers: document.querySelectorAll('.proto-picker-item').length,
            bodyLen: document.body.innerText.length,
          }))()`)
          out.cardsViaIpc = await run("(async () => (await window.costudy.cards.list()).map(c => c.name))()")
          out.rail = await run(`(() => {
            const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')]
            return items.map((el) => ({ name: el.querySelector('.card-name')?.textContent, on: el.classList.contains('is-on') }))
          })()`)
          out.islandBefore = await run("document.querySelector('.proto-picker-status-title')?.textContent")

          await run("(() => { const items=[...document.querySelectorAll('.v-studio [data-cards] .card-item')]; items[1]?.click(); })()")
          await new Promise((r) => setTimeout(r, 900))

          out.afterClick = await run(`(() => {
            const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')]
            return {
              on: items.map((el) => el.classList.contains('is-on')),
              island: document.querySelector('.proto-picker-status-title')?.textContent,
              nameInput: document.querySelector('.v-studio [data-in="name"]')?.value,
            }
          })()`)

          // 编辑器：改一行字 → 保存 → 从仓库读回来确认落盘
          out.editorMounted = await run("!!document.querySelector('.card-editor')")
          await run(`(() => {
            const ta = document.querySelector('.card-editor [data-ce="personality"]')
            if (!ta) return false
            ta.value = 'UITEST 写入的性格'
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            document.querySelector('.card-editor [data-ce-act="save"]')?.click()
            return true
          })()`)
          await new Promise((r) => setTimeout(r, 900))
          out.savedPersonality = cards.activeCard().personality

          const rail = out.rail as Array<{ name?: string; on?: boolean }>
          const after = out.afterClick as { on: boolean[]; island?: string; nameInput?: string }
          const ok =
            rail.length === 2 &&
            rail.some((r) => r.on === true) &&
            after.island === 'UITEST-乙' &&
            after.nameInput === 'UITEST-乙' &&
            out.savedPersonality === 'UITEST 写入的性格'
          out.result = ok ? 'PASS' : 'FAIL'
          console.log('[UITEST] ' + JSON.stringify(out, null, 2))
          for (const c of cards.list()) if (c.name.startsWith('UITEST')) cards.remove(c.id)
          app.exit(ok ? 0 : 1)
        } catch (err) {
          console.log('[UITEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

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

          // 阶段 1 的验收：提示词能拼出来，且不含任何旧角色痕迹
          const card = cards.activeCard(config.cardPath)
          const prompt = buildSystemPrompt({
            card,
            learningDir: config.learningDir,
            stage: config.stage,
          })
          const legacyHits = LEGACY_NAMES.filter((word) =>
            prompt.toLowerCase().includes(word.toLowerCase()),
          )

          console.log('[SMOKE] title      : ' + title)
          console.log('[SMOKE] body text  : ' + text.replace(/\s+/g, ' ').trim().slice(0, 100))
          console.log('[SMOKE] ipc info   : ' + JSON.stringify(info))
          console.log('[SMOKE] menu       : ' + (Menu.getApplicationMenu() ? 'present' : 'none'))
          console.log('[SMOKE] app name   : ' + app.getName())
          console.log('[SMOKE] stage      : ' + config.stage)
          console.log('[SMOKE] card       : ' + card.name)
          console.log('[SMOKE] cards      : ' + cards.list().length)
          console.log('[SMOKE] prompt len : ' + prompt.length)
          console.log('[SMOKE] legacy hit : ' + (legacyHits.length ? legacyHits.join(',') : 'none'))

          const ok =
            title.includes(config.appName) &&
            text.includes(config.appName) &&
            info !== null &&
            typeof info === 'object' &&
            'electron' in (info as Record<string, unknown>) &&
            prompt.length > 500 &&
            legacyHits.length === 0 &&
            prompt.includes(card.name)

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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
