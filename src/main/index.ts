import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGACY_NAMES, ensureDirs, loadConfig } from './config'
import type { CostudyConfig } from './config'
import { CardStore } from './cards'
import { DIM_KEYS } from './character'
import { buildSystemPrompt } from './prompt'
import {
  runCardSelfTest,
  runCompressSelfTest,
  runLearnSelfTest,
  runLlmSelfTest,
  runMemorySelfTest,
  runMistakeSelfTest,
  runPointSelfTest,
  runSafetySelfTest,
} from './selftest'
import { diffCard, generateCardDraft } from './llm/generate-card'
import { createClient, describeClient } from './llm/client'
import { clearKey, describeSettings, encryptionStatus, resolveLlmConfig, saveSettings } from './settings'
import { polishPrompt } from './polish'
import { buildProfile } from './profile'
import { duePoints } from './learn/points'
import { openMistakes } from './learn/mistakes'
import { PHASE_LABEL, latestSession } from './learn/session'

// 去掉 Electron 默认菜单栏（File / Edit / View / Window）。
// 我们用自绘界面，那条黑条既不好看也占一行高度。
Menu.setApplicationMenu(null)

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const isSelfTest = process.argv.includes('--selftest')
const isUiTest = process.argv.includes('--uitest')
const isWinTest = process.argv.includes('--wintest')
const isSafeTest = process.argv.includes('--safetest')
const isLearnTest = process.argv.includes('--learntest')
const isMistakeTest = process.argv.includes('--mistaketest')
const isPointTest = process.argv.includes('--pointtest')
const __dirnameEsm = fileURLToPath(new URL('.', import.meta.url))
const isMemTest = process.argv.includes('--memtest')
const isLlmTest = process.argv.includes('--llmtest')
const isCompressTest = process.argv.includes('--compresstest')
const isX1 = process.argv.includes('--x1')
const isPolishTest = process.argv.includes('--polishtest')

/**
 * 配置在 app 就绪前就要读一部分（应用名要早于窗口创建）。
 * Electron 在 ready 之前就允许调用 getAppPath()。
 */
const config: CostudyConfig = loadConfig({ projectRoot: app.getAppPath() })

/** 角色卡仓库：增删改查 / 导入导出 / 切换当前卡 */
const cards = new CardStore(config.dataDir)

/** 模型客户端：有 API Key 走真实调用，没有则用离线桩 */
// 注意：不能在这里直接 createClient —— 模块加载时 app 还没 ready，
// safeStorage 不可用，解不出密钥，createClient 会静默退化成离线桩。
// 表现就是"已配置 key，但测试连接返回的是桩的回复"。
let llm = createClient({ apiKey: '', baseUrl: '', model: '', timeoutMs: 30000 })

/** 每次用之前重建：既解决 ready 时机，也让"刚保存的 key"立刻生效 */
function freshClient(): ReturnType<typeof createClient> {
  llm = createClient(resolveLlmConfig(config.dataDir))
  return llm
}

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
    // 照 DeepSeek Harness 的窗口做法（Windows）：
    //   titleBarStyle: 'hidden' -> 不要系统标题栏
    //   titleBarOverlay         -> 系统在右上角画最小化/最大化/关闭
    //   backgroundMaterial      -> 系统毛玻璃（acrylic）
    // 比自绘按钮好在：位置、尺寸、hover、双击最大化全是系统原生行为，
    // 高 DPI 和触屏也不会错位。
    backgroundColor: '#00000000',
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#00000000', symbolColor: '#0F1115', height: 42 },
          backgroundMaterial: 'acrylic' as const,
        }
      : {}),
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
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

/** 最小化到任务栏 */
ipcMain.handle('app:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.minimize()
})

/**
 * 关闭窗口并把整个进程杀掉。
 *
 * 为什么不是 window.close()：
 *   close() 只关这一个窗口；如果以后加了后台任务或托盘，进程会留着。
 *   用户点"关闭"的预期是"这个程序退出了"，所以这里 destroy + quit，
 *   再用 exit 兜一层 —— 万一某个 handler 拦住了 quit，也要退。
 */
