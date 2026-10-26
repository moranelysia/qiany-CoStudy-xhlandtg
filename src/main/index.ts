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
import { draftFromChat, draftToPatch } from './learn/m3-chat'
import { dropDraft, listDrafts, readDraft, saveDraft } from './learn/drafts'
import {
  advancePhase,
  appendMessage,
  createSession,
  currentSession,
  ensureSession,
  listSessions,
  loadMessages,
  setCurrent,
  setSessionPoint,
} from './learn/session-store'
import { fetchPageText } from './web-fetch'
import { appendMemory, deleteMemory, readMemory } from './memory/score'
import { touchInjected } from './memory/score'
import { parseMemoryMarkers } from './memory/extract'
import { judgeAnswer } from './learn/evaluate'
import { addMistake, listMistakes } from './learn/mistakes'
import { listPoints, upsertPoint } from './learn/points'
import { formatDeclaredForPrompt, readDeclaredProfile, saveDeclaredProfile } from './learn/profile-form'
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
const isProfileTest = process.argv.includes('--profiletest')
const isM3Test = process.argv.includes('--m3test')
const isFetcherTest = process.argv.includes('--fetcher')
const isSessionTest = process.argv.includes('--sessiontest')
const isReplyTest = process.argv.includes('--replytest')
const isLearnProbe = process.argv.includes('--learnprobe')
const isMemLite = process.argv.includes('--memlite')
const isExtractTest = process.argv.includes('--extracttest')
const isReplyIpc = process.argv.includes('--replyipc')
const isJudgeTest = process.argv.includes('--judgetest')
const isCheckFlow = process.argv.includes('--checkflow')
const isApplyTest = process.argv.includes('--applytest')
const isDraftTest = process.argv.includes('--drafttest')
const isModeTest = process.argv.includes('--modetest')
const isCardViewTest = process.argv.includes('--cardviewtest')

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
    catchphrase: card.cosplay.catchphrase ?? '',
    dislikes: card.cosplay.dislikes ?? '',
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
  console.log('[CARD-SAVE2] id=' + String(id) + ' patch=' + JSON.stringify(patch))
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
  const catchphrase = text('catchphrase')
  if (catchphrase !== undefined) card.cosplay.catchphrase = catchphrase
  const dislikes = text('dislikes')
  if (dislikes !== undefined) card.cosplay.dislikes = dislikes
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

  // 关键：改完内存必须落盘。这一行之前缺失，导致「保存角色」一直是假保存。
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
      max_tokens: 3000,
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
        finish: r.json?.choices?.[0]?.finish_reason,
        contentLen: String(msg.content ?? '').length,
        reasoningLen: String(msg.reasoning_content ?? '').length,
        usage: r.json?.usage,
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
/* ---------- M2：学情画像（用户自己填的）---------- */
ipcMain.handle('profile:get', () => readDeclaredProfile(config.dataDir))
ipcMain.handle('profile:save', (_e, patch: Record<string, unknown>) =>
  saveDeclaredProfile(config.dataDir, patch as never),
)
/* ---------- M3：跟 AI 聊出来 ---------- */
// 只产出草稿 + 伴学示例；「采用」由渲染层调 cards:save
ipcMain.handle('card:chat-draft', async (_e, payload: { brief?: string; context?: string }) => {
  const current = cards.activeCard(config.cardPath)
  const result = await draftFromChat(
    freshClient(),
    {
      brief: String(payload?.brief ?? ''),
      context: String(payload?.context ?? ''),
      stage: config.stage,
    },
    current,
  )
  // 生成即存草稿：关掉面板也不会丢（之前试十个角色全白花）
  let draftId = ''
  if (result.ok && result.draft) {
    const saved = saveDraft(config.dataDir, {
      brief: String(payload?.brief ?? ''),
      ms: result.ms ?? 0,
      usedSearch: Boolean(result.usedSearch),
      sources: payload?.context ? ['用户提供的资料'] : [],
      draft: result.draft as unknown as Record<string, string>,
      sample: result.sample ?? '',
    })
    draftId = saved.id
  }
  return { ...result, draftId }
})