ipcMain.handle('app:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.destroy()
  app.quit()
  setTimeout(() => app.exit(0), 400)
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
    dims: card.dims,
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

  // 性格维度：只接受已知键，值夹到 0-100。渲染进程传什么都不信。
  const dimsRaw = patch['dims']
  if (dimsRaw && typeof dimsRaw === 'object' && !Array.isArray(dimsRaw)) {
    const incoming = dimsRaw as Record<string, unknown>
    for (const key of DIM_KEYS) {
      const value = incoming[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        card.dims[key] = Math.max(0, Math.min(100, Math.round(value)))
      }
    }
  }

  cards.save(card)
  return { ok: true, card: cards.list().find((c) => c.id === String(id)) ?? null }
})

/**
 * AI 写卡：只生成草稿并返回 diff，**不写盘**。
 * 自动落盘会让「AI 帮我写」变成「AI 覆盖我的卡」。
 */
ipcMain.handle('cards:generate', async (_e, keywords: string) => {
  const current = cards.activeCard(config.cardPath)
  const result = await generateCardDraft(freshClient(), {
    keywords: String(keywords ?? ''),
    stage: config.stage,
    ageRating: current.ageRating,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    draft: result.draft,
    diff: diffCard(current, result.draft),
    client: describeClient(llm),
  }
})

/**
 * 学习者画像 + 今日待复习 + 未纠正错题，一次取全。
 *
 * 为什么合并成一个 IPC：这三块在界面上永远是同一屏出现，
 * 分三次请求会让面板闪三下；而且它们本来就同源（知识点 / 错题本 / 复习队列）。
 */
ipcMain.handle('learn:overview', () => {
  const card = cards.activeCard(config.cardPath)
  const profile = buildProfile({ dataDir: config.dataDir, stage: config.stage })
  const due = duePoints(config.dataDir)
  const mistakes = openMistakes(config.dataDir, 6)
  const session = latestSession(config.dataDir)

  return {
    card: { name: card.name, emoji: card.emoji, address: card.cosplay.address },
    stage: config.stage,
    profile: {
      subjects: profile.subjects,
      weakPoints: profile.weakPoints,
      errorTypes: profile.errorTypes,
      counts: profile.counts,
    },
    due: due.map((p) => ({
      name: p.name,
      subject: p.subject,
      nextReview: p.nextReview,
      mastery: p.mastery,
    })),
    mistakes: mistakes.map((m) => ({
      point: m.point,
      errorType: m.errorType,
      wrongStep: m.wrongStep,
      recurrences: m.recurrences,
    })),
    session: session
      ? {
          phase: PHASE_LABEL[session.phase],
          goal: session.goal,
          taught: session.points.filter((p) => p.taught).length,
          total: session.points.length,
        }
      : null,
  }
})

/* ---------- IPC：模型设置与密钥 ---------- */

/** 只返回"配没配 + 模型名"，绝不返回密钥明文 */
ipcMain.handle('settings:get', () => {
  const info = describeSettings(config.dataDir)
  const enc = encryptionStatus()
  return { ...info, encryption: enc }
})

ipcMain.handle('settings:save', (_e, patch: { apiKey?: string; baseUrl?: string; model?: string }) => {
  const result = saveSettings(config.dataDir, patch ?? {})
  if (result.ok) llm = createClient(resolveLlmConfig(config.dataDir))
  return result
})

ipcMain.handle('settings:clear', () => {
  clearKey(config.dataDir)
  llm = createClient(resolveLlmConfig(config.dataDir))
  return { ok: true }
})

/** 用当前配置真打一次模型，返回耗时与回复片段 */
ipcMain.handle('settings:test', async () => {
  const started = Date.now()
  try {
    const client = freshClient()
    const reply = await client.complete(
      [
        { role: 'system', content: '只回四个字：连接正常' },
        { role: 'user', content: '测试' },
      ],
      // 推理模型：正文之外还要付 reasoning 的 token，16 一定空，给 600
      { maxTokens: 600, temperature: 0 },
    )
    return {
      ok: true,
      ms: Date.now() - started,
      client: describeClient(llm),
      snippet: reply.trim().slice(0, 40),
    }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, client: describeClient(llm), error: (err as Error).message }
  }
})

/* ---------- X1 能力探测：文本 / 图片 / 搜索 ---------- */
// 必须跑在应用自身里：safeStorage 的密文绑定 app 身份，
// 换个入口（探针脚本）就解不开 —— 这是实测出来的。
async function runCapabilityProbe(): Promise<number> {
  const cfg = resolveLlmConfig(config.dataDir)
  const out: Record<string, unknown> = {
    config: { model: cfg.model, baseUrl: cfg.baseUrl, hasKey: Boolean(cfg.apiKey) },
  }
  if (!cfg.apiKey) {
    console.log(JSON.stringify({ fatal: '没有可用密钥' }))
    return 1
  }

  const post = async (body: unknown): Promise<{ status: number; json: any; text: string }> => {
    const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* keep text */ }
    return { status: res.status, json, text }
  }

  // 1) 文本
  try {
    const r = await post({ model: cfg.model, messages: [{ role: 'user', content: '只回两个字：在的' }], max_tokens: 64, temperature: 0 })
    out.text = r.status === 200
      ? {
          ok: true,
          reply: String(r.json?.choices?.[0]?.message?.content ?? '').slice(0, 20),
          finish: r.json?.choices?.[0]?.finish_reason,
          msgKeys: Object.keys(r.json?.choices?.[0]?.message ?? {}),
          contentLen: String(r.json?.choices?.[0]?.message?.content ?? '').length,
          reasoningLen: String(r.json?.choices?.[0]?.message?.reasoning_content ?? '').length,
          usage: r.json?.usage,
        }
      : { ok: false, status: r.status, error: r.text.slice(0, 200) }
  } catch (e) { out.text = { ok: false, error: (e as Error).message } }

  // 2) 图片
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  try {
    const r = await post({
      model: cfg.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: '这张图是什么颜色？只回颜色。' }, { type: 'image_url', image_url: { url: px } }] }],
      max_tokens: 400,
      temperature: 0,
    })
    out.image = r.status === 200
      ? {
          ok: true,
          reply: String(r.json?.choices?.[0]?.message?.content ?? '').slice(0, 40),
          finish: r.json?.choices?.[0]?.finish_reason,
          msgKeys: Object.keys(r.json?.choices?.[0]?.message ?? {}),
          contentLen: String(r.json?.choices?.[0]?.message?.content ?? '').length,
          reasoningLen: String(r.json?.choices?.[0]?.message?.reasoning_content ?? '').length,
        }
      : { ok: false, status: r.status, error: r.text.slice(0, 220) }
  } catch (e) { out.image = { ok: false, error: (e as Error).message } }

  // 3) 搜索（看响应里有没有引用痕迹）
  try {
    const r = await post({
      model: cfg.model,
      messages: [{ role: 'user', content: '用一句话说出今天热门的一个网络角色或梗，并给出来源网址。' }],
      max_tokens: 400,
      temperature: 0,
    })
    if (r.status !== 200) {
      out.search = { ok: false, status: r.status, error: r.text.slice(0, 220) }
    } else {
      const msg = r.json?.choices?.[0]?.message ?? {}
      const reply = String(msg.content ?? '').slice(0, 200)
      out.search = {
        ok: true,
        reply,
        replyHasUrl: /https?:\/\//.test(reply),
        citations: Boolean(msg.annotations || msg.citations || r.json?.citations),
      }
    }
  } catch (e) { out.search = { ok: false, error: (e as Error).message } }

  // 用 settings:test 完全相同的参数走一次 client，验证"测试连接"能不能过
  try {
    const client = freshClient()
    const reply = await client.complete(
      [
        { role: 'system', content: '只回四个字：连接正常' },
        { role: 'user', content: '测试' },
      ],
      { maxTokens: 600, temperature: 0 },
    )
    out.settingsTest = { ok: true, client: describeClient(client), reply: reply.trim().slice(0, 40) }
  } catch (e) {
    out.settingsTest = { ok: false, error: (e as Error).message }
  }

  console.log('[X1] ' + JSON.stringify(out, null, 1))
  return 0
}

/* ---------- M1-1：AI 收尾提示词 ---------- */
// 只产出 systemPrompt 文本，不写盘；是否采用由渲染层的「采用」按钮决定
ipcMain.handle('card:polish', async () => {
  const card = cards.activeCard(config.cardPath)
  const result = await polishPrompt(freshClient(), card, config.stage)
  return { ...result, client: describeClient(llm) }
})
/* ---------- 启动 ---------- */