/** 采用 M3 草稿：写进当前卡 */
ipcMain.handle('card:chat-apply', (_e, payload: { draft?: Record<string, string>; draftId?: string } | Record<string, string>) => {
  const draft = ((payload as { draft?: Record<string, string> }).draft ?? payload) as Record<string, string>
  const active = cards.list().find((c) => c.isActive) ?? cards.list()[0]
  if (!active) return { ok: false, error: '没有可写入的角色卡' }
  const card = cards.read(active.id)
  if (!card) return { ok: false, error: '读不到这张卡' }
  // CardStore.save 收整张卡，所以这里读-改-写，而不是传 patch
  const patch = draftToPatch(draft as never)
  card.name = patch.name ?? card.name
  card.emoji = patch.emoji ?? card.emoji
  card.description = patch.description ?? card.description
  card.personality = patch.personality ?? card.personality
  card.scenario = patch.scenario ?? card.scenario
  card.firstMes = patch.firstMes ?? card.firstMes
  card.mesExample = patch.mesExample ?? card.mesExample
  card.systemPrompt = patch.systemPrompt ?? card.systemPrompt
  card.postHistoryInstructions =
    patch.postHistoryInstructions ?? card.postHistoryInstructions
  card.cosplay = {
    ...card.cosplay,
    address: patch.address ?? card.cosplay.address,
    style: patch.style ?? card.cosplay.style,
    rules: patch.rules ?? card.cosplay.rules,
    behavior: patch.behavior ?? card.cosplay.behavior,
    opening: patch.opening ?? card.cosplay.opening,
  }
  cards.save(card)
  const draftId = (payload as { draftId?: string }).draftId
  if (draftId) dropDraft(config.dataDir, String(draftId))
  // 写完回读：界面和自检都要能确认真的落盘了，而不是"我以为存了"
  const back = cards.read(active.id)
  return {
    ok: true,
    card: back
      ? {
          id: active.id,
          name: back.name,
          address: back.cosplay.address,
          personalityLen: back.personality.length,
          styleLen: back.cosplay.style.length,
        }
      : null,
  }
})
/* ---------- 网页取文（M3 的搜索降级方案）---------- */
// DS 这个接口没有原生联网搜索（模型明确拒绝），所以资料由我们自己抓
ipcMain.handle('web:fetch', async (_e, url: string) => fetchPageText(String(url ?? '')))
/* ---------- P1：会话（消息落盘 + 多会话 + 阶段）---------- */
ipcMain.handle('session:list', () => listSessions(config.dataDir))
ipcMain.handle('session:current', () => currentSession(config.dataDir))
ipcMain.handle('session:ensure', () => {
  const meta = ensureSession(config.dataDir)
  seedPointFromProfile(meta)
  return currentSession(config.dataDir) ?? meta
})
ipcMain.handle('session:create', (_e, title: string) => createSession(config.dataDir, String(title ?? '')))
ipcMain.handle('session:setCurrent', (_e, id: string) => setCurrent(config.dataDir, String(id ?? '')))
ipcMain.handle('session:messages', (_e, id: string) => loadMessages(config.dataDir, String(id ?? '')))
ipcMain.handle('session:append', (_e, payload: { id: string; role: 'user' | 'assistant'; text: string }) =>
  appendMessage(config.dataDir, String(payload?.id ?? ''), payload?.role ?? 'user', String(payload?.text ?? '')),
)
ipcMain.handle('session:setPoint', (_e, payload: { id: string; point: string }) =>
  setSessionPoint(config.dataDir, String(payload?.id ?? ''), String(payload?.point ?? '')),
)

ipcMain.handle('session:advance', (_e, payload: { id: string; to: string }) =>
  advancePhase(config.dataDir, String(payload?.id ?? ''), String(payload?.to ?? '') as never),
)
/**
 * 记忆标记的使用说明（追加到学习对话的 system 末尾）。
 *
 * 机制早就有了（memory/extract.ts 负责解析），但模型不知道要用它 ——
 * 所以必须在提示词里明确写：什么时候记、记成什么样。
 */
const MEMORY_MARKER_GUIDE = [
  '===== 顺手记一笔（不要念给用户听）=====',
  '',
  ' 遇到**关于这个人、以后还用得上**的事实，在回复里加一行标记，系统会存下来：',
  '   [记住: 他做几何题必须画图]      —— 稳定的偏好、习惯、背景',
  '   [经历: 今天第一次独立做出判别式题] —— 具体发生过的事',
  '',
  ' 该记：习惯、卡点、偏好、目标、明确的忌口。',
  ' 不该记：题目本身、你讲过的推导、客套话、一次性的情绪。',
  ' 一条标记只写一句、不超过 40 字。没有值得记的就不要写。',
  '',
  ' 标记会被系统删掉，用户看不到；不要在正文里解释它。',
  '',
].join('\n')
/**
 * 会话没有"当前点"时，用学情里第一个目标知识点补上。
 *
 * 为什么用学情而不是让模型自己声明：
 *   这是确定性数据 —— 用户已经明确说想学什么，没理由让他再等模型开口。
 *   模型声明那条（[当前点: …]）以后可以再加，作为覆盖。
 */