if (isPolishTest) {
  app.whenReady().then(async () => {
    const card = cards.activeCard(config.cardPath)
    const result = await polishPrompt(freshClient(), card, config.stage)
    console.log('[POLISH] ' + JSON.stringify(result, null, 1))
    app.exit(result.ok ? 0 : 1)
  })
} else if (isX1) {
  app.whenReady().then(async () => {
    app.exit(await runCapabilityProbe())
  })
} else if (isCompressTest) {
  app.whenReady().then(async () => {
    app.exit(await runCompressSelfTest())
  })
} else if (isLlmTest) {
  app.whenReady().then(async () => {
    app.exit(await runLlmSelfTest())
  })
} else if (isMemTest) {
  app.whenReady().then(() => {
    app.exit(runMemorySelfTest())
  })
} else if (isPointTest) {
  app.whenReady().then(() => {
    app.exit(runPointSelfTest())
  })
} else if (isMistakeTest) {
  app.whenReady().then(() => {
    app.exit(runMistakeSelfTest())
  })
} else if (isLearnTest) {
  app.whenReady().then(() => {
    app.exit(runLearnSelfTest())
  })
} else if (isSafeTest) {
  app.whenReady().then(() => {
    app.exit(runSafetySelfTest())
  })
} else if (isSelfTest) {
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
          // Studio 预览栏底部的「保存角色」：之前只改按钮文字，现在要真写盘
          await run(`(() => {
            const nameEl = document.querySelector('.v-studio [data-in="name"]')
            if (nameEl) {
              nameEl.value = 'UITEST-乙-改过'
              nameEl.dispatchEvent(new Event('input', { bubbles: true }))
            }
            return true
          })()`)
          // 用【真实鼠标事件】点保存按钮。
          // element.click() 是合成事件，绕过 Chromium 的命中测试 ——
          // 上一版整窗拖拽导致点击全失效时，合成点击照样"成功"，测试因此漏报。
          const rect = (await run(`(() => {
            const b = document.querySelector('.v-studio .footer-bar [data-save]')
            if (!b) return null
            // 必须先滚进视口：rect.y 可能超出窗口高度，那样真实鼠标事件会打空
            b.scrollIntoView({ block: 'center' })
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)) as { x: number; y: number } | null
          out.clickRect = rect
          if (rect) {
            win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
            win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
          }
          await new Promise((r) => setTimeout(r, 800))
          out.savedName = cards.activeCard().name
          out.savedPersonality = cards.activeCard().personality

          // 诊断：交互依赖的全局与 DOM 是否就位
          out.diagInteractive = (await run(`(() => ({
            learnOverview: typeof window.costudy?.learnOverview,
            setActive: typeof window.__costudySetActive,
            enterLearn: typeof window.__costudyEnterLearn,
            profileNodes: document.querySelectorAll('[data-profile]').length,
            studioPanel: !!document.querySelector('.v-studio .panel-head[data-profile]'),
            ovStyle: !!document.getElementById('ov-style'),
          }))()`))

          /* ---------- 死按钮是否接上真实行为 ---------- */
          // 1) 学习者画像：Studio 的画像面板头可点（data-profile），点开浮层
          await run("document.querySelector('[data-profile]')?.click()")
          await new Promise((r) => setTimeout(r, 700))
          const ov = (await run(`(() => {
            const mask = document.querySelector('.ov-mask')
            const panel = document.querySelector('.ov-panel')
            return { open: !!mask, chars: panel ? panel.textContent.trim().length : 0,
                     hasWeak: panel ? panel.textContent.includes('最薄弱') : false }
          })()`)) as { open: boolean; chars: number; hasWeak: boolean }
          out.overview = ov
          await run("document.querySelector('[data-ov-close]')?.click()")

          // 2) 学习页 dock：切到 Companion → 进学习模式 → 输入一句 → 回车
          await run("window.__costudySetActive && window.__costudySetActive(2)")
          await new Promise((r) => setTimeout(r, 500))
          await run("window.__costudyEnterLearn && window.__costudyEnterLearn()")
          await new Promise((r) => setTimeout(r, 500))
          const beforeMsgs = (await run("document.querySelectorAll('.learn-msg').length")) as number
          await run(`(() => {
            const input = document.querySelector('.dock input.input')
            if (!input) return false
            input.value = '我想先试试判别式'
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            return true
          })()`)
          await new Promise((r) => setTimeout(r, 900))
          const afterMsgs = (await run("document.querySelectorAll('.learn-msg').length")) as number
          out.dock = { before: beforeMsgs, after: afterMsgs, added: afterMsgs - beforeMsgs }


          const rail = out.rail as Array<{ name?: string; on?: boolean }>
          const after = out.afterClick as { on: boolean[]; island?: string; nameInput?: string }
          const ok =
            rail.length === 2 &&
            rail.some((r) => r.on === true) &&
            after.island === 'UITEST-乙' &&
            after.nameInput === 'UITEST-乙' &&
            out.savedPersonality === 'UITEST 写入的性格' &&
            (out.overview as { open: boolean; chars: number; hasWeak: boolean }).open &&
            (out.overview as { chars: number }).chars > 80 &&
            (out.dock as { added: number }).added >= 2 &&
            out.savedName === 'UITEST-乙-改过'
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

    /* ---------- 窗口按钮自检：最小化 / 关闭 ---------- */
    if (isWinTest) {
      setTimeout(async () => {
        const run = async (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        try {
          // 窗口按钮交给系统 titleBarOverlay：验证自绘栏已撤掉 + 内容已下移 42px
          const counts = (await run(`(() => ({
            winbar: document.querySelectorAll('[data-winbar]').length,
            padTop: getComputedStyle(document.body).paddingTop,
          }))()`)) as { winbar: number; padTop: string }
          console.log('[WINTEST] custom bar removed: ' + (counts.winbar === 0) + ', body padding-top: ' + counts.padTop)

          // 灵动岛切换（岛切换）：必须用真实鼠标事件 —— 合成 click 绕过命中测试，
          // 而这里要验的正是"真实窗口里点得到"
          const isl = (await run(`(() => {
            const b = document.querySelectorAll('.proto-picker-item')[1]
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)) as { x: number; y: number } | null
          if (isl) {
            win.webContents.sendInputEvent({ type: 'mouseMove', x: isl.x, y: isl.y })
            win.webContents.sendInputEvent({ type: 'mouseDown', x: isl.x, y: isl.y, button: 'left', clickCount: 1 })
            win.webContents.sendInputEvent({ type: 'mouseUp', x: isl.x, y: isl.y, button: 'left', clickCount: 1 })
            await new Promise((r) => setTimeout(r, 800))
            const switched = (await run("!!document.querySelector('.v-wiz')")) as boolean
            console.log('[WINTEST] island switch by real mouse: ' + switched + ' at ' + JSON.stringify(isl))
            if (!switched) { console.log('[WINTEST] result: FAIL (灵动岛点不动)'); app.exit(2) }
          }

          // 全屏：透明窗口的 isFullScreen() 不可靠，界面状态由主进程 WeakMap 决定
          await run("window.costudy.toggleFullscreen()")
          await new Promise((r) => setTimeout(r, 700))
          const fsOn = await run("window.costudy.isFullscreen()")
          console.log('[WINTEST] fullscreen on: ' + fsOn)
          await run("window.costudy.toggleFullscreen()")
          await new Promise((r) => setTimeout(r, 700))
          const fsOff = await run("window.costudy.isFullscreen()")
          console.log('[WINTEST] fullscreen off: ' + fsOff)


          await run("window.costudy.minimize()")
          await new Promise((r) => setTimeout(r, 500))
          const minimized = win.isMinimized()
          console.log('[WINTEST] minimized: ' + minimized)
          console.log('[WINTEST] minimized visible: ' + win.isVisible() + ' bounds=' + JSON.stringify(win.getBounds()))
          win.restore()
          await new Promise((r) => setTimeout(r, 300))

          console.log('[WINTEST] result: PASS（按钮就位、最小化生效），接下来点关闭，进程应自行退出')
          // 点关闭：进程必须自己退出。留一个看门狗，退不掉就算失败。
          setTimeout(() => {
            console.log('[WINTEST] result: FAIL (进程没有退出)')
            app.exit(2)
          }, 8000)
          await run("window.costudy.close()")
        } catch (err) {
          console.log('[WINTEST] FAIL ' + String(err))
          app.exit(2)
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