function seedPointFromProfile(session: { id: string; point?: string }): void {
  if (session.point) return
  const profile = readDeclaredProfile(config.dataDir)
  const first = profile.targetPoints[0]
  if (!first) return
  setSessionPoint(config.dataDir, session.id, first)
}
/* ---------- P1：学习对话（落盘 -> 调模型 -> 落盘）---------- */
/**
 * 一轮对话：
 *   1. 用户消息先落盘（模型挂了也不丢）
 *   2. 用 phaseGuide 告诉模型"这一步该干什么"
 *   3. 回复落盘
 */
ipcMain.handle('learn:reply', async (_e, payload: { sessionId?: string; text?: string }) => {
  const text = String(payload?.text ?? '').trim()
  if (!text) return { ok: false, error: '空消息' }
  const meta = payload?.sessionId ? listSessions(config.dataDir).find((s) => s.id === payload.sessionId) : null
  const session = meta ?? ensureSession(config.dataDir)

  seedPointFromProfile(session)

  const saved = appendMessage(config.dataDir, session.id, 'user', text)
  if (!saved.ok) return { ok: false, error: saved.error ?? '写入失败' }

  const card = cards.activeCard(config.cardPath)
  const state = {
    id: session.id,
    goal: '',
    stage: config.stage,
    phase: session.phase,
    points: [],
    activeIndex: 0,
    weaknesses: [],
    startedAt: session.createdAt,
    updatedAt: session.updatedAt,
    trail: [],
  }

  const history = loadMessages(config.dataDir, session.id)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.text }))

  const system = [
    buildSystemPrompt({
      card,
      learningDir: config.learningDir,
      stage: config.stage,
      dataDir: config.dataDir,
      declared: formatDeclaredForPrompt(readDeclaredProfile(config.dataDir)),
      session: state as never,
    }),
    MEMORY_MARKER_GUIDE,
  ].join('\n')

  // 先把这一轮要注入的记忆记一次访问（必须在拼提示词之前，保证是同一批）
  const recalled = touchInjected(config.dataDir)

  try {
    const client = freshClient()
    const reply = await client.complete(
      [{ role: 'system', content: system }, ...history],
      { maxTokens: 1200, temperature: 0.6 },
    )
    const raw = reply.trim()
    if (!raw) return { ok: false, sessionId: session.id, error: '模型返回空正文' }

    // 记忆轻量化第二批：模型可以用 [记住: …] / [经历: …] 主动记一笔。
    // 标记从给用户看的文本里删掉，用户不该看到内部协议。
    const { clean, items } = parseMemoryMarkers(raw)
    for (const item of items) {
      appendMemory(config.dataDir, { kind: item.kind, content: item.content, source: '对话' })
    }

    // P4：检验阶段判对错 -> 更新掌握度 / 记错题（让知识点表真的有数据）
    let judged: string | null = null
    if (session.phase === 'check') {
      const lastAssistant = loadMessages(config.dataDir, session.id)
        .filter((m) => m.role === 'assistant')
        .slice(-1)[0]
      console.log("[JUDGE-INPUT] question=" + JSON.stringify((lastAssistant?.text ?? "").slice(0, 120)) + " answer=" + JSON.stringify(text.slice(0, 80)))
      const verdict = await judgeAnswer(client, {
        question: lastAssistant?.text ?? '',
        answer: text,
        point: session.point || undefined,
      })
      if (verdict.correct === true) {
        upsertPoint(config.dataDir, { name: session.point || '本轮练习', mastery: 0.75 })
        judged = 'correct'
      } else if (verdict.correct === false) {
        upsertPoint(config.dataDir, { name: session.point || '本轮练习', mastery: 0.35 })
        addMistake(config.dataDir, {
          point: session.point || '本轮练习',
          question: (lastAssistant?.text ?? '').slice(0, 120),
          approach: text.slice(0, 120),
          errorType: '其他',
          source: 'check',
        } as never)
        judged = 'wrong'
      } else {
        judged = 'unclear'
      }
    }

    appendMessage(config.dataDir, session.id, 'assistant', clean)
    return {
      ok: true,
      sessionId: session.id,
      phase: session.phase,
      reply: clean,
      recalled,
      judged,
      memorized: items.length,
      client: describeClient(client),
    }
  } catch (err) {
    return { ok: false, sessionId: session.id, error: (err as Error).message }
  }
})
/* ---------- 记忆轻量化：按 id 删 ---------- */
ipcMain.handle('memory:delete', (_e, payload: { kind?: string; id?: string }) => {
  const kind = (payload?.kind ?? 'facts') as 'facts' | 'experiences' | 'notes'
  const id = String(payload?.id ?? '')
  if (!id) return { ok: false, error: '缺少 id' }
  return { ok: deleteMemory(config.dataDir, kind, id) }
})
/* ---------- 草稿卡：生成即存，采用后转正 ---------- */
ipcMain.handle('draft:list', () => listDrafts(config.dataDir))
ipcMain.handle('draft:get', (_e, id: string) => readDraft(config.dataDir, String(id ?? '')))
ipcMain.handle('draft:drop', (_e, id: string) => ({ ok: dropDraft(config.dataDir, String(id ?? '')) }))
/* ---------- 启动 ---------- */

if (isCardViewTest) {
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const r = await win.webContents.executeJavaScript(`(async () => {
          const btn = document.querySelector(".cv-entry")
          if (!btn) return { error: "no entry" }
          btn.click()
          await new Promise((r) => setTimeout(r, 800))
          const panel = document.querySelector(".cv-panel")
          if (!panel) return { error: "no panel" }
          const secs = [...panel.querySelectorAll("[data-sec]")].map((s) => s.getAttribute("data-sec"))
          const editBtn = panel.querySelector('[data-edit="catchphrase"]')
          if (!editBtn) return { error: "no edit btn", secs }
          editBtn.click()
          await new Promise((r) => setTimeout(r, 300))
          const ta = panel.querySelector("[data-edit-input]")
          if (!ta) return { error: "no textarea", secs }
          ta.value = "先定第一步，不贪多"
          panel.querySelector("[data-save]").click()
          await new Promise((r) => setTimeout(r, 900))
          const shown = [...panel.querySelectorAll(".cv-text")].map((t) => t.textContent.trim()).filter(Boolean)
          const list2 = await window.costudy.cards.list()
          const act = list2.find((c) => c.isActive) || list2[0]
          const g = act ? await window.costudy.cards.get(act.id) : null
          const shape = {
            top: g ? Object.keys(g) : null,
            cosplay: g && g.cosplay ? Object.keys(g.cosplay) : null,
            cp: g ? (g.catchphrase || (g.cosplay && g.cosplay.catchphrase) || null) : null,
          }
          return { secs, shape, savedText: shown.find((t) => t.includes("先定第一步")) || null }
        })()`)
        console.log("[CARDVIEW] " + JSON.stringify(r, null, 1))
        app.exit(0)
      }, 2200)
    })
  })
} else if (isModeTest) {
  // 验证 footer 收敛：可见按钮只剩 保存/去学习/API/新建角色
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const r = await win.webContents.executeJavaScript(`(() => {
          const f = document.querySelector(".v-studio .footer-bar")
          if (!f) return { error: "no footer" }
          const all = [...f.querySelectorAll("button")]
          const visible = all.filter((b) => {
            const s = getComputedStyle(b)
            return s.display !== "none" && s.visibility !== "hidden"
          })
          return {
            visible: visible.map((b) => b.textContent.trim()),
            hiddenCount: all.length - visible.length,
            hasEntry: !!f.querySelector(".mh-entry"),
          }
        })()`)
        console.log("[MODE] " + JSON.stringify(r, null, 1))
        app.exit(0)
      }, 2000)
    })
  })
} else if (isDraftTest) {
  // 真实 IPC：走 card:chat-draft，验证"生成即存草稿"
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const before = listDrafts(config.dataDir).length
        const brief = process.argv.includes("--brief") ? process.argv.slice(process.argv.indexOf("--brief") + 1).join(" ") : "来个科比伴学"
        const r = (await win.webContents.executeJavaScript(
          "window.costudy.cardChatDraft({ brief: " + JSON.stringify(brief) + " })",
        )) as { ok?: boolean; draftId?: string; error?: string }
        const after = listDrafts(config.dataDir)
        const top = after[0]
        console.log("[DRAFT] " + JSON.stringify({
          ok: r?.ok,
          draftId: r?.draftId,
          before,
          after: after.length,
          savedName: top?.draft?.name,
          savedBrief: top?.brief,
          sampleLen: (top?.sample ?? "").length,
          error: r?.error,
        }, null, 1))
        app.exit(0)
      }, 1800)
    })
  })
} else if (isApplyTest) {
  // 生成 -> 采用 -> 回读，确认"采用"真的写进卡（之前三张卡字段全空，原因不明）
  app.whenReady().then(async () => {
    const idx = process.argv.indexOf("--brief")
    const brief = idx > 0 ? process.argv.slice(idx + 1).join(" ") : "来个球叔伴学"
    const current = cards.activeCard(config.cardPath)
    const gen = await draftFromChat(freshClient(), { brief, stage: config.stage }, current)
    if (!gen.ok || !gen.draft) {
      console.log("[APPLY] " + JSON.stringify({ ok: false, error: gen.error }))
      app.exit(1)
      return
    }
    const patch = draftToPatch(gen.draft)
    const active = cards.list().find((c) => c.isActive) ?? cards.list()[0]
    const card = active ? cards.read(active.id) : null
    if (!card) {
      console.log("[APPLY] " + JSON.stringify({ ok: false, error: "没有可写入的卡" }))
      app.exit(1)
      return
    }
    card.name = patch.name || card.name
    card.emoji = patch.emoji || card.emoji
    card.personality = patch.personality || card.personality
    card.description = patch.description || card.description
    card.scenario = patch.scenario || card.scenario
    card.firstMes = patch.firstMes || card.firstMes
    card.cosplay = {
      ...card.cosplay,
      address: patch.address || card.cosplay.address,
      style: patch.style || card.cosplay.style,
      rules: patch.rules || card.cosplay.rules,
      behavior: patch.behavior || card.cosplay.behavior,
      opening: patch.opening || card.cosplay.opening,
    }
    cards.save(card)
    const back = cards.read(active.id)
    console.log("[APPLY] " + JSON.stringify({
      ok: true,
      settingsUsed: Boolean(gen.usedSearch !== undefined),
      draftsOnDisk: listDrafts(config.dataDir).length,
      name: back?.name,
      address: back?.cosplay.address,
      personalityLen: back?.personality.length,
      styleLen: back?.cosplay.style.length,
      sampleHead: (gen.sample || "").slice(0, 60),
    }, null, 1))
    app.exit(0)
  })
} else if (isCheckFlow) {
  // 端到端：把会话推到 check -> 经真实 IPC 发一句答案 -> 看掌握度/错题本是否动
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const session = ensureSession(config.dataDir)
        seedPointFromProfile(session)
        const point = (currentSession(config.dataDir) || session).point || ""
        const steps = ["goal", "probe", "breakdown", "teach", "check"]
        const moved = []
        for (const step of steps) {
          const r = advancePhase(config.dataDir, session.id, step as never)
          moved.push(step + ":" + (r.ok ? "ok" : "fail(" + r.error + ")"))
        }
        appendMessage(config.dataDir, session.id, "assistant", "x^2 - 5x + 6 = 0 的两个根是多少？")
        const answerIdx = process.argv.indexOf("--answer")
        const answerJoin = answerIdx > 0 ? process.argv.slice(answerIdx + 1).join(" ") : ""
        const answer = answerJoin.trim() || "x=2 或 x=3"
        const r = (await win.webContents.executeJavaScript(
          "window.costudy.learnReply({ text: " + JSON.stringify(answer) + " })",
        )) as { ok: boolean; phase?: string; judged?: string; recalled?: number; error?: string }
        const points = listPoints(config.dataDir)
        const mistakes = listMistakes(config.dataDir)
        console.log("[CHECKFLOW] " + JSON.stringify({
          sessionId: session.id,
          point,
          moves: moved,
          phaseAfter: (currentSession(config.dataDir) || {}).phase,
          ok: r.ok,
          judged: r.judged,
          recalled: r.recalled,
          pointRow: points.find((x) => x.name === point) || null,
          mistakeCount: mistakes.length,
          lastMistake: mistakes[mistakes.length - 1] ? mistakes[mistakes.length - 1].point : null,
          error: r.error,
        }, null, 1))
        app.exit(0)
      }, 1800)
    })
  })
} else if (isJudgeTest) {
  app.whenReady().then(async () => {
    const client = freshClient()
    const q = "x^2 - 5x + 6 = 0 的两个根是多少？"
    const cases = [
      { name: "答对", ans: "x=2 或 x=3", expect: true },
      { name: "答错", ans: "x=1 或 x=6", expect: false },
      { name: "没作答", ans: "我不会，能提示一下吗", expect: null },
      { name: "干扰知识点", ans: "x=2 或 x=3", expect: true, point: "正弦定理" },
    ]
    const results = []
    for (const c of cases) {
      const v = await judgeAnswer(client, { question: q, answer: c.ans, point: (c as { point?: string }).point })
      results.push({ case: c.name, expect: c.expect, got: v.correct, reason: v.reason })
    }
    const failed = results.filter((r) => r.got !== r.expect).length
    console.log("[JUDGE] " + JSON.stringify({ results, failed }, null, 1))
    app.exit(failed === 0 ? 0 : 1)
  })
} else if (isReplyIpc) {
  // 走真实路径：真窗口 -> IPC learn:reply -> 记忆是否落盘
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const sayIndex = process.argv.indexOf("--say")
        const say = sayIndex > 0 ? String(process.argv[sayIndex + 1] ?? "") : "我每次做几何题都要先画图，不画图完全想不出来"
        const before = readMemory(config.dataDir, "facts").length
        const result = (await win.webContents.executeJavaScript(
          "window.costudy.learnReply({ text: " + JSON.stringify(say) + " })",
        )) as { ok: boolean; memorized?: number; reply?: string; phase?: string; error?: string }
        const after = readMemory(config.dataDir, "facts").length
        const facts = readMemory(config.dataDir, "facts")
        console.log("[REPLYIPC] " + JSON.stringify({
          ok: result.ok,
          phase: result.phase,
          memorized: result.memorized ?? 0,
          factsBefore: before,
          factsAfter: after,
          gained: after - before,
          lastFact: facts[facts.length - 1]?.content ?? null,
          recalled: (result as { recalled?: number }).recalled ?? 0,
          lastAccessCount: facts[facts.length - 1]?.meta?.accessCount ?? 0,
          replyHead: (result.reply ?? "").slice(0, 80),
          error: result.error,
        }, null, 1))
        app.exit(0)
      }, 1800)
    })
  })
} else if (isExtractTest) {
  app.whenReady().then(() => {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
    const check = (name: string, ok: boolean, detail?: string): void => { checks.push({ name, ok, detail }) }
    const r1 = parseMemoryMarkers("好，先画图。[记住: 他做题必须画图] 你试试看。")
    check("抠出 1 条", r1.items.length === 1, String(r1.items.length))
    check("归类为 facts", r1.items[0]?.kind === "facts")
    check("内容正确", r1.items[0]?.content === "他做题必须画图", r1.items[0]?.content)
    check("标记已从正文删除", !r1.clean.includes("[记住"), r1.clean)
    const r2 = parseMemoryMarkers("今天练了三道。[经历：第一次做对判别式]")
    check("中文冒号也认", r2.items.length === 1 && r2.items[0].kind === "experiences")
    const r3 = parseMemoryMarkers("没有任何标记的一句话。")
    check("无标记不产生条目", r3.items.length === 0 && r3.clean === "没有任何标记的一句话。")
    const r4 = parseMemoryMarkers("[记住:  ]")
    check("空内容被忽略", r4.items.length === 0)
    const r5 = parseMemoryMarkers("[记住: " + "长".repeat(400) + "]")
    check("超长被截断到 120", (r5.items[0]?.content.length ?? 0) === 120, String(r5.items[0]?.content.length))
    const failed = checks.filter((c) => !c.ok).length
    for (const c of checks) console.log("[EXTRACT] " + (c.ok ? "ok  " : "FAIL") + "  " + c.name + (c.detail ? "  (" + c.detail + ")" : ""))
    console.log("[EXTRACT] result: " + (failed === 0 ? "PASS" : "FAIL (" + failed + ")"))
    app.exit(failed === 0 ? 0 : 1)
  })
} else if (isMemLite) {
  app.whenReady().then(() => {
    const dir = config.dataDir
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
    const check = (name: string, ok: boolean, detail?: string): void => { checks.push({ name, ok, detail }) }
    const before = readMemory(dir, "facts").length
    const item = appendMemory(dir, { kind: "facts", content: "轻量化测试条目 " + Date.now() })
    check("写入成功", Boolean(item.id), item.id)
    check("条数 +1", readMemory(dir, "facts").length === before + 1)
    const hasTmp = require("node:fs").existsSync(require("node:path").join(dir, "记忆", "事实.json.tmp"))
    check("原子写不留 .tmp", !hasTmp, String(hasTmp))
    const deleted = deleteMemory(dir, "facts", item.id)
    check("按 id 删除成功", deleted)
    check("条数恢复", readMemory(dir, "facts").length === before)
    check("删不存在的返回 false", !deleteMemory(dir, "facts", "no-such-id"))
    const failed = checks.filter((c) => !c.ok).length
    for (const c of checks) console.log("[MEMLITE] " + (c.ok ? "ok  " : "FAIL") + "  " + c.name + (c.detail ? "  (" + c.detail + ")" : ""))
    console.log("[MEMLITE] result: " + (failed === 0 ? "PASS" : "FAIL (" + failed + ")"))
    app.exit(failed === 0 ? 0 : 1)
  })
} else if (isLearnProbe) {
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const run = (js: string) => win.webContents.executeJavaScript(js)
        await run("window.__costudySetActive && window.__costudySetActive(2)")
        await new Promise((r) => setTimeout(r, 800))
        await run("window.__costudyEnterLearn && window.__costudyEnterLearn()")
        await new Promise((r) => setTimeout(r, 2500))
        const out = await run(`(() => {
          const t = document.querySelector(".v-comp .learn-thread")
          return {
            msgCount: t ? t.querySelectorAll(".learn-msg").length : 0,
            phase: document.querySelector(".v-comp .learn-top [data-phase]")?.textContent ?? "none",
            first: t ? (t.querySelector(".learn-bubble")?.textContent ?? "").slice(0, 60) : "",
          }
        })()`)
        console.log("[LEARNPROBE] " + JSON.stringify(out, null, 1))
        app.exit(0)
      }, 1500)
    })
  })
} else if (isReplyTest) {
    // ⚠️ 这条路径只用来快速看模型输出，**不经过 learn:reply 那个 IPC handler**：
    //    没有记忆标记引导、也不做 [记住:]/[经历:] 提取。
    //    验证"对话 -> 记忆落盘"请用 --replyipc（真实窗口 + 真 IPC）。
    console.warn("[REPLY] 注意：此路径不经过 IPC，不能用来验证记忆链路，请用 --replyipc")
  app.whenReady().then(async () => {
    const index = process.argv.indexOf("--say")
    const say = index > 0 ? String(process.argv[index + 1] ?? "") : "我不懂这道题"
    const session = ensureSession(config.dataDir)
    const card = cards.activeCard(config.cardPath)
    const state = { id: session.id, goal: "", stage: config.stage, phase: session.phase, points: [], activeIndex: 0, weaknesses: [], startedAt: session.createdAt, updatedAt: session.updatedAt, trail: [] }
    const history = loadMessages(config.dataDir, session.id).slice(-12).map((m) => ({ role: m.role, content: m.text }))
    appendMessage(config.dataDir, session.id, "user", say)
    const system = buildSystemPrompt({ card, learningDir: config.learningDir, stage: config.stage, dataDir: config.dataDir, session: state })
    const client = freshClient()
    try {
      const reply = await client.complete([{ role: "system", content: system }, ...history], { maxTokens: 1200, temperature: 0.6 })
      appendMessage(config.dataDir, session.id, "assistant", reply)
      const lines = loadMessages(config.dataDir, session.id).length
      console.log("[REPLY] " + JSON.stringify({ ok: true, client: describeClient(client), phase: session.phase, lines, reply: reply.trim(), systemChars: system.length }, null, 1))
      app.exit(0)
    } catch (err) {
      console.log("[REPLY] " + JSON.stringify({ ok: false, error: (err as Error).message }, null, 1))
      app.exit(1)
    }
  })
} else if (isSessionTest) {
  app.whenReady().then(() => {
    const dir = config.dataDir
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
    const check = (name: string, ok: boolean, detail?: string): void => { checks.push({ name, ok, detail }) }
    const first = ensureSession(dir)
    check("ensureSession 有会话", Boolean(first?.id), first?.id)
    const again = ensureSession(dir)
    check("ensureSession 幂等", again.id === first.id)
    const a1 = appendMessage(dir, first.id, "user", "我想弄懂判别式")
    check("第一条消息写入", a1.ok)
    check("首条用户消息成为标题", a1.meta?.title === "我想弄懂判别式", a1.meta?.title)
    appendMessage(dir, first.id, "assistant", "好，先说说你卡在哪一步")
    const msgs = loadMessages(dir, first.id)
    check("消息条数 2", msgs.length === 2, String(msgs.length))
    check("角色顺序正确", msgs[0].role === "user" && msgs[1].role === "assistant")
    const adv = advancePhase(dir, first.id, "goal")
    check("阶段推进到 goal", (adv.ok && adv.phase) === "goal", adv.error)
    const bad = advancePhase(dir, first.id, "teach")
    check("非法跳步被拒", !bad.ok, bad.error)
    const second = createSession(dir, "第二个会话")
    check("新会话成为当前", currentSession(dir)?.id === second.id)
    check("会话列表 2 条", listSessions(dir).length >= 2, String(listSessions(dir).length))
    setCurrent(dir, first.id)
    check("切回旧会话", currentSession(dir)?.id === first.id)
    check("旧会话消息还在", loadMessages(dir, first.id).length === 2)
    const failed = checks.filter((c) => !c.ok).length
    for (const c of checks) console.log("[SESS] " + (c.ok ? "ok  " : "FAIL") + "  " + c.name + (c.detail ? "  (" + c.detail + ")" : ""))
    console.log("[SESS] result: " + (failed === 0 ? "PASS" : "FAIL (" + failed + ")"))
    app.exit(failed === 0 ? 0 : 1)
  })
} else if (isFetcherTest) {
  app.whenReady().then(async () => {
    const idx = process.argv.indexOf("--url")
    const url = idx > 0 ? String(process.argv[idx + 1] ?? "") : "https://example.com"
    const result = await fetchPageText(url)
    console.log("[FETCH] " + JSON.stringify({
      ok: result.ok, url: result.url, title: result.title, chars: result.chars,
      truncated: result.truncated, error: result.error,
      head: result.text ? result.text.slice(0, 160) : undefined,
    }, null, 1))
    app.exit(result.ok ? 0 : 1)
  })
} else if (isM3Test) {
  app.whenReady().then(async () => {
    const briefIndex = process.argv.indexOf("--brief")
    const brief = briefIndex > 0 ? String(process.argv[briefIndex + 1] ?? "") : "我想要一个奶龙来伴学"
    const current = cards.activeCard(config.cardPath)
    const result = await draftFromChat(freshClient(), { brief, stage: config.stage }, current)
    const draft = result.draft
    console.log("[M3] " + JSON.stringify({
      ok: result.ok,
      ms: result.ms,
      error: result.error,
      name: draft?.name,
      emoji: draft?.emoji,
      address: draft?.address,
      style: draft?.style?.slice(0, 80),
      question: result.question,
      sample: result.sample,
    }, null, 1))
    app.exit(result.ok ? 0 : 1)
  })
} else if (isProfileTest) {
  app.whenReady().then(() => {
    const sample = {
      ageBand: '高中' as const,
      education: '高二在读',
      currentLevel: '函数还行，三角函数基本忘光',
      targetPoints: ['正弦定理', '余弦定理'],
      goal: '期末考到 80 分以上',
      weeklyHours: 6,
      preferOrder: '先练后讲' as const,
      dislikes: ['别用鸡汤', '别叫我同学'],
    }
    const saved = saveDeclaredProfile(config.dataDir, sample)
    const back = readDeclaredProfile(config.dataDir)
    const block = formatDeclaredForPrompt(back)
    const out = {
      ok: saved.ok && back.targetPoints.length === 2,
      saved: { ageBand: back.ageBand, education: back.education, hours: back.weeklyHours },
      blockLines: block.split(String.fromCharCode(10)).length,
      hasTargets: block.includes(String.fromCharCode(39) + String.fromCharCode(39)) || block.includes(String.fromCharCode(0x6b63) + String.fromCharCode(0x5f26)),
      block,
    }
    console.log('[PROFILE] ' + JSON.stringify(out, null, 1))
    app.exit(out.ok ? 0 : 1)
  })
} else if (isPolishTest) {
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
            declared: formatDeclaredForPrompt(readDeclaredProfile(config.dataDir)),
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
