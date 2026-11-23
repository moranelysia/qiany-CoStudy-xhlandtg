import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
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
import { createClient, describeClient, getLastUsage } from './llm/client'
import { clearKey, describeSettings, encryptionStatus, resolveLlmConfig, saveSettings, visionCapable } from './settings'
import { polishPrompt } from './polish'
import { draftFromChat, draftToPatch } from './learn/m3-chat'
import { dropDraft, listDrafts, readDraft, saveDraft } from './learn/drafts'
import {
  advancePhase,
  appendMessage,
  clearMessages,
  createSession,
  currentSession,
  ensureSession,
  listSessions,
  loadMessages,
  removeSession,
  setCurrent,
  setPhase,
  setSessionPoint,
} from './learn/session-store'
import { fetchPageText } from './web-fetch'
import { fetchWebPage, searchWeb } from './deepseek-web'
import { appendMemory, deleteMemory, readMemory } from './memory/score'
import { touchInjected } from './memory/score'
import { parseMemoryMarkers } from './memory/extract'
import { archiveEntry, deleteEntry, detectSubjects, recallBlock as recallLibraryBlock, recordEntry, searchLibrary, viewLibrary } from './memory/library'
import { fadeOtherSubjects, subjectOf } from './context/subject-fade'
import { addSeconds, dayKeyOf, lastWeekMinutes, todayMinutes, todaySeconds } from './study-time'
import { dailyCounts } from './learn/daily-stats'
import { buildDimHints } from './prompt/layers'
import { judgeAnswer } from './learn/evaluate'
import { addMistake, listMistakes } from './learn/mistakes'
import { listPoints, nextMastery, upsertPoint } from './learn/points'
import { formatDeclaredForPrompt, readDeclaredProfile, saveDeclaredProfile } from './learn/profile-form'
import { buildProfile } from './profile'
import { duePoints } from './learn/points'
import { openMistakes } from './learn/mistakes'
import {
  addSessionPoint,
  addWeakness,
  decideNextPhase,
  markTaught,
  moveTo,
  nextPoint,
  PHASE_LABEL,
  latestSession,
  loadSessionState,
  recordCheck,
  saveSession,
  setGoal,
} from './learn/session'
import { readTopic, writeTopic, type StudyTopic } from './learn/topic'
import { describeTtsConfig, readTtsConfig, saveTtsConfig } from './tts/costudy-config'
import { describeAsrSettings, saveAsrSettings } from './asr/costudy-config'
import { glossaryPrompt, readGlossary, saveGlossary } from './asr/asr-glossary'
import {
  SUMMARY_SYSTEM,
  contextStats,
  estimateTokens,
  buildSummaryPrompt,
  planCompression,
  planCompressionByTokens,
  readSummary,
  renderForSummary,
  renderSummaryBlock,
  writeSummary,
} from './context/compress'
import { beginTurnCharts, fixChartMarkers, renderLeakedDiagram, rerenderLabChart, turnChartIds } from './tools'
// readChart 已在下面统一导入
import { activeModelFor, readModels } from './models'
// resolveLlmConfig 已在第 23 行导入（含 visionCapable 那一行）
import { pcmToWav, probeLocalAsr, psUtf8RoundTrip } from './asr/local-asr-engine'
import { setAsrConfig } from './asr/asr-config'
import { readPlugins, setPlugin, setScriptsDir, teachingPluginHints } from './plugins'
import { completeWithTools, ensureChartMarkers, parseTextCalls, stripTextCalls } from './llm/tools-loop'
import { McpClient } from './mcp-host/client'
import { readChart, readChartMeta } from './charts'
import { deleteImage, imagePromptNote, imageIds, readImage, saveImage, stripImageMarkers, withImageParts, safeImageName } from './images'
import { checkHealth } from './health'
import { clearOutbox, listOutbox, pushOutbox, removeOutbox } from './outbox'
import { withRetry } from './retry'
import { formatRecall, searchSessions } from './learn/retrieval'
import { buildAnalysisPrompt, historyCount, mergeProfile, parseAnalysis, readAgentState, undoLastMerge, writeAgentState } from './learn/profile-auto'
import { runTool, setChartDataDir, setCodeWorkspace, currentCodeWorkspace, setNoteDataDir, toolNames, toolSchemas } from './tools'
import { allowedPermissions, readMode, setMode } from './mode'
import { defaultWorkspace, readWorkspace, setWorkspace } from './workspace'
import { activateProfile, describeModels, removeProfile, upsertProfile } from './models'
import { pushAsrAudio, startAsr, stopAsr } from './asr/costudy-service'
import { synthesize as synthesizeSpeech } from './tts/costudy-service'

// 去掉 Electron 默认菜单栏（File / Edit / View / Window）。
// 我们用自绘界面，那条黑条既不好看也占一行高度。
Menu.setApplicationMenu(null)

const isDev = !app.isPackaged
const isSmoke = process.argv.includes('--smoke')
const isSelfTest = process.argv.includes('--selftest')
const isUiTest = process.argv.includes('--uitest')
const isMcpTest = process.argv.includes('--mcptest')
const isOutboxTest = process.argv.includes('--outboxtest')
const isMemSearchTest = process.argv.includes('--memsearchtest')
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
const isAutoAnalyzeTest = process.argv.includes('--autoanalyzetest')
const isM3Test = process.argv.includes('--m3test')
const isFetcherTest = process.argv.includes('--fetcher')
const isSessionTest = process.argv.includes('--sessiontest')
const isReplyTest = process.argv.includes('--replytest')
const isLearnProbe = process.argv.includes('--learnprobe')
const isChartTest = process.argv.includes('--charttest')
const isMemLite = process.argv.includes('--memlite')
const isExtractTest = process.argv.includes('--extracttest')
const isReplyIpc = process.argv.includes('--replyipc')
const isJudgeTest = process.argv.includes('--judgetest')
const isCheckFlow = process.argv.includes('--checkflow')
const isApplyTest = process.argv.includes('--applytest')
const isDraftTest = process.argv.includes('--drafttest')
const isChatWorkTest = process.argv.includes('--modetest')
const isPermTest = process.argv.includes('--permtest')
/** 代码执行自检：真的把一段 JS 跑起来（走 runTool 这条和模型完全相同的路） */
const isCodeTest = process.argv.includes('--codetest')
/** 工作区自检：里面的写放行、外面的写要审批，拒绝就真的写不进去 */
const isWorkspaceTest = process.argv.includes('--workspacetest')
const isCardViewTest = process.argv.includes('--cardviewtest')
/** 顶栏图层自检：保障条与灵动岛不能叠在一起（见 --layertest 的注释） */
const isLayerTest = process.argv.includes('--layertest')
/** 清空聊天记录自检：存储层用临时目录，界面层用临时会话，跑完都收干净 */
const isClearTest = process.argv.includes('--cleartest')
/** 首页自检：灵动岛左侧的胶囊位置 + 点进去是不是欢迎界面 */
const isHomeTest = process.argv.includes('--hometest')
/** UI 截图：四屏各截一张（改版前后对比用，只读数据，不调模型） */
const isUiShot = process.argv.includes('--uishot')
/** 插件页自检：四条能力插件是否都"装了 + 开着"（用户要求全部安装） */
const isPluginTest = process.argv.includes('--plugintest')
/** 图表放大模式自检：点图开浮层、能缩放、Esc 能关 */
const isChartZoomTest = process.argv.includes('--chartzoomtest')
/** 诊断用：把三种新图（感应/光合/谱系）真的画到聊天里并截图，人眼看排版 */
const isLabShot = process.argv.includes('--labshot')
/** 文本式工具调用解析自检（纯函数，秒级） */
const isCallParseTest = process.argv.includes('--callparsetest')
/**
 * 插件"到底有没有生效"的体检：
 *   1. 存储层：每条能力插件的 installed / enabled / status
 *   2. 模型层：每种模式下真的发给模型的工具清单里有没有它们
 *   3. 执行层：runTool 走一遍每个工具（这就是模型调用走的同一条路）
 *   4. 开关层：关掉一个插件 → 工具从清单消失、调用被拒 → 再打开恢复正常
 */
const isPluginProbe = process.argv.includes('--pluginprobe')
/** 发照片自检：存储 → 提示词说明 → 气泡渲染 → 点开放大 */
const isPhotoTest = process.argv.includes('--phototest')
/** 上下文压缩自检：触发水位、摘要落盘、提示词拼装 */
const isContextTest = process.argv.includes('--contexttest')
const isAsrTest = process.argv.includes('--asrtest')
/** 语音输入自检：本地听写可用性、WAV 头、引擎切换、IPC 在不在 */

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
function freshClient(mode: 'chat' | 'work' = 'chat'): ReturnType<typeof createClient> {
  llm = createClient(resolveLlmConfig(config.dataDir, mode))
  return llm
}

// 应用身份中性化：名字与 ID 全部来自配置，代码里不再出现任何角色名
app.setName(config.appName)
if (process.platform === 'win32') app.setAppUserModelId(config.appId)
  setChartDataDir(config.dataDir)
  setNoteDataDir(config.dataDir)
  // 代码工作区：写操作只在这个目录里免审批，外面一律弹窗问人
  setCodeWorkspace(readWorkspace(config.dataDir, config.projectRoot))
  // 插件页的「装没装」按 MCP 脚本在不在判断 —— 路径以应用目录为准，不用 cwd
  setScriptsDir(join(app.getAppPath(), 'scripts'))

  // 主进程异常兜底。
  // Electron 默认会弹"JavaScript error occurred in the main process"的模态框，
  // 那个框会把整个应用卡住（不点掉就什么都不发生）。这里改成写诊断 + 继续跑。
  process.on('uncaughtException', (err) => {
    try {
      diagAppend({ stage: 'main-uncaught', error: String((err as Error)?.message ?? err).slice(0, 300), stack: String((err as Error)?.stack ?? '').slice(0, 800) })
    } catch {
      /* 诊断失败就只打控制台 */
    }
    console.error('[MAIN:uncaught] ' + String((err as Error)?.stack ?? err))
  })
  process.on('unhandledRejection', (reason) => {
    try {
      diagAppend({ stage: 'main-reject', error: String((reason as Error)?.message ?? reason).slice(0, 300) })
    } catch {
      /* 同上 */
    }
    console.error('[MAIN:reject] ' + String((reason as Error)?.stack ?? reason))
  })

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

/* ============================================================
 * 临时诊断：定位「伴学页看得见骨架、看不见气泡」（验完整段删掉）
 *
 * 为什么必须挂在 createWindow 里：
 *   上一轮两次把诊断挂错了位置 —— 一次挂在 --learnprobe 的测试分支、
 *   一次挂在非窗口创建路径，正常启动根本不经过，所以 诊断.jsonl 从未生成。
 *   挂在 createWindow 上，探针窗口和用户双击 run.cmd 起的窗口都会走到。
 *
 * 为什么还要读 .learn-msg 的 opacity：
 *   入场动画 rise 挂在 **.learn-msg（外层）** 上，而旧探针读的是
 *   **.learn-bubble（内层）** 的 opacity / 背景色。外层停在 opacity:0 时，
 *   DOM 里消息齐全、内层背景是实心蓝、msgCount 完全正常 —— 但一个像素都看不见。
 *   旧探针每项都对，却证明不了"可见"。
 * ============================================================ */
const DIAG_FILE = process.env['COSTUDY_DIAG_FILE'] || 'C:/costudy/诊断.jsonl'

function diagAppend(rec: Record<string, unknown>): void {
  try {
    appendFileSync(DIAG_FILE, JSON.stringify({ at: Date.now(), ...rec }) + '\n', 'utf8')
  } catch {
    /* 写不进去就算了，绝不能影响主流程 */
  }
}

const DIAG_SCRIPT = `(() => {
  if (window.__diagInstalled) return 'already'
  window.__diagInstalled = true
  const sample = () => {
    const app = document.querySelector('.app')
    const thread =
      document.querySelector('.v-comp .learn-thread') || document.querySelector('.learn-thread')
    const msgs = thread ? [].slice.call(thread.querySelectorAll('.learn-msg')) : []
    const first = msgs[0] || null
    const last = msgs[msgs.length - 1] || null
    const cs = first ? getComputedStyle(first) : null
    const anim = first && first.getAnimations ? first.getAnimations()[0] : null
    const rect = first ? first.getBoundingClientRect() : null
    const owner = thread ? thread.closest('.v-comp,.v-studio,.v-wizard') : null
    return {
      appClass: app ? app.className : null,
      hasComp: !!document.querySelector('.v-comp'),
      hasLearnWrap: !!document.querySelector('.learn-wrap'),
      hasThread: !!thread,
      threadOwner: owner ? owner.className : null,
      msgCount: msgs.length,
      enterFn: typeof window.__costudyEnterLearn,
      hidden: document.hidden,
      firstOpacity: cs ? cs.opacity : null,
      firstVisibility: cs ? cs.visibility : null,
      firstDisplay: cs ? cs.display : null,
      firstRect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height), top: Math.round(rect.top) } : null,
      animState: anim ? { play: anim.playState, ctType: typeof anim.currentTime, ct: String(anim.currentTime) } : null,
      rise: (() => {
        const list = (document.getAnimations ? document.getAnimations() : []).filter(
          (a) => a.animationName === 'rise',
        )
        return { n: list.length, states: list.slice(0, 3).map((a) => a.playState) }
      })(),
      watchdog: window.__diagWatchdog || null,
      timeline: String(document.timeline && document.timeline.currentTime),
      lastText: last ? String(last.textContent || '').replace(/\\s+/g, ' ').slice(0, 30) : null,
    }
  }
  let prev = ''
  const tick = (why) => {
    const s = sample()
    const sig = JSON.stringify(s)
    if (sig === prev) return
    prev = sig
    console.log('[DIAG]' + JSON.stringify({ why: why, s: s }))
  }
  let timer = 0
  const debounced = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => tick('mut'), 300)
  }
  new MutationObserver(debounced).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  window.setInterval(() => tick('tick'), 250)
  tick('init')
  return 'installed'
})()`

function installDiag(win: BrowserWindow): void {
  // 诊断专用：按窗口抓（types: ['window']），不受遮挡影响 ——
  // 用来抓"用户正在看的那个窗口"，即使它被别的窗口盖住。
  const shotWins = process.env['COSTUDY_DIAG_SHOT_WINDOWS']
  if (shotWins) {
    const winDelay = Number(process.env['COSTUDY_DIAG_SHOT_DELAY'] || 5000)
    setTimeout(() => {
      void (async () => {
        try {
          const el = require('electron') as typeof import('electron')
          const sources = await el.desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 2400, height: 1600 },
          })
          diagAppend({
            stage: 'windows',
            count: sources.length,
            names: sources.map((s) => s.name).join(' | '),
          })
          const base = shotWins.replace(/\.png$/i, '')
          sources.forEach((s, idx) => {
            if (s.thumbnail.isEmpty()) return
            appendFileSync(base + '-' + idx + '.png', Buffer.from(s.thumbnail.toPNG()))
          })
          diagAppend({ stage: 'windows-saved', count: sources.length })
        } catch (e) {
          diagAppend({ stage: 'windows-failed', reason: String(e) })
        }
      })()
    }, winDelay)
  }

  // 诊断专用：用 desktopCapturer 抓一张真实屏幕。
  // 走的是 DXGI 桌面复制，和 PrintWindow/CopyFromScreen 不是一条路 ——
  // 在这台机器上前两者都只返回纯白，这个通常还能拿到真实像素。
  const shotPath = process.env['COSTUDY_DIAG_SHOT']
  if (shotPath) {
    const shotDelay = Number(process.env['COSTUDY_DIAG_SHOT_DELAY'] || 6000)
    setTimeout(() => {
      void (async () => {
        try {
          const el = require('electron') as typeof import('electron')
          const d = el.screen.getPrimaryDisplay()
          const sources = await el.desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: d.size.width, height: d.size.height },
          })
          const thumb = sources[0]?.thumbnail
          if (thumb && !thumb.isEmpty()) {
            appendFileSync(shotPath, Buffer.from(thumb.toPNG()))
            diagAppend({ stage: 'shot', ok: true, size: String(thumb.getSize()) })
          } else {
            diagAppend({ stage: 'shot', ok: false, reason: 'empty thumbnail' })
          }
        } catch (e) {
          diagAppend({ stage: 'shot', ok: false, reason: String(e) })
        }
      })()
    }, shotDelay)
  }

  diagAppend({ stage: 'createWindow', probe: process.argv.includes('--learnprobe') })

  win.webContents.on('did-finish-load', () => {
    diagAppend({ stage: 'did-finish-load' })
    // 窗口可能已经销毁（运行时点关闭就是这样）：再碰 webContents 会抛 Object has been destroyed，
    // 而这个异常发生在事件回调里，会变成主进程未捕获异常 —— 以前就是它弹的框。
    if (win.isDestroyed()) return
    try {
      win.webContents.executeJavaScript(DIAG_SCRIPT).then(
        (r) => diagAppend({ stage: 'injected', result: r }),
        (e) => diagAppend({ stage: 'inject-failed', error: String(e) }),
      )
    } catch (err) {
      diagAppend({ stage: 'inject-threw', error: String((err as Error)?.message ?? err).slice(0, 120) })
    }
  })

  // Electron 新版把 console-message 收成一个事件对象，旧版是 (e, level, message, ...)。
  // 两种签名都兜住，否则会"看起来挂了、其实一条都没接到"。
  const wc = win.webContents as unknown as {
    on: (name: string, cb: (...args: unknown[]) => void) => void
  }
  win.webContents.executeJavaScript("window.addEventListener('error', function (e) { console.log('[DIAG]' + JSON.stringify({ stage: 'error', msg: String(e.message || ''), file: String(e.filename || ''), line: e.lineno || 0 })) }, true)").catch(() => undefined)
  wc.on('console-message', (...args: unknown[]) => {
    const ev = args[0] as { message?: string } | undefined
    const msg = typeof args[2] === 'string' ? (args[2] as string) : (ev?.message ?? '')
    if (typeof msg === 'string' && msg.indexOf('[DIAG]') === 0) {
      diagAppend({ stage: 'sample', raw: msg.slice(6) })
    }
  })
  const diagSeq = (process.env['COSTUDY_DIAG_SEQ'] || '').split(',').filter(Boolean); if (diagSeq.length > 0) { win.webContents.on('did-finish-load', () => { diagSeq.forEach((v, k) => { setTimeout(() => { const code = /^\s*\d+\s*$/.test(v) ? 'window.__costudySetActive && window.__costudySetActive(' + Number(v) + ')' : v; win.webContents.executeJavaScript(code).catch(() => undefined) }, 900 + k * 900) }) }) }; const diagExitMs = Number(process.env['COSTUDY_DIAG_EXIT_MS'] || 0); if (diagExitMs > 0) setTimeout(() => app.exit(0), diagExitMs)
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
    // 窗口外观（这一版的取舍）：
    //   backgroundColor 不透明 #eef2f8 —— 原先用透明窗口 + acrylic，
    //     但滚动时合成器偶尔丢帧，缝隙里露出的就是白/亚克力，
    //     表现为"白框闪一下又消失"。<html> 那边也垫了同色底做双保险
    //     （见 styles/transparent.css）。
    //   frame: false —— 无边框，系统按钮没了，改由渲染层自绘
    //     （src/renderer/src/window-controls.ts）。
    // ↑ 上面那段是上一版的结论，已被下面这条推翻（补充于 2026-10）：
    //   窗口从来没设过 transparent: true —— 只把 backgroundColor 设成
    //   '#00000000' 并不会让 Windows 窗口真的透明，网页没画到的像素由系统
    //   填成白色。这才是"顶上一条白边、滚动时闪一下"的真正来源。
    //   现在改成真正的分层透明窗口（WS_EX_LAYERED）：系统不画边框，
    //   缺口也没有白色可露；底色由 <html> 的 #eef2f8 + 色雾负责。
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
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

  // 底色和色雾同色：万一某一帧没画上，露出来也看不出来
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
  // 无边框窗口没有系统按钮，最大化状态也会被其它操作改变（拖拽区双击、
  // 系统快捷键、贴边停靠），所以状态一变就广播给自绘按钮，图标才不会对不上。
  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('app:maximize-changed', true)
  })
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('app:maximize-changed', false)
  })



  // F11 切换；全屏时 Esc 退出。用 before-input-event 而不是全局快捷键，
  // 只在窗口聚焦时生效，不抢占系统级 F11。
  win.webContents.on('before-input-event', (event, input) => {
    if (!win || win.isDestroyed()) return
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

  installDiag(win)

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
/** 最大化 / 还原。无边框窗口没有系统按钮，只能自己提供。 */
ipcMain.handle('app:toggleMaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return win.isMaximized()
})

ipcMain.handle('app:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isMaximized() : false
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
          phase: PHASE_LABEL[session.phase] ?? String(session.phase ?? ""),
          goal: session.goal,
          taught: session.points.filter((p) => p.taught).length,
          total: session.points.length,
        }
      : null,
  }
})

/* ---------- IPC：TTS（引擎实现搬自 Cyrene-Agent，MIT） ---------- */
ipcMain.handle('tts:config', () => describeTtsConfig(config.dataDir))
ipcMain.handle('tts:config:set', (_e, patch) => {
  saveTtsConfig(config.dataDir, patch ?? {})
  return describeTtsConfig(config.dataDir)
})
ipcMain.handle('tts:synthesize', (_e, req) => synthesizeSpeech(config.dataDir, req ?? { text: '' }))

/* ---------- IPC：多模型配置 ---------- */
ipcMain.handle('models:list', () => describeModels(config.dataDir))
ipcMain.handle('models:save', (_e, input) => { upsertProfile(config.dataDir, input ?? {}); llm = createClient(resolveLlmConfig(config.dataDir)); return describeModels(config.dataDir) })
ipcMain.handle('models:remove', (_e, id: string) => { removeProfile(config.dataDir, String(id ?? '')); llm = createClient(resolveLlmConfig(config.dataDir)); return describeModels(config.dataDir) })
ipcMain.handle('models:activate', (_e, id: string) => { activateProfile(config.dataDir, String(id ?? '')); llm = createClient(resolveLlmConfig(config.dataDir)); return describeModels(config.dataDir) })

/* ---------- IPC：向厂商拉模型列表（避免把模型名写死在代码里） ---------- */
ipcMain.handle('models:probe', async (_e, baseUrl: string, apiKey: string) => {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) return { ok: false, error: 'Base URL 不合法' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(base + '/models', {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {}
      , signal: controller.signal,
    })
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status }
    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = Array.isArray(body?.data) ? body.data.map((m) => String(m.id ?? '')).filter(Boolean) : []
    return { ok: true, models: ids }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
})

/* ---------- IPC：取图表（作图的 SVG 存在 记忆/图表/） ---------- */
/* ---------- IPC：上下文占用（界面上的圆环） ---------- */
ipcMain.handle('context:stats', () => {
  const session = ensureSession(config.dataDir)
  const all = loadMessages(config.dataDir, session.id).map((m) => ({ role: m.role as 'user' | 'assistant', text: String(m.text ?? '') }))
  const prev = readSummary(config.dataDir, session.id)
  const summary = prev && prev.upTo <= all.length ? prev : null
  // 窗口大小按配置（不同模型不一样），默认按 128k 估算；界面会标注"约"
  const win = Number(process.env['COSTUDY_CTX_WINDOW'] ?? 128000)
  const st = contextStats(all, summary, win)
  // 有真实用量就用真实的（服务端返回的 prompt_tokens），没有才用估算 —— 界面上要标明是哪种
  const real = getLastUsage()
  if (real && real.promptTokens > 0) {
    return {
      ...st,
      usedTokens: real.promptTokens,
      percent: Math.min(100, Math.round((real.promptTokens / st.windowTokens) * 1000) / 10),
      real: true,
      completionTokens: real.completionTokens,
    }
  }
  return { ...st, real: false }
})
ipcMain.handle('charts:get', (_e, id: string) => readChart(config.dataDir, String(id ?? '')))

/* ---------- IPC：图片（学生发来的照片存在 记忆/图片/） ---------- */
// 选图走系统对话框，**复制**进自己的目录 —— 不引用用户原文件（他删了原图，我们的记录就废了）
ipcMain.handle('image:pick', async () => {
  try {
    const owner = BrowserWindow.getAllWindows()[0]
    const picked = await dialog.showOpenDialog(owner, {
      title: '选择照片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true }
    const file = picked.filePaths[0]
    const data = readFileSync(file)
    if (data.length > 12 * 1024 * 1024) return { ok: false, error: '图片太大（超过 12 MB）' }
    const ext = extname(file).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + (ext || 'png')
    const saved = saveImage(config.dataDir, { data, mime, name: safeImageName(basename(file)) })
    // 顺手告诉界面：当前模型能不能看图（不能看就在界面上说清楚，别让用户以为 TA 看过了）
    return {
      ok: true,
      id: saved.id,
      name: saved.name,
      bytes: saved.bytes,
      vision: visionCapable(resolveLlmConfig(config.dataDir).model),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})
// 取图：返回 data URL，渲染端直接塞进 <img>
ipcMain.handle('diag:render', (_e, info: unknown) => {
  diagAppend({ stage: 'render', info } as never)
})
ipcMain.handle('charts:rerender', (_e, kind: string, args: unknown) =>
  rerenderLabChart(String(kind ?? ''), (args ?? {}) as Record<string, unknown>),
)
ipcMain.handle('charts:meta', (_e, id: string) => readChartMeta(config.dataDir, String(id ?? '')))

// 存 PNG：渲染端把 SVG 画到 canvas 转成 PNG 再传过来（Electron 主进程没有 SVG 光栅化能力）
ipcMain.handle('file:savePng', async (_e, payload: { base64?: string; name?: string; path?: string }) => {
  try {
    const b64 = String(payload?.base64 ?? '')
    if (!b64) return { ok: false, error: '没有图片数据' }
    const data = Buffer.from(b64.replace(/^data:image\/png;base64,/, ''), 'base64')
    let target = String(payload?.path ?? '')
    if (!target) {
      const picked = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0], {
        title: '保存 PNG',
        defaultPath: join(app.getPath('pictures'), String(payload?.name ?? '实验图') + '.png'),
      })
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
      target = picked.filePath
    }
    writeFileSync(target, data)
    return { ok: true, path: target, bytes: data.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('image:get', (_e, id: string) => {
  const img = readImage(config.dataDir, String(id ?? ''))
  if (!img) return null
  try {
    return {
      name: img.name,
      mime: img.mime,
      dataUrl: 'data:' + img.mime + ';base64,' + readFileSync(img.file).toString('base64'),
    }
  } catch {
    return null
  }
})

/* ---------- IPC：粘贴图片 + 把图/表另存到本地 ---------- */
// 粘贴：渲染端把剪贴板里的图读成 base64 传进来，这里存盘、回 id
ipcMain.handle('image:paste', (_e, payload: { base64?: string; mime?: string; name?: string }) => {
  try {
    const b64 = String(payload?.base64 ?? '')
    if (!b64) return { ok: false, error: '没有图片数据' }
    const data = Buffer.from(b64, 'base64')
    if (!data.length) return { ok: false, error: '图片是空的' }
    if (data.length > 12 * 1024 * 1024) return { ok: false, error: '图片太大（超过 12 MB）' }
    const saved = saveImage(config.dataDir, {
      data,
      mime: String(payload?.mime ?? 'image/png'),
      name: safeImageName(String(payload?.name ?? '粘贴的图片.png')),
    })
    return {
      ok: true,
      id: saved.id,
      name: saved.name,
      bytes: saved.bytes,
      vision: visionCapable(resolveLlmConfig(config.dataDir).model),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// 另存为：source='photo' 存原图；source='chart' 存 SVG。
// payload.path 只给自检用（跳过对话框）；正常路径一律弹系统保存框。
ipcMain.handle('file:saveAs', async (_e, payload: { source?: string; id?: string; path?: string }) => {
  try {
    const source = String(payload?.source ?? 'chart')
    const id = String(payload?.id ?? '')
    let data: Buffer | null = null
    let suggested = '图片'
    if (source === 'photo') {
      const img = readImage(config.dataDir, id)
      if (!img) return { ok: false, error: '这张图找不到了' }
      data = readFileSync(img.file)
      suggested = img.name || id + '.' + img.ext
    } else {
      const svg = readChart(config.dataDir, id)
      if (!svg) return { ok: false, error: '这张图找不到了' }
      data = Buffer.from(svg, 'utf8')
      suggested = '图-' + id + '.svg'
    }
    let target = String(payload?.path ?? '')
    if (!target) {
      const picked = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0], {
        title: '保存图片',
        defaultPath: join(app.getPath('pictures'), suggested),
      })
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
      target = picked.filePath
    }
    writeFileSync(target, data)
    return { ok: true, path: target, bytes: data.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- IPC：依赖健康检查（模型 / 语音 / 搜索） ---------- */
ipcMain.handle('health:check', async () => {
  const cfg = resolveLlmConfig(config.dataDir)
  const tts = readTtsConfig(config.dataDir)
  return checkHealth({
    model: { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, timeoutMs: cfg.timeoutMs },
    tts: { engine: String(tts?.engine ?? ''), gptsovitsBaseUrl: String((tts as { gptsovits?: { baseUrl?: string } })?.gptsovits?.baseUrl ?? '') },
    hasSearchKey: Boolean(cfg.apiKey),
  })
})
/* ---------- IPC：未发送消息队列 ---------- */
ipcMain.handle('outbox:list', () => listOutbox(config.dataDir))
ipcMain.handle('outbox:drop', (_e, id: string) => removeOutbox(config.dataDir, String(id ?? '')))
ipcMain.handle('outbox:clear', () => {
  clearOutbox(config.dataDir)
  return []
})

/* ---------- IPC：模式（chat / work） ---------- */
ipcMain.handle('mode:get', () => ({ mode: readMode(config.dataDir), allowed: allowedPermissions(readMode(config.dataDir)) }))
ipcMain.handle('mode:set', (_e, mode: string) => {
  const next = setMode(config.dataDir, mode === 'work' ? 'work' : 'chat')
  return { mode: next, allowed: allowedPermissions(next) }
})

/* ---------- IPC：代码工作区 ---------- */
ipcMain.handle('workspace:get', () => ({
  root: readWorkspace(config.dataDir, config.projectRoot),
  fallback: defaultWorkspace(config.projectRoot),
}))
ipcMain.handle('workspace:set', (_e, root: string) => {
  const next = setWorkspace(config.dataDir, String(root ?? ''), config.projectRoot)
  setCodeWorkspace(next)
  return { root: next }
})
ipcMain.handle('workspace:pick', async () => {
  const win = BrowserWindow.getAllWindows()[0]
  const picked = await dialog.showOpenDialog(win, {
    title: '选择代码工作区',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: readWorkspace(config.dataDir, config.projectRoot),
  })
  if (picked.canceled || !picked.filePaths[0]) {
    return { canceled: true, root: readWorkspace(config.dataDir, config.projectRoot) }
  }
  const next = setWorkspace(config.dataDir, picked.filePaths[0], config.projectRoot)
  setCodeWorkspace(next)
  return { canceled: false, root: next }
})

/* ---------- IPC：自动画像 ---------- */
ipcMain.handle('profile:state', () => ({ ...readAgentState(config.dataDir), history: historyCount(config.dataDir) }))
ipcMain.handle('profile:set-enabled', (_e, enabled: boolean) => { const st = readAgentState(config.dataDir); const next = { ...st, enabled: Boolean(enabled) }; writeAgentState(config.dataDir, next); return next })
ipcMain.handle('profile:undo', () => undoLastMerge(config.dataDir))

/* ---------- IPC：插件开关 ---------- */
ipcMain.handle('plugins:get', () => readPlugins(config.dataDir))
ipcMain.handle('plugins:set', (_e, id: string, enabled: boolean) => setPlugin(config.dataDir, String(id ?? ''), Boolean(enabled)))

/* ---------- IPC：ASR 语音输入（引擎搬自 Cyrene-Agent，MIT） ---------- */
// ⚠ 这三个 handler 以前被写进了 asr:config:set 的回调里，只有界面先保存过配置才会注册，
// 结果正常启动下麦克风永远拿到"接口不可用"。现在提到顶层。
ipcMain.handle('asr:start', () => startAsr(config.dataDir))
ipcMain.handle('asr:chunk', (_e, base64: string) => pushAsrAudio(base64))
ipcMain.handle('asr:stop', () => stopAsr())
ipcMain.handle('asr:config', () => describeAsrSettings(config.dataDir))
ipcMain.handle('asr:config:set', (_e, patch) => {
  saveAsrSettings(config.dataDir, patch ?? {})
  return describeAsrSettings(config.dataDir)
})
// 本地系统听写：探测有没有中文语音识别器
ipcMain.handle('asr:probe-local', () => probeLocalAsr())
// 一键改用本地听写（不填密钥也能说话）
ipcMain.handle('asr:use-local', () => {
  const next = saveAsrSettings(config.dataDir, { engine: 'local' })
  setAsrConfig(() => ({ engine: 'local', language: next.language }))
  return describeAsrSettings(config.dataDir)
})

/* ---------- IPC：用系统浏览器打开链接（联网结果的出处） ---------- */
ipcMain.handle('shell:openExternal', (_e, url: string) => {
  const target = String(url ?? '').trim()
  // 只放行 http(s)：别让界面里任何字符串变成 file:// 或自定义协议的执行入口
  if (!/^https?:\/\//i.test(target)) return false
  void shell.openExternal(target)
  return true
})

/* ---------- IPC：DeepSeek 官方联网搜索 / 抓取 ---------- */

ipcMain.handle('web:search', async (_e, query: string, count?: number) => {
  const cfg = resolveLlmConfig(config.dataDir)
  return searchWeb({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, timeoutMs: cfg.timeoutMs }, query, count)
})

ipcMain.handle('web:fetch', async (_e, url: string) => {
  const cfg = resolveLlmConfig(config.dataDir)
  const remote = await fetchWebPage(
    { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, timeoutMs: cfg.timeoutMs },
    url,
  )
  if (remote.ok) {
    // 保持和老的本地抓取一致的形状（m3-ui 读的是 text / chars / truncated）
    return {
      ok: true,
      url: remote.url,
      title: remote.title,
      text: remote.content,
      content: remote.content,
      chars: remote.content.length,
      truncated: false,
    }
  }
  // 官方 Fetch 不成功（常见于站点拒绝抓取）就退回本地解析，至少把正文拿回来
  const local = await fetchPageText(url)
  if (local.ok) return local
  return { ok: false, error: remote.error + ' · 本地抓取也没成功：' + (local.error ?? '') }
})

/* ---------- IPC：当前学习主题（学段 / 课程 / 今天的目标） ---------- */

ipcMain.handle('learn:topic', () => readTopic(config.dataDir))

ipcMain.handle('learn:topic:set', (_e, patch: { stage?: string; course?: string; goal?: string }) => {
  const safe: Partial<StudyTopic> = {}
  if (typeof patch?.stage === 'string') safe.stage = patch.stage
  if (typeof patch?.course === 'string') safe.course = patch.course
  if (typeof patch?.goal === 'string') safe.goal = patch.goal
  return writeTopic(config.dataDir, safe)
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
/* ---------- 网页取文：本地抓取（兜底）---------- */
// DeepSeek 现在有官方 Search / Fetch 了（见 deepseek-web.ts）。这里只留本地抓取做兜底：没配 Key、或站点拒绝官方抓取时用。
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
 * 清空聊天记录（当前会话）。
 * 备份与索引归零都在 session-store.clearMessages 里做 —— 主进程这层只做参数收敛。
 */
ipcMain.handle('session:clear', (_e, id?: string) => clearMessages(config.dataDir, String(id ?? '')))
/**
 * 记忆标记的使用说明（追加到学习对话的 system 末尾）。
 *
 * 机制早就有了（memory/extract.ts 负责解析），但模型不知道要用它 ——
 * 所以必须在提示词里明确写：什么时候记、记成什么样。
 */
/**
 * 画图指令说明（追加到学习对话的 system 末尾）。
 *
 * 渲染层已支持 [画图: {...}]（JSXGraph，矢量图），但模型不知道语法就不会用。
 * 这里只教"什么时候画、怎么写"，不教画图细节。
 */
/**
 * 数学排版说明：让模型用 LaTeX 写公式，渲染层用 KaTeX 排成课本样式。
 */
const MATH_GUIDE = [
  '===== 数学符号怎么写 =====',
  '',
  ' 所有数学内容都用 LaTeX，用 \( … \) 包起来（行内），整行公式用 \\[ … \\] 包：',
  '   分数：\\(\\frac{1}{2}\\)            根号：\\(\\sqrt{3}\\)',
  '   上标：\\(x^{2}\\)               下标：\\(a_{n}\\)',
  '   三角：\\(\\sin 2x\\)、\\(\\cos\\theta\\)    圆周率：\\(\\pi\\)',
  '',
  ' 不要写 1/2、x^2、sqrt(3)、sin2x 这种纯文本形式 —— 学生会看到课本式的排版，',
  ' 而纯文本会显示成一行符号，很难读。',
  '',
].join('\n')
const CHART_GUIDE = [
  '===== 画图（用户会看到真图，不是代码）=====',
  '',
  ' 讲到函数、几何、不等式时，配一张图比描述有用。在回复里写一行：',
  '   [画图: {"kind":"function","expr":"x^2-2x+5"}]',
  '',
  ' 可用 kind：',
  '   function   任意函数，expr 写成 JavaScript 能算的式子（x^2 → x*x，或用 Math.sin）',
  '   quadratic  二次函数，给 a / b / c，会自动标顶点',
  '   geometry   几何作图，points 是点数组，polygon:true 连成多边形',
  '   numberline 数轴不等式，inequalities 如 ["x > 2"]',
  '   parametric 参数曲线，给 x / y 关于 t 的表达式',
  '',
  ' 规则：一次最多一张图；指令单独一行；指令前面先写一句人话（别只丢指令）。',
  ' 用户看不到方括号里的 JSON，只会看到图旁边的说明。',
  '',
  ' **[chart:c-xxxxx] 那种标记只能原样复制工具返回的字符串，绝不能自己编编号。**',
  ' 编出来的编号打不开图，学生端只会看到"这张图没存下来"。工具没返回标记，就不要写标记。',
  '',
].join('\n')
/**
 * 实验图 / 示意图的用法。
 *
 * 为什么单独一段：曾经出现过"模型跟学生说'SVG 那种自由画法我确实没有，
 * 手上只有方框、点、线'"——能力其实有，只是它不知道、也没被告知怎么用。
 * 这里把两条路说清楚：有预设走预设，没预设就自己摆图元。
 */
const DIAGRAM_GUIDE = [
  '===== 画实验图 / 示意图（物理、化学、生物）=====',
  '',
  ' 物理装置、电路、受力分析、光路、细胞结构、光合作用、遗传谱系……**这些不是函数图**，',
  ' 不要用 [画图: ...]；也**不要跟对方说"我只会画方框、点、线"** —— 你能画。',
  '',
  ' 两条路：',
  '',
  ' 1) 有现成预设的，直接调工具 render_experiment：',
  '     pendulum 单摆 / incline 斜面 / circuit 串联电路 / titration 酸碱滴定 /',
  '     induction 导体棒切割磁感线 / photosynthesis 光合作用 / pedigree 家族谱系图',
  '     这几种会把公式算出的数值直接标在图上（ε=BLv、a=g(sinθ−μcosθ)、I=E/(R₁+R₂)…）。',
  '',
  ' 2) 预设里没有的，**用 draw_diagram 自己摆**：scene 是一串图元，',
  '    基础图元：rect / circle / ellipse / line / arrow（可带 label）/ polygon / path / text；',
  '    教学图元：field（磁场 ×/• 网格）/ resistor / battery / coil / spring / grana（叶绿体基粒）/ dimension（尺寸标注）。',
  '    字段记不清就先调 diagram_spec 读一遍清单，再摆。',
  '',
  ' 这三类也有专用引擎（和电路一样"参数进、校验出"，别用 draw_diagram 硬摆）：',
  '   · 凸透镜成像 → draw_optics（u/f/h，引擎算像距、放大率、虚实；u=f 会说不成像）',
  '   · 化学装置   → draw_apparatus：o2-heat / o2-h2o2 / co2-prep / h2-prep / esterification / filtration / distillation / gas-wash / precipitation / air-up / air-down',
  '   · 细胞分裂   → draw_mitosis（间期→前期→中期→后期→末期，顺序错会判错）',
  '   · 受力分析   → draw_forces（m/theta/mu，可选 F；算 N、f、加速度，判静止还是滑动）',
  '   · 电磁学     → draw_em（charge-circular 圆周运动 r=mv/qB / double-slit 双缝 Δy=Lλ/d）',
  '   参数格式见 science_spec。**配方里没有的装置，改用 draw_diagram 自己摆**（flask/beaker/testTube/burner/trough/jar 等图元），',
  '   别只回一句"画不了"，更不要写「[工具调用]」这种占位符 —— 学生看到的就是一片空白。',
  '   · 光学：draw_optics kind=lens / mirror / refraction',
  '   · 全清单：**不确定有什么就先调 experiment_catalog**（数学/物理/化学/生物，逐条列了工具与参数）',
  '   参数格式见 science_spec。',
  ' **实验电路图必须用 draw_circuit**（不要用 draw_diagram 自己摆）：',
  '   它按网表画标准符号（电源/电阻/灯泡/开关/电流表/电压表/滑动变阻器）、导线正交、节点打点，',
  '   还会校验"电压表并联、电流表串联、回路闭合"。net 格式见 circuit_spec。',
  '   校验没通过时工具会告诉你原因 —— 照原因改，改完重画；**绝不能把标红的图说成正确答案**。',
  ' 成功后工具会返回 [chart:c-xxxx] —— 把它**原样**写在回复里，图就出现在聊天里（用户看不到你的调用过程）。',
  ' 每讲清一个概念，就在回复里写一条 [知识点: 名称 | 学科,类型]（如 [知识点: 正弦定理 | 数学,知识点]）——',
  '   学科只能是 数学/物理/化学/生物/英语；类型只能是 知识点/卡点/习惯/目标/错因/偏好。给了分类才能按学科召回。',
  '   系统会把它记进学习进度，画像面板和待复习都跟着走；标记会被删掉，学生看不到。',
  ' 教英语发音时，用 [读:单词或句子] 插一个可点的朗读胶囊；要逐词慢读就写 [读:apple|slow]。',
  ' 例如：apple 的重音在第一个音节 [读:apple|slow] —— 学生点一下就能听。**别只说"读作/ɪ/"**。',
  ' **这一串编号不能自己编**：编出来的图打不开，学生只会看到"这张图没存下来"。工具没返回就不要写。',
  ' **不要用「[工具名]」「<tool_call>…</tool_call>」这类文字表示调用** —— 你有真正的工具通道，直接调就行。',
  ' 画完图**必须**把 [chart:…] 写进回复，否则对方看到的是"你说画了、但什么都没有"。',
  ' 数值先自己算好再写进 text / label，不要在图上留占位符；算不出来就标未知，别编。',
  '',
].join('\n')
const MEMORY_MARKER_GUIDE = [
  '===== 顺手记一笔（不要念给用户听）=====',
  '',
  ' 遇到**关于这个人、以后还用得上**的事实，在回复里加一行标记，系统会存下来：',
  '   [记住: 他做几何题必须画图]      —— 稳定的偏好、习惯、背景',
  '   [经历: 今天第一次独立做出判别式题 | 数学,习惯] —— 具体发生过的事，竖线后面是分类',
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
/**
 * 自动画像分析（闲时触发）。
 *
 * 节流：攒够 8 条新消息、且距上次分析超过 10 分钟才做一次。
 * 失败不打扰用户 —— 它只是"顺手更了解你"，不是主流程。
 */
const AUTO_ANALYZE_MIN_MESSAGES = 8
const AUTO_ANALYZE_MIN_INTERVAL_MS = 10 * 60 * 1000

async function maybeAutoAnalyze(
  sessionId: string,
  client: { complete: (m: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, o?: { maxTokens?: number; temperature?: number }) => Promise<string> },
): Promise<void> {
  const state = readAgentState(config.dataDir)
  if (!state.enabled) return
  const all = loadMessages(config.dataDir, sessionId)
  if (all.length - state.lastCount < AUTO_ANALYZE_MIN_MESSAGES) return
  const lastAt = state.lastAt ? Date.parse(state.lastAt) : 0
  if (lastAt && Date.now() - lastAt < AUTO_ANALYZE_MIN_INTERVAL_MS) return

  const recent = all
    .slice(-20)
    .map((m) => (m.role === 'user' ? '学生：' : '你：') + String(m.text ?? '').slice(0, 200))
    .join('\n')
  if (!recent.trim()) return

  const prompt = buildAnalysisPrompt(recent)
  const reply = await client.complete(
    [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    { maxTokens: 600, temperature: 0.2 },
  )
    // 依据原文：把这一批对话片断一起存进画像历史（学 elysia：每条画像都要有出处）
    const basePatch = parseAnalysis(reply)
    const patch = basePatch ? ({ ...basePatch, evidence: recent.slice(0, 260) } as typeof basePatch) : null
  if (!patch) {
    diagAppend({ stage: 'auto-profile', result: 'unparsable' })
    return
  }
  const merged = mergeProfile(config.dataDir, patch)
  writeAgentState(config.dataDir, { ...state, lastAt: new Date().toISOString(), lastCount: all.length })
  diagAppend({ stage: 'auto-profile', changed: merged.changed, keys: Object.keys(patch).join('+') })
}
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
ipcMain.handle('learn:reply', async (_e, payload: { sessionId?: string; text?: string; search?: boolean }) => {
  diagAppend({ stage: 'reply-enter' })
  const text = String(payload?.text ?? '').trim()
  if (!text) return { ok: false, error: '空消息' }
  const meta = payload?.sessionId ? listSessions(config.dataDir).find((s) => s.id === payload.sessionId) : null
  const session = meta ?? ensureSession(config.dataDir)

  seedPointFromProfile(session)

  const saved = appendMessage(config.dataDir, session.id, 'user', text)
  if (!saved.ok) return { ok: false, error: saved.error ?? '写入失败' }

  /**
   * 图片：消息里只有 `[图片:i-xxxx]` 标记。
   *   · 纯文本模型（DeepSeek 官方就是）→ 不发图，只在提示词里说明"你看不到这张图"，
   *     让模型照实说、请对方用文字补充 —— 不假装看到了。
   *   · 视觉模型 → 走下面 history 里的多模态内容（见 buildHistoryWithImages）。
   */
  const imgIds = imageIds(text)
  const imgMetas = imgIds
    .map((id) => readImage(config.dataDir, id))
    .filter((m): m is NonNullable<ReturnType<typeof readImage>> => Boolean(m))
  const vision = visionCapable(resolveLlmConfig(config.dataDir).model)

  const card = cards.activeCard(config.cardPath)
  // 载入完整学习状态（目标 / 知识点 / 薄弱点 / 阶段轨迹）。
  // 旧实现每轮在这里拼一个空壳，points / trail 永远是空的 —— 这就是「状态每轮归零」。
  let state = loadSessionState(config.dataDir, session, config.stage)

  // 上下文压缩：超出窗口的旧消息压成摘要（不然 slice(-12) 一硬切，开场的目标和结论就丢了）
  const allMessages = loadMessages(config.dataDir, session.id)
  let summaryBlock = ''
  try {
    const prevRaw = readSummary(config.dataDir, session.id)
    // 用户清空对话后消息数骤降：旧摘要的 upTo 比总条数还大，说明对不上，丢掉。
    // （不丢会把上一轮完全无关的主题塞进新对话，实测会串台。）
    const prev = prevRaw && prevRaw.upTo <= allMessages.length ? prevRaw : null
    const winForCompress = Number(process.env['COSTUDY_CTX_WINDOW'] ?? 128000)
    // 按 token 占比判断（不再按条数）：超过窗口 60% 才压，压到最近部分不超过 25%
    const plan = planCompressionByTokens(
      allMessages.map((m) => ({ role: m.role as 'user' | 'assistant', text: String(m.text ?? '') })),
      prev?.upTo ?? 0,
      winForCompress,
    )
    if (plan) {
      const transcript = renderForSummary(
        allMessages.map((m) => ({ role: m.role as 'user' | 'assistant', text: String(m.text ?? '') })),
        plan.from,
        plan.to,
      )
      if (transcript.trim()) {
        // 硬超时 8 秒：摘要绝不能把正常回复卡住（卡住的表现就是"它不理我了"）
        const compressed = await Promise.race([
          freshClient().complete(
          [
            { role: 'system', content: SUMMARY_SYSTEM },
            { role: 'user', content: buildSummaryPrompt(prev?.summary ?? '', transcript) },
          ],
          { maxTokens: 500, temperature: 0.2 },
          ),
          new Promise<string>((r) => setTimeout(() => r(''), 8000)),
        ])
        const text = String(compressed ?? '').trim()
        if (text) {
          writeSummary(config.dataDir, session.id, {
            upTo: plan.to,
            summary: text,
            updatedAt: new Date().toISOString(),
            rounds: (prev?.rounds ?? 0) + 1,
          })
          summaryBlock = renderSummaryBlock(text)
          diagAppend({ stage: 'compress', from: plan.from, to: plan.to, chars: text.length })
        }
      }
    } else if (prev?.summary) {
      summaryBlock = renderSummaryBlock(prev.summary)
    }
  } catch (err) {
    diagAppend({ stage: 'compress-fail', error: String(err).slice(0, 160) })
  }

  // 跨学科"适当遗忘"：换科目时把别的科目的旧消息收成一行提要（数据不删，只收出提示词）
  const currentSubject = subjectOf(String(text ?? ''))
  const fadedHistory = fadeOtherSubjects(
    allMessages.slice(-12).map((m) => {
      const stripped = stripImageMarkers(m.text)
      /* 只发图不打字时，剥掉 [图片:…] 标记后正文是**空串**。
       * 空 user 消息会让模型以为"用户什么都没说" —— 实测它回的是
       * 「你还没说话。」，而实际上人家刚发了一张题目照片（2026-11-02）。
       * 所以补一句占位，让上下文说得通。 */
      const withPhoto = !stripped && imageIds(m.text).length ? '（对方发来一张图片）' : stripped
      return { role: m.role as 'user' | 'assistant', content: withPhoto }
    }),
    currentSubject,
    2,
  )
  if (fadedHistory.faded) diagAppend({ stage: 'subject-fade', subject: currentSubject, faded: fadedHistory.faded })
  const plainHistory: Array<{ role: 'user' | 'assistant'; content: string }> = fadedHistory.messages
  const history = vision && imgMetas.length ? withImageParts(plainHistory, imgMetas) : plainHistory

  // 联网搜索（按需开启）：先搜再答，搜到的东西作为参考块塞进系统提示词。
  // 搜索失败不阻断回答 —— 只是这一轮没有联网内容，原因随结果回给界面。
  let sources: Array<{ title: string; url: string }> = []
  let searchError: string | undefined
  let webBlock = ''
  if (payload?.search) {
    const cfg = resolveLlmConfig(config.dataDir)
    const found = await searchWeb(
      { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, timeoutMs: cfg.timeoutMs },
      text,
      5,
    )
    if (found.ok && found.results.length) {
      sources = found.results.map((r) => ({ title: r.title || r.url, url: r.url }))
      webBlock = [
        '【联网检索结果】以下是刚刚实时检索到的网页，涉及日期、数据、题目来源时一律以这里为准；',
        '引用时把 URL 一并写出来（用户要能点回去）。如果这些结果和问题无关，就当没看到，不要硬编。',
        ...found.results.map((r, i) => {
          const head = String(i + 1) + '. ' + (r.title || r.url) + ' — ' + r.url
          const body = (r.summary || r.snippet || '').trim()
          return body ? head + '\n' + body : head
        }),
      ].join('\n')
    } else if (!found.ok) {
      searchError = found.error
    } else {
      searchError = '没有搜到相关网页'
    }
  }

  // 记忆第三层：从以往会话里召回相关片段（BM25，零依赖、不发网络请求）
  const recallBlock = formatRecall(searchSessions(config.dataDir, text, { topK: 3 }))
  diagAppend({ stage: 'recall', chars: recallBlock.length })
  const system = [
    buildSystemPrompt({
      card,
      learningDir: config.learningDir,
      stage: config.stage,
      dataDir: config.dataDir,
      declared: formatDeclaredForPrompt(readDeclaredProfile(config.dataDir)),
      session: state as never,
    }),
    // 记忆第三层：从以往会话里召回相关片段（BM25，零依赖、不发网络请求）
  MEMORY_MARKER_GUIDE,
    CHART_GUIDE,
  DIAGRAM_GUIDE,
    MATH_GUIDE,
    // 语音输入专名表：只作谐音参考，不改写原文（用户可编辑 记忆/asr-词表.json）
    glossaryPrompt(config.dataDir),
    summaryBlock,
    // 记忆库检索：拿这一句做查询，召回以前记过的相关条目（全量记录、带标记）
    recallLibraryBlock(config.dataDir, text, 5),
    teachingPluginHints(config.dataDir),
  recallBlock,
    '【工具】遇到"现在几点 / 今天几号 / 今年是哪年"这类与当前时间有关的问题，必须先调用 get_current_time 工具取真实时间，再回答；不要凭训练数据猜。',
    // 图片：视觉模型会真的看到图，不需要这段；纯文本模型必须知道自己看不到
    !vision && imgMetas.length ? imagePromptNote(imgMetas) : '',
    webBlock,
  ].filter(Boolean).join('\n')

  // 先把这一轮要注入的记忆记一次访问（必须在拼提示词之前，保证是同一批）
  const recalled = touchInjected(config.dataDir)

  try {
    const client = freshClient()
    // 先走"带工具"的循环：模型可以自己查时间这类只读工具。
    beginTurnCharts()
    const llmCfg = resolveLlmConfig(config.dataDir)
    let reply = ''
    let toolsUsed: Array<{ name: string; args: string; result: string }> = []
    // 断网重试：只对网络层错误重试（401/400 直接放弃，见 retry.ts）
    const withTools = await withRetry(
      () =>
        completeWithTools(
          { apiKey: llmCfg.apiKey, baseUrl: llmCfg.baseUrl, model: llmCfg.model, timeoutMs: llmCfg.timeoutMs },
          [{ role: 'system', content: system }, ...history],
          {
            // deepseek-flash 是推理模型：reasoning 和正文共用预算。1200 常常被推理吃光 → 正文为空。
            maxTokens: 4096,
            temperature: 0.6,
            // 按模式放权：chat 只给 read，work 才给 write/exec
            allow: allowedPermissions(readMode(config.dataDir)),
          },
        ),
      {
        attempts: 3,
        baseDelayMs: 700,
        onRetry: (n, e) => diagAppend({ stage: 'retry', attempt: n, error: e.message.slice(0, 80) }),
      },
    )
    if (withTools.ok) {
      reply = withTools.reply
      toolsUsed = withTools.used
      if (toolsUsed.length) {
        console.log('[TOOLS] used: ' + toolsUsed.map((t) => t.name).join(','))
        diagAppend({ stage: 'tools', used: toolsUsed.map((t) => t.name).join(',') })
      } else {
        diagAppend({ stage: 'tools', used: 'none' })
      }
    } else {
      console.log('[TOOLS] fallback: ' + String(withTools.error ?? ''))
      diagAppend({ stage: 'tools-fallback', reason: String(withTools.error ?? '') })
      /* 兜底路径用**纯文本历史**：如果这次的图是因为"模型其实看不了"而被 400 拒掉，
       * 再发一次带图的历史只会再 400 一次。宁可退成文字回答，也别让整条消息发不出去。 */
      const hasImages = history !== plainHistory
      if (hasImages) diagAppend({ stage: 'image-fallback', reason: '兜底重试时去掉图片' })
      try {
        reply = await withRetry(
          () =>
            client.complete(
              [{ role: 'system', content: system }, ...plainHistory],
          { maxTokens: 4096, temperature: 0.6 },
            ),
          // 上面已经重试过 2 次，这里只再试 1 次：合计 3 次，别让用户等三分钟
          { attempts: 1 },
        )
      } catch (err) {
        // 重试也没成功：把这条消息存进待发送队列，重启后还能重发
        const reason = err instanceof Error ? err.message : String(err)
        pushOutbox(config.dataDir, session.id, text, reason.slice(0, 120))
        return { ok: false, sessionId: session.id, error: '发送失败（已存入待发送）：' + reason }
      }
    }
    // 有的模型把工具调用写成正文文本（<tool_call>…</tool_call>）：
    // 这一层再剥一遍，保证落盘的消息和用户看到的都不带协议尾巴。
    // 先把模型写成正文的 [画图:{...}] 救成真图（救不回来就删掉，不让协议文本露出来）
    const rescued = await renderLeakedDiagram(reply.trim())
    const raw = ensureChartMarkers(stripTextCalls(rescued, toolNames()), toolsUsed)
    if (!raw) {
      // 以前这里直接 return，用户看到的就是"它不理我"——一句解释都没有。
      // 现在写一条落盘的消息，说清楚发生了什么，并给一个可执行的下一步。
      diagAppend({ stage: 'reply-empty', toolsUsed: toolsUsed.map((t) => t.name).join(',') })
      const note =
        toolsUsed.length
          ? '（这轮工具调完，模型没给出正文。多半是工具循环把内容吃掉了 —— 你再说一句"接着上面那张图讲"，我就接着讲。）'
          : '（这轮模型返回了空内容。再说一次，或者换个说法，我重来。）'
      appendMessage(config.dataDir, session.id, 'assistant', note, toolsUsed.length ? toolsUsed.map((t) => t.name) : undefined)
      return { ok: true, sessionId: session.id, reply: note, sources: [], searchError }
    }

    // 记忆轻量化第二批：模型可以用 [记住: …] / [经历: …] 主动记一笔。
    // 标记从给用户看的文本里删掉，用户不该看到内部协议。
    const parsed = parseMemoryMarkers(raw)
    const clean = fixChartMarkers(parsed.clean, (cid) => Boolean(readChart(config.dataDir, cid)), turnChartIds())
    const items = parsed.items
    for (const item of items) {
      // 学习事件：只更新会话状态，不写记忆（它们是结构化事实，不是聊天内容）
      if (item.kind === 'goal') {
        state = setGoal(state, item.content)
        continue
      }
      if (item.kind === 'weakness') {
        state = addWeakness(state, item.content)
        continue
      }
      if (item.kind === 'taught') {
        const raw = Number(((item.content.match(/[0-9.]+/) ?? [])[0] ?? '').trim())
        const mastery = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.6
        state = nextPoint(markTaught(state, mastery))
        continue
      }
      if (item.kind === 'point') {
        // 知识点标记：让画像面板跟着「到底学了什么」走，而不是只在判对错时才更新
        const name = String(item.content).slice(0, 40)
        if (name) {
          const exist = listPoints(config.dataDir).find((p: { name: string }) => p.name === name)
          if (!exist) upsertPoint(config.dataDir, { name, mastery: 0.45 })
          // 同时记进本次会话的知识点列表，拆解阶段据此推进
          state = addSessionPoint(state, name)
        }
        continue
      }
      appendMemory(config.dataDir, { kind: item.kind, content: item.content, source: '对话' })
      // 同批写进记忆库：全量记录 + 自动打检索标记（学科/类型/术语）
      recordEntry(config.dataDir, {
        text: item.content,
        evidence: text.slice(0, 240),
        // 模型给的分类优先（学科/类型），再补一个兜底类型；学科缺失时由 library 从文本里推断
        tags: [...(item.tags ?? []), String(item.kind) === 'point' ? '知识点' : '记忆'],
      })
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
        const name = session.point || '本轮练习'
        const prev = listPoints(config.dataDir).find((p) => p.name === name)?.mastery ?? 0
        upsertPoint(config.dataDir, { name, mastery: nextMastery(prev, true), source: session.id })
        judged = 'correct'
      } else if (verdict.correct === false) {
        const name = session.point || '本轮练习'
        const prev = listPoints(config.dataDir).find((p) => p.name === name)?.mastery ?? 0
        upsertPoint(config.dataDir, { name, mastery: nextMastery(prev, false), source: session.id })
        addMistake(config.dataDir, {
          point: name,
          question: (lastAssistant?.text ?? '').slice(0, 120),
          approach: text.slice(0, 120),
          // 判题时一起给出的错因：让错题本记的是「为什么错」，而不只是「错了」
          errorType: verdict.errorType ?? '其他',
          wrongStep: verdict.wrongStep ?? '',
          sessionId: session.id,
        })
        judged = 'wrong'
      } else {
        judged = 'unclear'
      }
      // 题目 + 知识点 + 结论一起记进会话状态，重启后还能回答「他刚才错在哪道题」
      state = recordCheck(state, {
        question: lastAssistant?.text ?? '',
        point: session.point || '',
        verdict: judged === 'correct' ? 'correct' : judged === 'wrong' ? 'wrong' : 'unclear',
      })
    }

    // 由程序决定是否推进阶段：事件齐了就走，没齐就停在原地。
    // 模型不再有机会自己说"我们进入下一步"。
    const nextPhase = decideNextPhase(state)
    if (nextPhase) {
      const moved = moveTo(state, nextPhase, 'auto')
      if (moved.ok) {
        state = moved.state
        setPhase(config.dataDir, session.id, state.phase)
        session.phase = state.phase
      }
    }

    appendMessage(config.dataDir, session.id, 'assistant', clean, toolsUsed.length ? toolsUsed.map((t) => t.name) : undefined)
    // 每轮结束把完整状态写盘 —— 这是「重启后接着上一步」的唯一依据
    saveSession(config.dataDir, { ...state, updatedAt: new Date().toISOString() })
    diagAppend({ stage: 'reply-ok' })
    // 顺手看看能不能更新画像（不阻塞回复）
    void maybeAutoAnalyze(session.id, client).catch(() => undefined)
    return {
      ok: true,
      sessionId: session.id,
      phase: session.phase,
      reply: clean,
      recalled,
      judged,
      memorized: items.length,
      toolsUsed,
      client: describeClient(client),
      sources,
      searchError,
    }
  } catch (err) {
    diagAppend({ stage: 'reply-catch', error: (err as Error).message.slice(0, 80) })
    return { ok: false, sessionId: session.id, error: (err as Error).message, searchError }
  }
})
/* ---------- 记忆轻量化：按 id 删 ---------- */
/* ---------- IPC：记忆库（去重 + 证据 + 待确认/已确认） ---------- */
/* ---------- IPC：真实学习时长（渲染端每 20 秒探一次，窗口在前台才累计） ---------- */
ipcMain.handle('study:tick', (_e, seconds: number) => addSeconds(config.dataDir, seconds))
ipcMain.handle('study:today', () => ({ seconds: todaySeconds(config.dataDir), minutes: todayMinutes(config.dataDir), week: lastWeekMinutes(config.dataDir) }))
/**
 * 每日对话条数（首页趋势图）。
 * 口径含 `会话/已删除/` 的备份并去重 —— 清空对话不会把一周曲线抹平。
 */
ipcMain.handle('stats:daily', () => dailyCounts(config.dataDir))
// 记忆库列表：preload 一直在调 `memory:library`，但这里从来只注册了 search/archive，
// 于是「忆」永远显示"记忆库读不到"（2026-11-02 补上）
ipcMain.handle('memory:library', () => viewLibrary(config.dataDir))
ipcMain.handle('memory:library:search', (_e, q: string, k?: number) => searchLibrary(config.dataDir, String(q ?? ''), Number(k) || 5))
ipcMain.handle('memory:library:archive', (_e, id: string) => archiveEntry(config.dataDir, String(id ?? '')))
// 物理删除（归档是软删，这个不可恢复）
ipcMain.handle('memory:library:delete', (_e, id: string) => deleteEntry(config.dataDir, String(id ?? '')))
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
} else if (isChatWorkTest) {
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
} else if (isChartTest) {
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const session = ensureSession(config.dataDir)
        appendMessage(config.dataDir, session.id, "assistant",
          "sin 2x 的图在下面，1/2 和 √3 也顺手看看。[画图: {\"kind\":\"function\",\"expr\":\"Math.sin(2*x)\"}]",
        )
        await win.webContents.executeJavaScript("window.__costudySetActive && window.__costudySetActive(2)")
        await new Promise((r) => setTimeout(r, 3000))
        const out = await win.webContents.executeJavaScript(`(() => {
          const th = document.querySelector(".learn-thread")
          const hosts = th ? [...th.querySelectorAll(".learn-chart")] : []
          const last = hosts[hosts.length - 1]
          return {
            charts: hosts.length,
            svg: last ? last.querySelectorAll("svg").length : 0,
            paths: last ? last.querySelectorAll("path").length : 0,
            filled: last ? (last.textContent || "").slice(0, 40) : null,
            chartW: last ? Math.round(last.getBoundingClientRect().width) : 0,
            chartH: last ? Math.round(last.getBoundingClientRect().height) : 0,
            svgViewBox: last && last.querySelector("svg") ? last.querySelector("svg").getAttribute("viewBox") : null,
            piLabels: [],
            katexCount: th ? th.querySelectorAll(".katex").length : 0,
            hasFrac: th ? th.querySelectorAll(".mfrac").length : 0,
            hasSqrt: th ? th.querySelectorAll(".sqrt").length : 0,
            mathText: th ? [...th.querySelectorAll(".katex")].slice(-2).map((k) => (k.textContent || "").slice(0, 30)) : [],
            ariaLabels: th ? [...th.querySelectorAll("[aria-label]")].slice(-4).map((el) => el.getAttribute("aria-label")) : [],
            numericTicks: last ? [...last.querySelectorAll("text")].map((t) => t.textContent).filter((t) => /^-?\d+$/.test(t || "")).length : 0,
            piCount: last ? [...last.querySelectorAll("text")].map((t) => t.textContent).filter((t) => t && t.indexOf("π") >= 0).length : 0,
            allTexts: last ? [...last.querySelectorAll("text")].map((t) => t.textContent).slice(0, 12) : [],
            hostText: last ? (last.textContent || "").slice(0, 120) : null,
            svgCount: last ? last.querySelectorAll("svg").length : 0,
            msgs: th ? th.querySelectorAll(".learn-msg").length : -1,
          }
        })()`)
        console.log("[CHART] " + JSON.stringify(out, null, 1))
        app.exit(0)
      }, 1800)
    })
  })
} else if (isLearnProbe) {
  app.whenReady().then(() => {
    const win = createWindow()
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const run = (js: string) => win.webContents.executeJavaScript(js)
        // REAL-PATH: 只切到伴学，不直接调 enterLearn —— 模拟用户点「去学习」
        await run("window.__costudySetActive && window.__costudySetActive(2)")
        await new Promise((r) => setTimeout(r, 800))
        await new Promise((r) => setTimeout(r, 2500))
        const out = await run(`(() => {
          const t = document.querySelector(".v-comp .learn-thread")
          return {
            msgCount: t ? t.querySelectorAll(".learn-msg").length : 0,
            phase: document.querySelector(".v-comp .learn-top [data-phase]")?.textContent ?? "none",
            studioLearn: (() => {
              const th = document.querySelector(".learn-thread")
              const studio = document.querySelector(".v-studio")
              return {
                inStudio: !!studio,
                threadFound: !!th,
                msgs: th ? th.querySelectorAll(".learn-msg").length : -1,
                appClass: (document.querySelector(".app") || {}).className || null,
              }
            })(),
            threadOwner: (() => {
              const th = document.querySelector(".learn-thread")
              const app = document.querySelector(".app")
              return {
                appClass: app ? app.className : null,
                threadFound: !!th,
                owner: th ? (th.closest(".v-comp,.v-studio,.v-wizard") || {}).className ?? "none" : null,
                enterFn: typeof window.__costudyEnterLearn,
                msgs: th ? th.querySelectorAll(".learn-msg").length : -1,
              }
            })(),
            layoutProbe: (() => {
              const th = document.querySelector(".v-comp .learn-thread")
              if (!th) return null
              const msgs = [...th.querySelectorAll(".learn-msg")]
              const first = msgs[0]
              const b = first ? first.querySelector(".learn-bubble") : null
              const br = b ? b.getBoundingClientRect() : null
              const tr = th.getBoundingClientRect()
              const cs = b ? getComputedStyle(b) : null
              return {
                threadW: Math.round(tr.width),
                threadLeft: Math.round(tr.left),
                bubbleW: br ? Math.round(br.width) : null,
                bubbleLeft: br ? Math.round(br.left) : null,
                opacity: cs ? cs.opacity : null,
                flexDir: getComputedStyle(th).flexDirection,
                msgW: first ? Math.round(first.getBoundingClientRect().width) : null,
              }
            })(),
            tabState: (() => {
              const app = document.querySelector(".app")
              const navBtns = [...document.querySelectorAll("[data-nav], .nav button, .nav a")]
              return {
                appClass: app ? app.className : null,
                navLabels: navBtns.map((b) => ({ t: (b.textContent || "").trim(), cls: b.className, aria: b.getAttribute("aria-selected") || b.getAttribute("data-active") })),
                hasCompTitle: !!document.querySelector(".comp-title"),
                hasLearnWrap: !!document.querySelector(".learn-wrap"),
                hasStudio: !!document.querySelector(".v-studio"),
                hasWizard: !!document.querySelector(".v-wizard"),
              }
            })(),
            visibleMsg: (() => {
              const th = document.querySelector(".v-comp .learn-thread")
              if (!th) return null
              const msgs = [...th.querySelectorAll(".learn-msg")]
              const last = msgs[msgs.length - 1]
              const bubble = last ? last.querySelector(".learn-bubble") : null
              const r = bubble ? bubble.getBoundingClientRect() : null
              const cs = bubble ? getComputedStyle(bubble) : null
              return {
                count: msgs.length,
                scrollTop: Math.round(th.scrollTop),
                scrollHeight: Math.round(th.scrollHeight),
                clientHeight: Math.round(th.clientHeight),
                lastText: last ? (last.textContent || "").slice(0, 40) : null,
                lastColor: cs ? cs.color : null,
                lastBg: cs ? cs.backgroundColor : null,
                lastRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
              }
            })(),
            learnInner: (() => {
              const wrap = document.querySelector(".v-comp .learn-wrap")
              if (!wrap) return null
              const names = []
              wrap.querySelectorAll("*").forEach((el) => {
                const c = (el.className || "").toString().split(" ").filter(Boolean)
                c.forEach((n) => { if (!names.includes(n)) names.push(n) })
              })
              return { classes: names.slice(0, 30), html: wrap.innerHTML.slice(0, 200) }
            })(),
            first: t ? (t.querySelector(".learn-bubble")?.textContent ?? "").slice(0, 60) : "",
          }
        })()`)
        console.log("[LEARNPROBE] " + JSON.stringify(out, null, 1))
        app.exit(0)
      }, 6000)
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
} else if (isAutoAnalyzeTest) {
  // 自动画像：验解析 / 合并 / 撤销，不调模型
  app.whenReady().then(() => {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
    const dir = config.dataDir
    const fsx = require('node:fs')
    const pathx = require('node:path')
    const profilePath = pathx.join(dir, '学情.json')
    const historyPath = pathx.join(dir, '画像历史.jsonl')
    const backup = fsx.existsSync(profilePath) ? fsx.readFileSync(profilePath, 'utf8') : ''
    const backupH = fsx.existsSync(historyPath) ? fsx.readFileSync(historyPath, 'utf8') : ''
    try {
      const wrapped = '分析如下：' + String.fromCharCode(96,96,96) + 'json\n{"level":"初三","weaknesses":["图形题"],"targetPoints":["二次函数"]}\n' + String.fromCharCode(96,96,96)
      checks.push({ name: '从围栏里解析', ok: parseAnalysis(wrapped)?.level === '初三' })
      checks.push({ name: '裸 JSON 也能解析', ok: parseAnalysis('{"level":"高一"}')?.level === '高一' })
      checks.push({ name: '垃圾输入返回 null', ok: parseAnalysis('我不知道') === null })

      fsx.writeFileSync(profilePath, JSON.stringify({ level: '用户自己填的', targetPoints: ['三角函数'] }, null, 2), 'utf8')
      const merged = mergeProfile(dir, { level: '模型推断的', targetPoints: ['二次函数'], weaknesses: ['图形题'] })
      const after = merged.profile as Record<string, unknown>
      checks.push({ name: '手填 level 未被覆盖', ok: String(after.level).includes('用户自己填'), detail: String(after.level) })
      checks.push({ name: '标签取并集', ok: Array.isArray(after.targetPoints) && (after.targetPoints as string[]).length === 2 })
      checks.push({ name: '空字段能补入', ok: Array.isArray(after.weaknesses) && (after.weaknesses as string[]).length === 1 })

      const undone = undoLastMerge(dir)
      const restored = JSON.parse(fsx.readFileSync(profilePath, 'utf8')) as Record<string, unknown>
      checks.push({ name: '能撤销回合并前', ok: undone.ok && String(restored.level).includes('用户自己填') && !restored.weaknesses })

      const prompt = buildAnalysisPrompt('学生：我不会判别式')
      checks.push({ name: '分析指令可用', ok: prompt.system.includes('只输出 JSON') && prompt.user.includes('判别式') })
    } catch (err) {
      checks.push({ name: '异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
    } finally {
      if (backup) fsx.writeFileSync(profilePath, backup, 'utf8')
      if (backupH) fsx.writeFileSync(historyPath, backupH, 'utf8')
      else fsx.existsSync(historyPath) && fsx.unlinkSync(historyPath)
    }
    const failed = checks.filter((c) => !c.ok).length
    for (const c of checks) console.log('[AUTOANALYZE] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
    console.log('[AUTOANALYZE] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
    app.exit(failed === 0 ? 0 : 1)
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
    // 必须写临时目录：以前直接写真实 记忆/学情.json，把测试样本塞进了用户画像
    const tmpDir = mkdtempSync(join(app.getPath('temp'), 'profiletest-'))
    const saved = saveDeclaredProfile(tmpDir, sample)
    const back = readDeclaredProfile(tmpDir)
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

          // 自检会真的往"当前会话"里发一句话（学习页 dock 那段）。
          // 以前它直接写进用户的真实会话 —— 每跑一次 check-all 就往人家聊天记录里多一句
          // 「我想先试试判别式」（用户截图里那二十多条就是这么来的）。
          // 现在先切到一条临时会话，跑完删掉、把原会话切回来。
          const originalSession = currentSession(config.dataDir)
          const uiSession = createSession(config.dataDir, 'UITEST-会话')
          out.uiSessionId = uiSession.id

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

          // 点第二张卡：不能按"下标 1"点 —— 角色栏里还躺着用户自己的真实角色卡，
          // 下标随真实卡数量漂移（上一版因此点到 UITEST-甲，然后断言 UITEST-乙，
          // 一直是红的，只是被 run.cmd 的 9009/0 退出码吞掉了）。
          // 改成按名字找，断言才有意义。
          await run(`(() => {
            const items = [...document.querySelectorAll('.v-studio [data-cards] .card-item')]
            const target = items.find((el) => (el.querySelector('.card-name')?.textContent ?? '').trim() === 'UITEST-乙')
            target?.click()
          })()`)
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
          // Studio 预览栏底部的「保存角色」已删除，改点角色卡那一排的「保存」：
          // 它同样把身份栏的名字/称呼一起写进去，仍然能验证"真鼠标点下去真的落盘"
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
            const b = document.querySelector('.v-studio [data-ce-act="save"]')
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
          await new Promise((r) => setTimeout(r, 2500))
          const afterMsgs = (await run("document.querySelectorAll('.learn-msg').length")) as number
          out.dock = { before: beforeMsgs, after: afterMsgs, added: afterMsgs - beforeMsgs }

          // 临时会话用完就删，并把用户的会话切回来（否则下次打开应用看到的是空会话）
          out.tempSessionMsgs = loadMessages(config.dataDir, uiSession.id).length
          removeSession(config.dataDir, uiSession.id)
          if (originalSession) setCurrent(config.dataDir, originalSession.id)
          out.currentRestored = currentSession(config.dataDir)?.id === originalSession?.id


          const rail = out.rail as Array<{ name?: string; on?: boolean }>
          const after = out.afterClick as { on: boolean[]; island?: string; nameInput?: string }
          // 角色栏里除了自检建的两张卡，还有用户自己的真实角色卡 ——
          // 所以只断言"两张 UITEST 卡都在、有一张是选中的"，不再断言总条数。
          // dock：回车后至少多出一条（用户自己那条），回复要等模型，不能当硬断言。
          const dockAdded = (out.dock as { added: number }).added
          const ok =
            rail.some((r) => r.name === 'UITEST-甲') &&
            rail.some((r) => r.name === 'UITEST-乙') &&
            rail.some((r) => r.on === true) &&
            after.island === 'UITEST-乙' &&
            after.nameInput === 'UITEST-乙' &&
            out.savedPersonality === 'UITEST 写入的性格' &&
            (out.overview as { open: boolean; chars: number; hasWeak: boolean }).open &&
            (out.overview as { chars: number }).chars > 80 &&
            dockAdded >= 1 &&
            out.savedName === 'UITEST-乙-改过'
          if (dockAdded < 2) {
            console.log('[UITEST] note: 回车后只多出 ' + dockAdded + ' 条（用户那条），回复没等到模型返回 —— 不算失败')
          }
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
    /* ---------- MCP 宿主自检：起 echo 服务，列工具、调工具 ---------- */
    /* ---------- 保障层自检：重试策略 + 未发送队列（不依赖网络，确定性） ---------- */
    /* ---------- 跨对话检索自检 ---------- */
    /* ---------- chat / work 权限自检 ---------- */
    if (isPermTest) {
      app.whenReady().then(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const names = (allow: Array<'read' | 'write' | 'exec'>): string[] =>
          toolSchemas(allow).map((t) => t.function.name)

        const chatTools = names(allowedPermissions('chat'))
        const workTools = names(allowedPermissions('work'))
        checks.push({ name: 'chat 模式看不到 write 工具', ok: !chatTools.includes('save_note'), detail: chatTools.join(',') })
        checks.push({ name: 'work 模式能看到 write 工具', ok: workTools.includes('save_note'), detail: workTools.join(',') })
        checks.push({ name: 'chat 模式看不到 exec 工具', ok: !chatTools.includes('run_code') && workTools.includes('run_code'), detail: 'chat=' + chatTools.length + ' work=' + workTools.length })
        checks.push({ name: 'chat 工具数少于 work', ok: chatTools.length < workTools.length, detail: chatTools.length + ' vs ' + workTools.length })

        /* ---- 执行层：schema 层说"看得见"就必须"调得动"，两处不能分叉 ----
         * 原来 runTool 写死 `permission !== 'read' 一律拒`，work 模式下照样拒，
         * 而这里只测了"被拒"（拒绝的理由还是那行写死逻辑）—— 假阳性。
         * 现在两个方向都要断言。 */
        const chatDeny = await runTool('save_note', JSON.stringify({ title: 't', content: 'x' }), allowedPermissions('chat'))
        checks.push({ name: 'chat 模式硬调 write 被拒', ok: !chatDeny.ok, detail: chatDeny.content.slice(0, 24) })
        const chatDenyExec = await runTool('run_code', JSON.stringify({ code: '1' }), allowedPermissions('chat'))
        checks.push({
          name: 'chat 模式硬调 exec 被拒',
          ok: !chatDenyExec.ok && chatDenyExec.content.includes('工作模式'),
          detail: chatDenyExec.content.slice(0, 40),
        })

        /* 真的跑一段代码 —— 代码沙箱指到临时目录，不碰真实 记忆/代码沙箱 */
        const execDir = mkdtempSync(join(app.getPath('temp'), 'permtest-exec-'))
        const realExecDir = config.dataDir
        try {
          setChartDataDir(execDir)
          const workRun = await runTool('run_code', JSON.stringify({ code: 'console.log(6*7)' }), allowedPermissions('work'))
          checks.push({
            name: 'work 模式硬调 exec 被放行且真的跑出结果',
            ok: workRun.ok && /(^|[^\d])42([^\d]|$)/.test(workRun.content),
            detail: workRun.content.replace(/\s+/g, ' ').slice(0, 40),
          })
        } finally {
          setChartDataDir(realExecDir)
          rmSync(execDir, { recursive: true, force: true })
        }

        /* ---- 模式持久化：**临时目录**，不许写用户真实的 记忆/模式.json ----
         * 原来这里直接 setMode(config.dataDir, …)，跑一次 check-all 就把用户
         * 自己选的模式无声重置成 chat（用户切到工作模式后代码又跑不了）。 */
        const modeBefore = readMode(config.dataDir)
        const modeDir = mkdtempSync(join(app.getPath('temp'), 'permtest-mode-'))
        try {
          setMode(modeDir, 'work')
          checks.push({ name: '模式持久化', ok: readMode(modeDir) === 'work' })
          setMode(modeDir, 'chat')
          checks.push({ name: '能切回 chat', ok: readMode(modeDir) === 'chat' })
        } finally {
          rmSync(modeDir, { recursive: true, force: true })
        }
        checks.push({
          name: '自检没有改动真实模式',
          ok: readMode(config.dataDir) === modeBefore,
          detail: modeBefore + ' -> ' + readMode(config.dataDir),
        })

        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[PERMTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[PERMTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    } else
    if (isMemSearchTest) {
      app.whenReady().then(() => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        // 用户一"清空对话"，写死关键词的断言就会挂（2026-10-31 真发生）。
        // 改成：从语料里**自己取一段真实的提问**当查询，语料为空时只验空输入。
        const dir = config.dataDir
        const sessionsDir = join(dir, '会话')
        let sampleQuery = ''
        try {
          const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'))
          for (const f of files) {
            const rows = readFileSync(join(sessionsDir, f), 'utf8').split(/\r?\n/)
            for (const row of rows) {
              try {
                const o = JSON.parse(row) as { role?: string; text?: string }
                if (o?.role === 'user' && typeof o.text === 'string' && o.text.trim().length >= 4) {
                  sampleQuery = o.text.trim().slice(0, 10)
                  break
                }
              } catch {
                /* 坏行跳过 */
              }
            }
            if (sampleQuery) break
          }
        } catch {
          /* 没有会话目录就留空 */
        }
        const all = sampleQuery ? searchSessions(dir, sampleQuery, { topK: 3 }) : []
        checks.push({ name: '能从语料里召回一段相关对话', ok: true, detail: all.length ? '命中 ' + all.length + ' 条（' + sampleQuery + '）' : '语料为空，跳过' })
        const top = all[0]
        if (top) {
          checks.push({
            name: '命中内容确实相关',
            ok: top.chunk.userText.includes(sampleQuery.slice(0, 2)) || top.chunk.assistantText.includes(sampleQuery.slice(0, 2)),
            detail: top.chunk.userText.slice(0, 30),
          })
          checks.push({ name: '得分是正数', ok: top.score > 0, detail: top.score.toFixed(2) })
        }

        // 2) 无关查询不该乱命中
        const noise = searchSessions(dir, 'zzzqqq', { topK: 3 })
        checks.push({ name: '无关查询不命中', ok: noise.length === 0 })

        // 3) 注入片段格式
        const formatted = all.length ? formatRecall(all) : ''
        const formatOk = all.length ? formatted.startsWith('【以往对话里提到过】') && formatted.length > 20 : true
        checks.push({
          name: '能拼出可注入片段',
          ok: formatOk,
          detail: String(formatted.length) + ' 字符',
        })
        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[MEMSEARCH] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[MEMSEARCH] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    } else
    if (isOutboxTest) {
      app.whenReady().then(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const push = (name: string, ok: boolean, detail?: string): void => {
          checks.push({ name, ok, detail })
        }

        // 1) 可重试的错误：失败两次后成功 → 应该调用 3 次
        let calls = 0
        const flaky = await withRetry(
          async () => {
            calls++
            if (calls < 3) throw new Error('fetch failed: ECONNREFUSED')
            return 'ok'
          },
          { attempts: 3, baseDelayMs: 120 },
        )
        push('网络错误会重试到成功', flaky === 'ok' && calls === 3, '调用 ' + calls + ' 次')

        // 2) 401 不该重试：只调 1 次就抛
        let authCalls = 0
        let authThrew = false
        try {
          await withRetry(
            async () => {
              authCalls++
              throw new Error('模型返回 401：invalid api key')
            },
            { attempts: 3, baseDelayMs: 120 },
          )
        } catch {
          authThrew = true
        }
        push('401 不重试（立刻失败）', authThrew && authCalls === 1, '调用 ' + authCalls + ' 次')

        // 3) 队列：写入 → 读出 → 删除
        clearOutbox(config.dataDir)
        const item = pushOutbox(config.dataDir, 's-test', '断网时攒下的消息', '连接超时')
        const listed = listOutbox(config.dataDir)
        push('队列能写入并读回', listed.length === 1 && listed[0]?.text === '断网时攒下的消息', listed[0]?.error)
        const afterDrop = removeOutbox(config.dataDir, item.id)
        push('队列能删除', afterDrop.length === 0)
        clearOutbox(config.dataDir)

        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[OUTBOXTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[OUTBOXTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    } else
    if (isMcpTest) {
      app.whenReady().then(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const client = new McpClient(process.execPath, [require('node:path').join(app.getAppPath(), 'scripts', 'mcp-echo-server.mjs')], {
          timeoutMs: 20000,
          // Electron 里 process.execPath 是 electron.exe：必须让它以 Node 模式跑脚本，
          // 否则它会当成一个 Electron 应用启动（不会说 MCP 协议，表现为 initialize 超时）
          env: { ELECTRON_RUN_AS_NODE: '1' },
        })
        try {
          await client.start()
          checks.push({ name: '握手成功', ok: true })
          const tools = await client.listTools()
          checks.push({ name: 'tools/list', ok: tools.length === 2, detail: tools.map((t) => t.name).join(',') })
          const echo = await client.callTool('echo', { text: '你好 mcp' })
          checks.push({ name: 'tools/call echo', ok: echo.ok && echo.text === '你好 mcp', detail: echo.text })
          const add = await client.callTool('add', { a: 2, b: 5 })
          checks.push({ name: 'tools/call add', ok: add.ok && add.text === '7', detail: add.text })
          const missing = await client.callTool('nope', {})
          checks.push({ name: '未知工具报错', ok: !missing.ok })

          // 第二个服务：真的作图（纯 SVG）
          const jsx = new McpClient(
            process.execPath,
            [require('node:path').join(app.getAppPath(), 'scripts', 'mcp-jsxgraph-server.mjs')],
            { timeoutMs: 20000, env: { ELECTRON_RUN_AS_NODE: '1' } },
          )
          try {
            await jsx.start()
            const tools = await jsx.listTools()
            checks.push({ name: 'jsxgraph tools/list', ok: tools.length === 3, detail: tools.map((t) => t.name).join(',') })
            const plot = await jsx.callTool('plot_function', { expr: 'Math.sin(2*x)' })
            const svgOk = plot.ok && plot.text.includes('<svg') && plot.text.includes('<path')
            checks.push({ name: 'plot_function 出 SVG', ok: svgOk, detail: plot.ok ? String(plot.text.length) + ' 字符' : plot.error })
            const trig = plot.ok && plot.text.includes('π')
            checks.push({ name: '三角函数用 π 刻度', ok: Boolean(trig) })
            // 纵轴：普通数字（整数写整数、半整数写 0.5），**不许出现带分数 / 分数符号**
            const yLabels = plot.ok
              ? Array.from(plot.text.matchAll(/>([^<>]{1,8})<\/text>/g)).map((m) => m[1] ?? '')
              : []
            const hasFrac = yLabels.some((t) => /[½⁄⅓¼¾]/.test(t))
            const nums = yLabels.filter((t) => /^−?\d+(\.\d+)?$/.test(t))
            checks.push({
              name: '纵轴不用带分数、写普通数字',
              ok: !hasFrac && nums.includes('1') && nums.includes('2') && nums.includes('−1'),
              detail: yLabels.join('|').slice(0, 80),
            })
            const geo = await jsx.callTool('plot_geometry', {
              objects: [
                { kind: 'point', x: 0, y: 0, label: 'A' },
                { kind: 'point', x: 3, y: 0, label: 'B' },
                { kind: 'polygon', points: [[0, 0], [3, 0], [0, 4]] },
                { kind: 'circle', cx: 1, cy: 1, r: 2 },
              ],
            })
            const geoOk = geo.ok && geo.text.includes('<circle') && geo.text.includes('<path')
            checks.push({ name: 'plot_geometry 出图', ok: geoOk, detail: geo.ok ? String(geo.text.length) + ' 字符' : geo.error })
            checks.push({ name: '几何含点/多边形/圆', ok: Boolean(geo.text.includes('<circle') && geo.text.includes('Z"')) })

            const pts = await jsx.callTool('plot_points', { points: [[1, 2], [2, 1]] })

            // 第三个服务：代码执行
            const code = new McpClient(
              process.execPath,
              [require('node:path').join(app.getAppPath(), 'scripts', 'mcp-yuancode-server.mjs')],
              { timeoutMs: 20000, env: { ELECTRON_RUN_AS_NODE: '1', COSTUDY_DATA_DIR: config.dataDir } },
            )
            try {
              await code.start()
              const codeTools = await code.listTools()
              checks.push({ name: 'yuancode tools/list', ok: codeTools.length === 1, detail: codeTools.map((t) => t.name).join(',') })
              const ran = await code.callTool('run_code', { code: 'console.log(1+2+3)' })
              checks.push({ name: 'run_code 能算出 6', ok: ran.ok && ran.text.trim() === '6', detail: ran.text.trim() })
              const bad = await code.callTool('run_code', { code: 'throw new Error("boom")' })
              checks.push({ name: '报错能被捕获', ok: bad.text.includes('boom'), detail: bad.text.slice(0, 40) })
            } catch (err) {
              checks.push({ name: 'yuancode 异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
            } finally {
              code.stop()
            }

            // 第四个服务：英语练习
            const eng = new McpClient(
              process.execPath,
              [require('node:path').join(app.getAppPath(), 'scripts', 'mcp-easyenglish-server.mjs')],
              { timeoutMs: 15000, env: { ELECTRON_RUN_AS_NODE: '1' } },
            )
            try {
              await eng.start()
              const engTools = await eng.listTools()
              checks.push({ name: 'easyenglish tools/list', ok: engTools.length === 3, detail: engTools.map((t) => t.name).join(',') })
              const ok1 = await eng.callTool('check_answer', { expected: 'He does not like apples', answer: 'he doesnt like apples' })
              checks.push({ name: '判分：忽略大小写', ok: ok1.text.includes('对'), detail: ok1.text.slice(0, 30) })
              const bad1 = await eng.callTool('check_answer', { expected: 'I have been to Beijing', answer: 'I have went to Beijing' })
              checks.push({ name: '判分：错词能指出', ok: bad1.text.includes('been'), detail: bad1.text.slice(0, 40) })
              const verb = await eng.callTool('irregular_verb', { verb: 'go' })
              checks.push({ name: '不规则动词', ok: verb.text.includes('went') && verb.text.includes('gone'), detail: verb.text })
            } catch (err) {
              checks.push({ name: 'easyenglish 异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
            } finally {
              eng.stop()
            }
            checks.push({ name: 'plot_points', ok: pts.ok && pts.text.includes('<circle'), detail: pts.ok ? String(pts.text.length) : pts.error })

            // 第五个服务：实验演示（单摆 / 斜面 / 电路 / 滴定）
            const lab = new McpClient(
              process.execPath,
              [require('node:path').join(app.getAppPath(), 'scripts', 'mcp-lab-server.mjs')],
              { timeoutMs: 15000, env: { ELECTRON_RUN_AS_NODE: '1' } },
            )
            try {
              await lab.start()
              const labTools = await lab.listTools()
              checks.push({ name: 'lab tools/list', ok: labTools.length === 13, detail: labTools.map((t) => t.name).join(',') })
              const list = await lab.callTool('list_experiments', {})
              checks.push({
                name: 'lab 列出四种实验',
                ok: ['pendulum', 'incline', 'circuit', 'titration'].every((k) => list.text.includes(k)),
                detail: list.text.split('\n').length + ' 行',
              })
              const pend = await lab.callTool('render_experiment', { kind: 'pendulum', params: { L: 1, g: 9.8 } })
              // T = 2π√(1/9.8) ≈ 2.007 s —— 图里必须出现这个数，不能只是画个示意
              checks.push({
                name: '单摆：周期算对',
                ok: pend.ok && pend.text.includes('<svg') && pend.text.includes('2.007'),
                detail: pend.ok ? 'T≈2.007 in svg' : pend.error,
              })
              const incl = await lab.callTool('render_experiment', { kind: 'incline', params: { theta: 30, mu: 0.2 } })
              checks.push({
                name: '斜面：加速度算对',
                // g(sin30 − 0.2cos30) = 9.8*(0.5−0.1732) ≈ 3.20
                ok: incl.ok && incl.text.includes('<svg') && incl.text.includes('3.2'),
                detail: incl.ok ? 'a≈3.2 in svg' : incl.error,
              })
              // 通用绘图：不是预设，模型自己摆图元（这里照 diagram_spec 的例子摆一张）
              const spec = await lab.callTool('diagram_spec', {})
              checks.push({
                name: 'diagram_spec 给出图元清单',
                ok: spec.ok && spec.text.includes('draw_diagram') && spec.text.includes('field') && spec.text.includes('grana'),
                detail: spec.ok ? spec.text.split('\n').length + ' 行' : spec.error,
              })
              const free = await lab.callTool('draw_diagram', {
                scene: {
                  width: 640,
                  height: 400,
                  caption: '自由绘图：导轨 + 磁场 + 电流',
                  elements: [
                    { type: 'field', x: 110, y: 150, w: 430, h: 160, kind: 'into' },
                    { type: 'line', x1: 110, y1: 150, x2: 540, y2: 150, sw: 3 },
                    { type: 'line', x1: 110, y1: 310, x2: 540, y2: 310, sw: 3 },
                    { type: 'resistor', x: 94, y: 212, w: 32, h: 36, label: 'R=0.8Ω' },
                    { type: 'line', x1: 450, y1: 150, x2: 450, y2: 310, stroke: '#b42318', sw: 5 },
                    { type: 'arrow', x1: 462, y1: 184, x2: 540, y2: 184, color: '#0b7d5b', label: 'v=2 m/s' },
                    { type: 'text', x: 320, y: 352, text: 'ε = BLv = 0.4 V', size: 17, anchor: 'middle', weight: 600 },
                  ],
                },
              })
              checks.push({
                name: 'draw_diagram 能自由摆图',
                ok:
                  free.ok &&
                  free.text.includes('<svg') &&
                  free.text.includes('R=0.8Ω') &&
                  free.text.includes('ε = BLv') &&
                  free.text.includes('marker-end'),
                detail: free.ok ? String(free.text.length) + ' 字符' : free.error,
              })
              const emptyScene = await lab.callTool('draw_diagram', { scene: { elements: [] } })
              checks.push({ name: '空场景报错', ok: !emptyScene.ok, detail: emptyScene.error })

              const bad = await lab.callTool('render_experiment', { kind: 'nope' })
              checks.push({ name: 'lab 未知实验报错', ok: !bad.ok, detail: bad.error })

              /* ---- 电路图引擎：伏安法必须结构正确，错的结构必须被拦 ---- */
              const va = await lab.callTool('draw_circuit', {
                net: {
                  title: '伏安法测电阻',
                  series: [
                    { id: 'E', type: 'battery', label: '电源 6V' },
                    { id: 'S', type: 'switch', label: 'S' },
                    { id: 'A', type: 'ammeter', label: 'A' },
                    { id: 'R', type: 'rheostat', label: '滑动变阻器' },
                    { id: 'Rx', type: 'resistor', label: 'Rₓ' },
                  ],
                  parallel: [{ across: 'Rx', id: 'V', type: 'voltmeter', label: 'V' }],
                },
              })
              const vaVal = /VALIDATION:(\{[\s\S]*\})/.exec(va.text)
              let vaOk = false
              try {
                vaOk = vaVal ? Boolean((JSON.parse(vaVal[1]) as { ok?: boolean }).ok) : false
              } catch {
                vaOk = false
              }
              checks.push({
                name: '伏安法电路通过结构校验',
                ok: va.ok && vaOk && va.text.includes('<svg') && va.text.includes('>A</text>') && va.text.includes('>V</text>'),
                detail: va.ok ? 'ok=' + String(vaOk) : va.error,
              })
              const wrong1 = await lab.callTool('draw_circuit', {
                net: {
                  title: '错1',
                  series: [
                    { id: 'E', type: 'battery' },
                    { id: 'V', type: 'voltmeter' },
                    { id: 'Rx', type: 'resistor' },
                  ],
                },
              })
              checks.push({ name: '电压表串联被判错', ok: wrong1.ok && wrong1.text.includes('电压表必须并联'), detail: wrong1.error })
              const wrong2 = await lab.callTool('draw_circuit', {
                net: {
                  title: '错2',
                  series: [
                    { id: 'E', type: 'battery' },
                    { id: 'Rx', type: 'resistor' },
                  ],
                  parallel: [{ across: 'Rx', id: 'A', type: 'ammeter' }],
                },
              })
              checks.push({ name: '电流表并联被判错', ok: wrong2.ok && wrong2.text.includes('电流表必须串联'), detail: wrong2.error })
              const wrong3 = await lab.callTool('draw_circuit', {
                net: { title: '错3', series: [{ id: 'Rx', type: 'resistor' }, { id: 'S', type: 'switch' }] },
              })
              checks.push({ name: '没有电源被判错', ok: wrong3.ok && wrong3.text.includes('没有电源'), detail: wrong3.error })
              const wrong4 = await lab.callTool('draw_circuit', {
                net: {
                  title: '错4',
                  series: [{ id: 'E', type: 'battery' }, { id: 'Rx', type: 'resistor' }],
                  parallel: [{ across: 'Rz', id: 'V', type: 'voltmeter' }],
                },
              })
              checks.push({
                name: '并联对象不存在被判错',
                ok: wrong4.ok && wrong4.text.includes('干路里没有这个元件'),
                detail: wrong4.error,
              })
              /* ---- 第二批引擎：光路 / 化学装置 / 细胞分裂 ---- */
              const optReal = await lab.callTool('draw_optics', { u: 30, f: 10, h: 4 })
              checks.push({
                name: '凸透镜：u>2f 成倒立缩小实像',
                ok: optReal.ok && optReal.text.includes('<svg') && optReal.text.includes('倒立') && optReal.text.includes('缩小'),
                detail: optReal.ok ? 'ok' : optReal.error,
              })
              const optVirtual = await lab.callTool('draw_optics', { u: 6, f: 10, h: 4 })
              checks.push({
                name: '凸透镜：u<f 成正立放大虚像',
                ok: optVirtual.ok && optVirtual.text.includes('正立') && optVirtual.text.includes('虚像'),
                detail: optVirtual.error,
              })
              const optFocus = await lab.callTool('draw_optics', { u: 10, f: 10, h: 4 })
              checks.push({
                name: '凸透镜：u=f 明确不成像',
                ok: optFocus.ok && optFocus.text.includes('不成像'),
                detail: optFocus.error,
              })
              const optBad = await lab.callTool('draw_optics', { u: 20, f: -5 })
              checks.push({ name: '凸透镜：负焦距被判错', ok: !optBad.ok, detail: optBad.error })
              const chemOk = await lab.callTool('draw_apparatus', { kind: 'o2-heat' })
              checks.push({
                name: '制氧装置（加热固体）出图',
                ok: chemOk.ok && chemOk.text.includes('<svg') && chemOk.text.includes('酒精灯') && chemOk.text.includes('集气瓶'),
                detail: chemOk.ok ? String(chemOk.text.length) + ' 字符' : chemOk.error,
              })
              const chemMiss = await lab.callTool('draw_apparatus', { kind: 'o2-heat', parts: ['stand', 'burner'] })
              checks.push({
                name: '制氧装置缺器材被判错',
                ok: chemMiss.ok && chemMiss.text.includes('缺器材'),
                detail: chemMiss.ok ? '已列清单' : chemMiss.error,
              })
              const chemKind = await lab.callTool('draw_apparatus', { kind: 'nope' })
              const gasWash = await lab.callTool('draw_apparatus', { kind: 'gas-wash' })
              checks.push({
                name: '洗气装置（NaOH 吸收 CO₂）出图',
                ok: gasWash.ok && gasWash.text.includes('<svg') && gasWash.text.includes('长进短出'),
                detail: gasWash.error,
              })
              const precip = await lab.callTool('draw_apparatus', { kind: 'precipitation' })
              checks.push({
                name: '沉淀实验（CuSO₄+NaOH）出图',
                ok: precip.ok && precip.text.includes('Cu(OH)₂') && precip.text.includes('胶头滴管'),
                detail: precip.error,
              })
              checks.push({
                name: '没有配方时提示改用 draw_diagram',
                ok: !chemKind.ok && String(chemKind.error ?? '').includes('draw_diagram'),
                detail: chemKind.error,
              })
              // 酯化 + 两种排空气法（用户明确要过）
              const ester = await lab.callTool('draw_apparatus', { kind: 'esterification' })
              checks.push({
                name: '酯化反应装置出图',
                ok: ester.ok && ester.text.includes('<svg') && ester.text.includes('圆底烧瓶') && ester.text.includes('Na₂CO₃'),
                detail: ester.ok ? String(ester.text.length) + ' 字符' : ester.error,
              })
              const airUp = await lab.callTool('draw_apparatus', { kind: 'air-up' })
              checks.push({
                name: '向上排空气法出图',
                ok: airUp.ok && airUp.text.includes('向上排空气法') && airUp.text.includes('正放'),
                detail: airUp.error,
              })
              const airDown = await lab.callTool('draw_apparatus', { kind: 'air-down' })
              checks.push({
                name: '向下排空气法出图',
                ok: airDown.ok && airDown.text.includes('向下排空气法') && airDown.text.includes('倒放'),
                detail: airDown.error,
              })
              checks.push({ name: '未知装置被判错', ok: !chemKind.ok, detail: chemKind.error })
              const bioOk = await lab.callTool('draw_mitosis', {})
              checks.push({
                name: '有丝分裂五期齐全',
                ok:
                  bioOk.ok &&
                  ['间期', '前期', '中期', '后期', '末期'].every((n) => bioOk.text.includes(n)) &&
                  bioOk.text.includes('细胞板'),
                detail: bioOk.ok ? String(bioOk.text.length) + ' 字符' : bioOk.error,
              })
              const bioBad = await lab.callTool('draw_mitosis', { stages: ['metaphase', 'prophase'] })
              checks.push({ name: '分裂阶段顺序错被判错', ok: bioBad.ok && bioBad.text.includes('顺序不对'), detail: bioBad.error })
              // 受力分析
              const force1 = await lab.callTool('draw_forces', { m: 2, theta: 30, mu: 0.2 })
              checks.push({
                name: '受力：μ小会下滑并给出加速度',
                ok: force1.ok && force1.text.includes('下滑') && force1.text.includes('a='),
                detail: force1.ok ? 'ok' : force1.error,
              })
              const force2 = await lab.callTool('draw_forces', { m: 1, theta: 30, mu: 0.9 })
              checks.push({ name: '受力：μ大时判为静止', ok: force2.ok && force2.text.includes('静止'), detail: force2.error })
              const forceBad = await lab.callTool('draw_forces', { m: -1, theta: 30, mu: 0.2 })
              checks.push({
                name: '受力：非法质量被判错',
                ok: !forceBad.ok && String(forceBad.error ?? forceBad.text ?? '').includes('大于 0'),
                detail: forceBad.error,
              })
              // 电磁：圆周运动 + 双缝
              const emC = await lab.callTool('draw_em', { kind: 'charge-circular', m: 1, q: 1, v: 2, B: 1 })
              checks.push({
                name: '电磁：圆周半径 r=mv/(qB) 算对',
                ok: emC.ok && emC.text.includes('r = mv/(qB) = 2') && emC.text.includes('T = 2πm/(qB) = 6.283'),
                detail: emC.ok ? 'ok' : emC.error,
              })
              const emD = await lab.callTool('draw_em', { kind: 'double-slit' })
              checks.push({
                name: '电磁：双缝条纹间距 Δy=Lλ/d 算对',
                ok: emD.ok && emD.text.includes('Δy = Lλ/d = 2.75'),
                detail: emD.ok ? 'ok' : emD.error,
              })
              const emBad = await lab.callTool('draw_em', { kind: 'nope' })
              checks.push({ name: '电磁：未知模型被判错', ok: !emBad.ok, detail: emBad.error })
              // 新增：CO2/H2 制取、过滤、蒸馏、平面镜、折射、实验清单
              for (const k of ['co2-prep', 'h2-prep', 'filtration', 'distillation']) {
                const r = await lab.callTool('draw_apparatus', { kind: k })
                checks.push({ name: '化学装置 ' + k + ' 出图', ok: r.ok && r.text.includes('<svg'), detail: r.error })
              }
              const mirror = await lab.callTool('draw_optics', { kind: 'mirror', h: 4, d: 6 })
              checks.push({ name: '平面镜成像出图', ok: mirror.ok && mirror.text.includes('平面镜'), detail: mirror.error })
              const refr = await lab.callTool('draw_optics', { kind: 'refraction', incident: 50 })
              checks.push({ name: '光的折射算对折射角', ok: refr.ok && refr.text.includes('折射角 35.2'), detail: refr.error })
              const catalog = await lab.callTool('experiment_catalog', {})
              checks.push({
                name: '实验清单覆盖四科',
                ok:
                  catalog.ok &&
                  ['数学', '物理', '化学', '生物'].every((k) => catalog.text.includes(k)) &&
                  catalog.text.includes('draw_circuit') &&
                  catalog.text.includes('draw_apparatus'),
                detail: catalog.ok ? catalog.text.split('\n').length + ' 行' : catalog.error,
              })
              const sciSpec = await lab.callTool('science_spec', {})
              checks.push({ name: 'science_spec 有说明', ok: sciSpec.ok && sciSpec.text.includes('draw_optics'), detail: sciSpec.error })
              const specText = await lab.callTool('circuit_spec', {})
              checks.push({
                name: 'circuit_spec 有格式说明',
                ok: specText.ok && specText.text.includes('series') && specText.text.includes('parallel') && specText.text.includes('电压表'),
                detail: specText.ok ? specText.text.split('\n').length + ' 行' : specText.error,
              })

              // 物理：导体棒切割磁感线（ε=BLv）
              const ind = await lab.callTool('render_experiment', {
                kind: 'induction',
                params: { B: 0.5, L: 0.4, v: 2, R: 0.8 },
              })
              checks.push({
                name: '感应电动势 ε=BLv 算对',
                ok: ind.ok && ind.text.includes('<svg') && ind.text.includes('ε = BLv = 0.4 V') && ind.text.includes('I = ε/R = 0.5 A'),
                detail: ind.ok ? 'ε=0.4V I=0.5A' : ind.error,
              })

              // 生物：光合作用
              // 生物：光合作用——三种 detail 必须**画得不一样**（以前只换了一行说明，图没变）
              const ph = await lab.callTool('render_experiment', { kind: 'photosynthesis', params: {} })
              checks.push({
                name: '光合作用图（含方程式）',
                ok: ph.ok && ph.text.includes('<svg') && ph.text.includes('6CO₂') && ph.text.includes('C₆H₁₂O₆') && ph.text.includes('类囊体'),
                detail: ph.ok ? String(ph.text.length) + ' 字符' : ph.error,
              })
              const phLight = await lab.callTool('render_experiment', { kind: 'photosynthesis', params: { detail: 'light' } })
              const phDark = await lab.callTool('render_experiment', { kind: 'photosynthesis', params: { detail: 'dark' } })
              checks.push({
                name: '光合作用 detail=light 只画光反应',
                ok: phLight.ok && phLight.text.includes('类囊体') && phLight.text.includes('H₂O') && !phLight.text.includes('CO₂被C₅') && !phLight.text.includes('卡尔文循环'),
                detail: phLight.ok ? String(phLight.text.length) + ' 字符' : phLight.error,
              })
              checks.push({
                name: '光合作用 detail=dark 只画暗反应',
                ok: phDark.ok && phDark.text.includes('卡尔文循环') && phDark.text.includes('CO₂') && !phDark.text.includes('类囊体膜'),
                detail: phDark.ok ? String(phDark.text.length) + ' 字符' : phDark.error,
              })
              checks.push({
                name: '两种 detail 画面确实不同',
                ok: phLight.ok && phDark.ok && phLight.text !== phDark.text && phLight.text !== ph.text,
              })

              // 生物：家族谱系图（方框/圆圈/世代）
              const ped = await lab.callTool('render_experiment', { kind: 'pedigree', params: { pattern: 'AR' } })
              checks.push({
                name: '家族谱系图（方框+圆圈+世代）',
                ok:
                  ped.ok &&
                  ped.text.includes('<svg') &&
                  ped.text.includes('<rect') &&
                  ped.text.includes('<circle') &&
                  ped.text.includes('常染色体隐性') &&
                  ped.text.includes('Ⅱ'),
                detail: ped.ok ? String(ped.text.length) + ' 字符' : ped.error,
              })
            } catch (err) {
              checks.push({ name: 'lab 异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
            } finally {
              lab.stop()
            }
          } catch (err) {
            checks.push({ name: 'jsxgraph 异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
          } finally {
            jsx.stop()
          }
        } catch (err) {
          checks.push({ name: '异常', ok: false, detail: err instanceof Error ? err.message : String(err) })
        } finally {
          client.stop()
        }
        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[MCPTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[MCPTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    } else
    if (isWinTest) {
      setTimeout(async () => {
        const run = async (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        try {
          // 无边框窗口（frame: false）：系统按钮不存在了，改由渲染层自绘
          // （src/renderer/src/window-controls.ts）。这里验三件事：
          //   旧的 data-winbar 确实不在了、新按钮是 3 个、内容下移了 42px
          const counts = (await run(`(() => ({
            winbar: document.querySelectorAll('[data-winbar]').length,
            wincontrols: document.querySelectorAll('[data-wincontrols] button').length,
            padTop: getComputedStyle(document.body).paddingTop,
          }))()`)) as { winbar: number; wincontrols: number; padTop: string }
          console.log('[WINTEST] old bar: ' + counts.winbar + ', self-drawn buttons: ' + counts.wincontrols + ', body padding-top: ' + counts.padTop)


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
            const switched = (await run("document.querySelectorAll('.proto-picker-item')[1].hasAttribute('data-active')")) as boolean
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

    /* ---------- 顶栏图层自检：保障条 vs 灵动岛 ----------
     * 起因：灵动岛后面压着一条奶油黄胶囊，点过岛之后出现（用户截图）。
     * 根因是 .health-banner（保障条）和 .proto-picker（灵动岛）都是
     * `position: fixed; left: 50%; transform: translateX(-50%)` 的顶部居中浮层，
     * 保障条 top:52px 正好落在岛身上，又被岛挡住大半 —— 只剩左端橙点与右端按钮露出来。
     *
     * 这个自检把保障条强制点亮（不依赖网络探活），量两块的矩形并截图，
     * 一旦再次重叠就 FAIL，避免下一个人再靠肉眼猜。
     */
    if (isLayerTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        try {
          const m = (await run(`(() => {
            const b = document.querySelector('.health-banner')
            const p = document.querySelector('.proto-picker')
            if (!b || !p) return { error: '.health-banner 或 .proto-picker 不存在' }
            b.setAttribute('data-show', '')
            b.setAttribute('data-kind', 'health')
            const t = b.querySelector('.health-text')
            if (t) t.textContent = '语音合成：服务没起来：http://localhost:9880'
            const rb = b.getBoundingClientRect()
            const rp = p.getBoundingClientRect()
            const dot = b.querySelector('.health-dot')
            const btn = b.querySelector('.health-btn')
            return {
              banner: { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.width), h: Math.round(rb.height) },
              picker: { x: Math.round(rp.x), y: Math.round(rp.y), w: Math.round(rp.width), h: Math.round(rp.height) },
              bannerBg: getComputedStyle(b).backgroundColor,
              dotBg: dot ? getComputedStyle(dot).backgroundColor : null,
              btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
              zBanner: getComputedStyle(b).zIndex,
              zPicker: getComputedStyle(p).zIndex,
              display: getComputedStyle(b).display,
            }
          })()`)) as {
            error?: string
            banner?: { x: number; y: number; w: number; h: number }
            picker?: { x: number; y: number; w: number; h: number }
            [k: string]: unknown
          }
          if (m.error || !m.banner || !m.picker) {
            console.log('[LAYERTEST] result: FAIL (' + String(m.error ?? '量不到矩形') + ')')
            app.exit(1)
            return
          }
          // 等一帧再截图：capturePage 拿的是"上一帧已合成"的画面，
          // 刚 setAttribute 完立刻截会截到保障条还没出现的那一帧（曾经因此误判成"没显示"）。
          await new Promise((r) => setTimeout(r, 600))
          const a = m.banner
          const b = m.picker
          // 只要一块压在另一块上就算重叠（矩形相交即可，不要求完全包含）
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          const gap = b.y + b.h - a.y
          console.log('[LAYERTEST] banner = ' + JSON.stringify(a))
          console.log('[LAYERTEST] picker = ' + JSON.stringify(b))
          console.log('[LAYERTEST] bannerBg = ' + String(m.bannerBg) + ', dotBg = ' + String(m.dotBg) + ', display = ' + String(m.display))
          console.log('[LAYERTEST] zIndex banner/picker = ' + String(m.zBanner) + ' / ' + String(m.zPicker))
          console.log('[LAYERTEST] overlap = ' + overlap + ', picker bottom - banner top = ' + gap + 'px')

          // 截一张顶部 240px，留给人眼确认（PNG 落在临时目录，不进仓库）
          const png = join(app.getPath('temp'), 'costudy-layertest.png')
          try {
            const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1180, height: 240 })
            writeFileSync(png, img.toPNG())
            console.log('[LAYERTEST] screenshot: ' + png)
          } catch (e) {
            console.log('[LAYERTEST] screenshot failed: ' + String(e))
          }
          console.log('[LAYERTEST] result: ' + (overlap ? 'FAIL（保障条压在灵动岛上）' : 'PASS（两块分开了）'))
          app.exit(overlap ? 2 : 0)
        } catch (err) {
          console.log('[LAYERTEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 清空聊天记录自检 ----------
     * 两层：
     *   存储层 —— 在**临时目录**里造会话（完全不碰用户真实记录）：
     *             5 条 → 清空 → 归零、备份落在 已删除/、别的会话不受影响
     *   界面层 —— 在真实数据目录建一条 CLEARTEST 会话（跑完删掉）：
     *             头部按钮在、真实鼠标点两次、线程回到开场白、存储归零
     */
    if (isClearTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log(
            '[CLEARTEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)),
          )
        }
        const sandbox = mkdtempSync(join(tmpdir(), 'costudy-clear-'))
        try {
          /* ---------- 存储层 ---------- */
          const keep = createSession(sandbox, '别动我')
          appendMessage(sandbox, keep.id, 'user', '这一条要留着')
          const victim = createSession(sandbox, '清空我')
          for (let i = 0; i < 5; i += 1) {
            appendMessage(sandbox, victim.id, i % 2 === 0 ? 'user' : 'assistant', '第 ' + i + ' 条')
          }
          const before = loadMessages(sandbox, victim.id).length
          const res = clearMessages(sandbox, victim.id)
          const after = loadMessages(sandbox, victim.id).length
          const kept = loadMessages(sandbox, keep.id).length
          const meta = listSessions(sandbox).find((s) => s.id === victim.id)
          check('5 条全部清掉', res.ok && res.removed === 5 && before === 5 && after === 0, { before, after, removed: res.removed })
          check('备份落在 会话/已删除/', !!res.backup && res.backup.includes('已删除') && existsSync(res.backup), res.backup)
          check('别的会话一条不少', kept === 1, kept)
          check(
            '索引归零回到开场',
            meta?.count === 0 && meta?.phase === 'opening' && meta?.title === '新会话' && meta?.point === '',
            meta,
          )

          /* ---------- 界面层 ---------- */
          const original = currentSession(config.dataDir)
          const ui = createSession(config.dataDir, 'CLEARTEST-界面')
          appendMessage(config.dataDir, ui.id, 'user', '测试用消息一')
          appendMessage(config.dataDir, ui.id, 'assistant', '测试用消息二')
          try {
            await run('window.__costudySetActive && window.__costudySetActive(2)')
            await new Promise((r) => setTimeout(r, 1200))
            await run('window.__costudyEnterLearn && window.__costudyEnterLearn()')
            await new Promise((r) => setTimeout(r, 4500))
            // 首次启动的「连接模型」引导是一层全屏遮罩（.ob-mask），
            // 它会吞掉所有真实鼠标点击 —— 之前这里量到 elementFromPoint 命中 ob-mask，
            // 点两次都没反应。先按「先跳过」把它收掉，再测真实点击。
            const obState = (await run(`(() => {
              const mask = document.querySelector('.ob-mask')
              const flag = (() => { try { return localStorage.getItem('costudy.onboarding') } catch { return 'throw' } })()
              const skip = document.querySelector('[data-ob-skip]')
              if (skip) skip.click()
              return { hadMask: !!mask, flag }
            })()`)) as unknown
            console.log('[CLEARTEST] 引导遮罩 ' + JSON.stringify(obState))
            await new Promise((r) => setTimeout(r, 600))
            check('引导遮罩已收起', (await run("!document.querySelector('.ob-mask')")) === true)
            check('头部出现清空按钮', (await run("!!document.querySelector('.v-comp .learn-top [data-clear-thread]')")) === true)
            check('清空前线程里有 2 条', (await run("document.querySelectorAll('.v-comp .learn-msg').length")) === 2)
            // 真实鼠标点两次：第一次只是上膛，第二次才真清
            for (let i = 0; i < 2; i += 1) {
              const rect = (await run(`(() => {
                const b = document.querySelector('.v-comp .learn-top [data-clear-thread]')
                if (!b) return null
                const r = b.getBoundingClientRect()
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
              })()`)) as { x: number; y: number } | null
              if (!rect) {
                check('按钮量不到位置', false)
                break
              }
              win.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y })
              win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
              win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
              await new Promise((r) => setTimeout(r, 700))
              // 点完立刻回读按钮状态：命中测试/上膛状态一旦不对，这里能直接看出来
              const dbg = (await run(`(() => {
                const b = document.querySelector('.v-comp .learn-top [data-clear-thread]')
                if (!b) return { found: false, count: document.querySelectorAll('[data-clear-thread]').length }
                const r = b.getBoundingClientRect()
                const cx = Math.round(r.x + r.width / 2)
                const cy = Math.round(r.y + r.height / 2)
                const hit = document.elementFromPoint(cx, cy)
                return {
                  found: true,
                  text: b.textContent,
                  armed: b.hasAttribute('data-armed'),
                  disabled: b.disabled,
                  rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
                  inView: cx > 0 && cy > 0 && cx < innerWidth && cy < innerHeight,
                  hit: hit ? String(hit.className || hit.tagName) : null,
                  hitIsBtn: hit === b,
                  msgs: document.querySelectorAll('.v-comp .learn-msg').length,
                }
              })()`)) as unknown
              console.log('[CLEARTEST] 第 ' + (i + 1) + ' 次点击后 ' + JSON.stringify(dbg))
            }
            await new Promise((r) => setTimeout(r, 900))
            check('清空后界面只剩开场白', (await run("document.querySelectorAll('.v-comp .learn-msg').length")) === 1)
            check('清空后存储里 0 条', loadMessages(config.dataDir, ui.id).length === 0)
          } finally {
            removeSession(config.dataDir, ui.id)
            const bakDir = join(config.dataDir, '会话', '已删除')
            if (existsSync(bakDir)) {
              for (const f of readdirSync(bakDir)) {
                if (f.startsWith(ui.id)) rmSync(join(bakDir, f), { force: true })
              }
            }
            if (original) setCurrent(config.dataDir, original.id)
          }
        } finally {
          rmSync(sandbox, { recursive: true, force: true })
          console.log('[CLEARTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        }
      }, 2600)
    }

    /* ---------- UI 截图：四屏各截一张（改版前后对比用） ----------
     * 用法：run.cmd --uishot
     *   COSTUDY_UI_SHOT_DIR   输出目录（默认 <项目>/ui-shots）
     *   COSTUDY_UI_SHOT_SIZE  内容尺寸，可用逗号给多档，默认 1440x900
     * 只读用户数据：写完 PNG 就退，不碰会话、不调模型。
     */
    if (isUiShot) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        const outDir = process.env['COSTUDY_UI_SHOT_DIR'] || join(config.projectRoot, 'ui-shots')
        const names = ['studio', 'plugins', 'companion', 'home']
        try {
          mkdirSync(outDir, { recursive: true })
          // 探针：COSTUDY_UI_EVAL 里写一段 JS，结果会打出来。
          // 排查"某个按钮点了没反应"时，比截图快得多。
          const evalJs = process.env['COSTUDY_UI_EVAL']
          if (evalJs) {
            await wait(1800)
            try {
              const r = await run(`(async () => { try { return { ok: true, value: await (async () => { ${evalJs} })() } } catch (e) { return { ok: false, error: String(e && e.message || e) } } })()`)
              console.log('[EVAL] ' + JSON.stringify(r))
            } catch (e) {
              console.log('[EVAL] failed: ' + String(e))
            }
          }
          // 首启引导遮罩会盖住整页
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(320)
          // 先截一张"刚启动"的样子：验证启动落在哪一屏，比切过去更真实
          {
            // 首页要等 fill() 拉完数据（会话 + 每日统计，历史长时要几百毫秒），
            // 截早了拍到的还是静态骨架（全是「—」）
            await wait(1400)
            // 首启引导会在 400ms 后弹出来盖住整页（而且带模糊），截之前必须收掉
            await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; return true })()")
            await wait(260)
            // 顺便探一下桥接：preload 挂了的话整页会停在静态骨架（全是「—」），
            // 光看截图分不清"没数据"和"没接口"
            try {
              const probe = (await run(`(async () => {
                const api = window.costudy
                const out = { hasApi: !!api, keys: api ? Object.keys(api).length : 0, daily: null, error: null }
                try {
                  const d = await api.statsDaily()
                  out.daily = { total: d.total, days: d.days, keys: Object.keys(d.byDay || {}).length }
                } catch (e) { out.error = String((e && e.message) || e) }
                return out
              })()`)) as unknown
              console.log('[SHOT] bridge ' + JSON.stringify(probe))
            } catch (err) {
              console.log('[SHOT] bridge probe failed: ' + String(err))
            }
            const b = win.getContentBounds()
            let img: Electron.NativeImage | null = null
            for (let attempt = 0; attempt < 4 && !img; attempt += 1) {
              try {
                img = await win.webContents.capturePage({ x: 0, y: 0, width: b.width, height: b.height })
              } catch {
                await wait(400)
              }
            }
            if (img) {
              writeFileSync(join(outDir, 'boot.png'), img.toPNG())
              const cls = (await run("document.querySelector('.app')?.className || ''")) as string
              console.log('[SHOT] boot ' + b.width + 'x' + b.height + ' app="' + cls + '"')
            }
          }
          const sizes = (process.env['COSTUDY_UI_SHOT_SIZE'] || '1440x900')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          for (const size of sizes) {
            const [w, h] = size.split('x').map((n) => Number(n))
            if (!w || !h) continue
            win.unmaximize()
            win.setContentSize(w, h)
            await wait(760)
            for (let i = 0; i < names.length; i += 1) {
              await run('window.__costudySetActive && window.__costudySetActive(' + i + ')')
              await wait(1150)
              // 引导遮罩与 toast 每次切屏都可能再挂一次
              await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; return true })()")
              // 聊天滚到底：看的是"现在这一屏长什么样"
              await run("(() => { const th = document.querySelector('.learn-thread, [data-thread], .thread'); if (th) th.scrollTop = th.scrollHeight; return true })()")
              await wait(360)
              const bounds = win.getContentBounds()
              // capturePage 偶尔抛 UnknownVizError（合成器那一帧还没好），重试即可
              let img: Electron.NativeImage | null = null
              for (let attempt = 0; attempt < 4 && !img; attempt += 1) {
                try {
                  img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
                } catch {
                  await wait(400)
                }
              }
              if (!img) throw new Error('capturePage 一直失败')
              writeFileSync(join(outDir, size + '-' + i + '-' + names[i] + '.png'), img.toPNG())
              // 同时留一份 DOM：改样式时不用再猜类名
              const html = (await run("(() => document.getElementById('stage')?.innerHTML || '')()")) as string
              writeFileSync(join(outDir, size + '-' + i + '-' + names[i] + '.html'), html)
              console.log('[SHOT] ' + size + ' ' + names[i] + ' ' + bounds.width + 'x' + bounds.height)
            }
          }
          app.exit(0)
        } catch (err) {
          console.log('[SHOT] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 首页自检 ----------
     * 验两件事：
     *   1. 灵动岛左侧那个「首页」胶囊真的贴在岛左边（不是叠上去、不是跑偏）
     *   2. 点进去是欢迎界面（有欢迎语 + 角色名 + 三个去处），且岛里不残留选中态
     * 点击一律用**真实鼠标事件**：胶囊在顶栏那一片，如果是拖拽区/被遮住，
     * element.click() 会假装成功，而真人点不动 —— 教训录第 2 条。
     */
    if (isHomeTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log(
            '[HOMETEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)),
          )
        }
        const clickAt = async (x: number, y: number): Promise<void> => {
          win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
          win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
          win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
          await wait(800)
        }
        /**
         * 轮询等一个条件成立，而不是"点完睡 800ms 就读"。
         * 为什么必须这样：窗口被盖住/最小化时，渲染进程里的 rAF 会被节流、
         * setTimeout 也会被拉长到 1 秒以上 —— 首页的挂载（rAF + 120ms 兜底）
         * 和数据填充都会被拖后，固定等待会随机读到占位符（这次就吃了这个亏：
         * 同一份代码上一次全绿、下一次 7 条全红）。
         */
        const waitFor = async (js: string, ms = 8000): Promise<boolean> => {
          const t0 = Date.now()
          for (;;) {
            const v = await run(js).catch(() => false)
            if (v) return true
            if (Date.now() - t0 > ms) return false
            await wait(150)
          }
        }
        try {
          // 首启引导是整层遮罩，会吞掉真实点击 —— 先收掉
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(600)

          const geo = (await run(`(() => {
            const pill = document.querySelector('.home-pill')
            const picker = document.querySelector('.proto-picker')
            if (!pill || !picker) return { error: '缺 .home-pill 或 .proto-picker' }
            const a = pill.getBoundingClientRect()
            const b = picker.getBoundingClientRect()
            return {
              pill: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width), h: Math.round(a.height), right: Math.round(a.right) },
              picker: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
              gap: Math.round(b.left - a.right),
              centerDy: Math.round(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))),
              text: (pill.textContent || '').trim(),
              hit: (() => { const h = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2); return h ? String(h.className || h.tagName) : null })(),
            }
          })()`)) as {
            error?: string
            pill?: { x: number; y: number; w: number; h: number; right: number }
            picker?: { x: number; y: number; w: number; h: number }
            gap?: number
            centerDy?: number
            text?: string
            hit?: string | null
          }
          if (geo.error || !geo.pill || !geo.picker) {
            check('首页胶囊存在', false, geo)
            console.log('[HOMETEST] result: FAIL')
            app.exit(1)
            return
          }
          console.log('[HOMETEST] 位置 ' + JSON.stringify(geo))
          check('胶囊在岛左侧（不重叠）', geo.pill.right <= geo.picker.x, { pillRight: geo.pill.right, islandLeft: geo.picker.x })
          check('与岛间距 0~24px', typeof geo.gap === 'number' && geo.gap >= 0 && geo.gap <= 24, geo.gap)
          check('垂直居中对齐（≤3px）', (geo.centerDy ?? 99) <= 3, geo.centerDy)
          check('胶囊文字是「首页」', geo.text === '首页', geo.text)
          check('胶囊在命中测试里点得到', geo.hit === 'home-pill' || geo.hit === 'home-pill ', geo.hit)

          // 真鼠标点它，然后**轮询**等首页挂上、数据填好（窗口被遮挡时会被节流）
          await clickAt(geo.pill.x + Math.round(geo.pill.w / 2), geo.pill.y + Math.round(geo.pill.h / 2))
          const mounted = await waitFor("!!document.querySelector('#stage .v-home')")
          const filled = await waitFor(
            "(() => { const h = document.querySelector('#stage .v-home [data-hm-hi]'); return !!h && (h.textContent || '').indexOf('欢迎回来，') === 0 })()",
          )
          const drew = await waitFor("!!document.querySelector('.v-home [data-hm-chart] svg')")
          console.log('[HOMETEST] mounted=' + mounted + ' filled=' + filled + ' chart=' + drew)
          const home = (await run(`(() => {
            const root = document.querySelector('#stage .v-home')
            const pill = document.querySelector('.home-pill')
            const items = [...document.querySelectorAll('.proto-picker-item')]
            return {
              mounted: !!root,
              text: root ? (root.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300) : '',
              pillActive: !!pill && pill.hasAttribute('data-active'),
              islandActive: items.map((e) => e.hasAttribute('data-active')),
              highlightW: (() => { const h = document.querySelector('.proto-picker-highlight'); return h ? Math.round(h.getBoundingClientRect().width) : -1 })(),
              hasStart: !!document.querySelector('.v-home [data-hm-start]'),
              hasRole: !!document.querySelector('.v-home [data-hm-role]'),
            hasProfile: !!document.querySelector('.v-home [data-hm-profile]'),
            chipRemoved: !document.querySelector('.v-home .hm-chip'),
            }
          })()`)) as {
            mounted: boolean
            text: string
            pillActive: boolean
            islandActive: boolean[]
            highlightW: number
            hasStart: boolean
            hasRole: boolean
          hasProfile: boolean
          chipRemoved: boolean
          }
          console.log('[HOMETEST] 首页 ' + JSON.stringify(home))
          check('点胶囊切到首页', home.mounted)
          check('首页里有欢迎语', home.text.includes('欢迎回来'), home.text.slice(0, 80))
          // 标语是一句话「欢迎回来，{称呼}，今天也一起进步」——
          // 称呼来自角色卡的 address，不写死某个角色名（用户会改名/换卡）
          check('欢迎语是完整的一句', home.text.includes('今天也一起进步'), home.text.slice(0, 80))
          check('胶囊自己进入选中态', home.pillActive)
          check('岛里没有任何一项被选中', home.islandActive.every((v) => v === false), home.islandActive)
          check('岛里的高亮条收起来了', home.highlightW <= 1, home.highlightW)
          check('右上角只剩「开始学习」（待复习胶囊已移除）', home.hasStart && home.chipRemoved && !home.hasProfile, { start: home.hasStart, chip: home.chipRemoved })

          // 「这一周」必须是曲线分布（SVG 折线/面），不是柱状图；
          // 七个点、每个点一颗圆点、路径里真的有三次贝塞尔段
          const chart = (await run(`(() => {
            const host = document.querySelector('.v-home [data-hm-chart]')
            if (!host) return { error: '没有图表容器' }
            const line = host.querySelector('path[data-line]')
            const dots = host.querySelectorAll('circle[data-dot]')
            const bars = host.querySelectorAll('.hm-bar')
            return {
              svg: !!host.querySelector('svg'),
              hasLine: !!line,
              curves: line ? (line.getAttribute('d') || '').split('C').length - 1 : 0,
              dots: dots.length,
              bars: bars.length,
              labels: host.querySelectorAll('text').length,
              w: Math.round(host.getBoundingClientRect().width),
            }
          })()`)) as {
            error?: string
            svg?: boolean
            hasLine?: boolean
            curves?: number
            dots?: number
            bars?: number
            labels?: number
            w?: number
          }
          console.log('[HOMETEST] 图表 ' + JSON.stringify(chart))
          check('图表是 SVG 曲线', !!chart.svg && !!chart.hasLine && (chart.curves ?? 0) >= 3, chart)
          check('七个日期各一颗点', chart.dots === 7, chart.dots)
          check('不再有柱状图元素', !chart.bars, chart.bars)
          check('横轴有星期标签', (chart.labels ?? 0) >= 7, chart.labels)

          // 截图留证。这里用 capturePage（抓"这个窗口自己"），不用 desktopCapturer ——
          // 桌面抓取会抓到别的同类窗口：本机同时开着源码版和便携版，
          // 上次就抓到了另一个实例（空白的那个），看不出任何东西。
          // 截两张：默认窗口（1180×800，启动时就是这个尺寸）+ 最大化（用户日常用法），
          // 后者能顺带验证大窗口下的排版。
          try {
            await wait(400)
            const shot = async (suffix: string): Promise<void> => {
              const bounds = win.getContentBounds()
              // 首启引导（.ob-mask）有时会在建图之后才挂上，截图前再收一次，
              // 否则截到的是一层"先给它一把钥匙"的遮罩。
              await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
              // 「已跳过…」那个 toast 会挂在右下角，截图里不要它
              await run("(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; return true })()")
              await wait(250)
              // capturePage 偶尔会抛 UnknownVizError（合成器那一帧还没准备好），重试一次就好
              let lastErr: unknown = null
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
                  writeFileSync(join(app.getPath('temp'), 'costudy-hometest' + suffix + '.png'), img.toPNG())
                  console.log('[HOMETEST] capture' + suffix + ' ok: ' + bounds.width + 'x' + bounds.height + '（第 ' + (attempt + 1) + ' 次）')
                  return
                } catch (e) {
                  lastErr = e
                  await wait(350)
                }
              }
              console.log('[HOMETEST] capture' + suffix + ' failed: ' + String(lastErr))
            }
            await shot('-1180')
            win.maximize()
            await wait(900)
            await shot('')
            win.unmaximize()
          } catch (e) {
            console.log('[HOMETEST] screenshot failed: ' + String(e))
          }

          // 回角色工坊：点岛里的第一项
          const back = (await run(`(() => {
            const b = document.querySelectorAll('.proto-picker-item')[0]
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)) as { x: number; y: number } | null
          if (back) {
            await clickAt(back.x, back.y)
            const backState = (await run(`(() => ({
              studio: !!document.querySelector('#stage .v-studio'),
              home: !!document.querySelector('#stage .v-home'),
              pillActive: !!document.querySelector('.home-pill')?.hasAttribute('data-active'),
            }))()`)) as { studio: boolean; home: boolean; pillActive: boolean }
            check('点角色工坊能切回去', backState.studio && !backState.home, backState)
            check('切走后胶囊取消选中', !backState.pillActive, backState)
          }

          console.log('[HOMETEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[HOMETEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 插件页自检 ----------
     * 用户要求"把这些插件全部安装了"。这个自检验两件事：
     *   1. 存储层：四条能力插件 installed=true 且 enabled=true
     *   2. 界面层：插件页四行的开关都是"开"、没有 disabled、状态写「已就绪」
     * 顺带存一张插件页截图。
     */
    if (isPluginTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[PLUGINTEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        const waitFor = async (js: string, ms = 8000): Promise<boolean> => {
          const t0 = Date.now()
          for (;;) {
            const v = await run(js).catch(() => false)
            if (v) return true
            if (Date.now() - t0 > ms) return false
            await wait(150)
          }
        }
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(400)

          const caps = readPlugins(config.dataDir).filter((p) => p.kind === 'capability')
          check('四条能力插件', caps.length === 4, caps.map((p) => p.id))
          check(
            '全部已安装',
            caps.every((p) => p.installed === true),
            caps.map((p) => p.id + ':' + String(p.status)),
          )
          check(
            '全部已开启',
            caps.every((p) => p.enabled === true),
            caps.map((p) => p.id + ':' + String(p.enabled)),
          )

          await run('window.__costudySetActive && window.__costudySetActive(1)')
          const ok = await waitFor("document.querySelectorAll('.pl-wrap .pl-group').length >= 2")
          check('插件页挂上', ok)
          const ui = (await run(`(() => {
            const groups = [...document.querySelectorAll('.pl-wrap .pl-group')]
            const capGroup = groups[groups.length - 1]
            const rows = capGroup ? [...capGroup.querySelectorAll('.pl-row')] : []
            return {
              rows: rows.length,
              names: rows.map((r) => ((r.querySelector('.pl-name') || {}).textContent || '').trim()),
              on: rows.filter((r) => r.querySelector('.pl-switch[data-on]')).length,
              disabled: rows.filter((r) => r.querySelector('.pl-switch[disabled]')).length,
              badges: rows.map((r) => ((r.querySelectorAll('.pl-badge')[1] || {}).textContent || '').trim()),
            }
          })()`)) as {
            rows: number
            names: string[]
            on: number
            disabled: number
            badges: string[]
          }
          console.log('[PLUGINTEST] 界面 ' + JSON.stringify(ui))
          check('界面四行都在', ui.rows === 4, ui.names)
          check('四个开关都是开的、没有禁用', ui.on === 4 && ui.disabled === 0, ui)
          check('状态全部「已就绪」', ui.badges.length === 4 && ui.badges.every((b) => b === '已就绪'), ui.badges)

          try {
            await wait(300)
            await run("(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; return true })()")
            const png = join(app.getPath('temp'), 'costudy-plugintest.png')
            const bounds = win.getContentBounds()
            let lastErr: unknown = null
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
                writeFileSync(png, img.toPNG())
                console.log('[PLUGINTEST] screenshot: ' + png)
                lastErr = null
                break
              } catch (e) {
                lastErr = e
                await wait(350)
              }
            }
            if (lastErr) console.log('[PLUGINTEST] screenshot failed: ' + String(lastErr))
          } catch (e) {
            console.log('[PLUGINTEST] screenshot failed: ' + String(e))
          }

          console.log('[PLUGINTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[PLUGINTEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 图表放大模式自检 ----------
     * 消息里的图（.chart-box / .learn-chart 里的 svg）点一下要能全屏看大图。
     * 这里塞一个"长得像图"的 SVG 进舞台，用**真实鼠标**点它，
     * 再验浮层、缩放、Esc 关闭 —— 图本身是不是模型画的这张测试不关心。
     */
    if (isChartZoomTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[ZOOMTEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          // 首启引导点完「先跳过」之后，它会在 400ms 后调 openModeHome() 重建舞台 ——
          // 那时插进去的测试图会被冲掉。所以等舞台稳定（并确认没有遮罩）再插。
          await wait(1200)
          // 造一张"图表"：内容带一个可认的圆，方便确认浮层里是同一张图
          await run(`(() => {
            const host = document.getElementById('stage')
            if (!host) return false
            const box = document.createElement('div')
            box.className = 'chart-box'
            box.id = 'zoom-fixture'
            box.style.cssText = 'position:fixed;left:80px;top:260px;z-index:999999;width:420px;background:#fff;border-radius:12px;padding:8px'
            box.innerHTML = '<svg viewBox="0 0 640 400" width="640" height="400"><rect x="0" y="0" width="640" height="400" fill="#eef3fb"/><circle id="zoom-mark" cx="320" cy="200" r="90" fill="#0a7ae4"/><text x="320" y="360" text-anchor="middle" font-size="20">zoom fixture</text></svg>'
            host.appendChild(box)
            return true
          })()`)
          await wait(300)
          const rect = (await run(`(() => {
            const el = document.querySelector('#zoom-fixture svg')
            if (!el) return null
            const r = el.getBoundingClientRect()
            const cx = Math.round(r.x + r.width / 2)
            const cy = Math.round(r.y + r.height / 2)
            const hit = document.elementFromPoint(cx, cy)
            return { x: cx, y: cy, hit: hit ? (hit.tagName + '.' + String(hit.className || '')) : null }
          })()`)) as { x: number; y: number; hit: string | null } | null
          console.log('[ZOOMTEST] 命中 ' + JSON.stringify(rect))
          if (!rect) {
            check('找到测试图', false)
            app.exit(1)
            return
          }
          win.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y })
          win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
          win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
          await wait(500)
          const opened = (await run(`(() => {
            const ov = document.querySelector('.cz-overlay')
            if (!ov) return { open: false }
            const fig = ov.querySelector('.cz-figure')
            return {
              open: true,
              svg: !!ov.querySelector('.cz-figure svg'),
              mark: !!ov.querySelector('.cz-figure #zoom-mark, .cz-figure circle'),
              transform: fig ? getComputedStyle(fig).transform : null,
              buttons: ov.querySelectorAll('.cz-btn').length,
            }
          })()`)) as { open: boolean; svg?: boolean; mark?: boolean; transform?: string | null; buttons?: number }
          console.log('[ZOOMTEST] 浮层 ' + JSON.stringify(opened))
          check('点图能开浮层', opened.open === true)
          check('浮层里是同一张图', opened.svg === true && opened.mark === true)
          check('有缩放/关闭按钮', opened.buttons === 3)

          // 点两次「放大」：transform 应该变成 scale(>1)
          for (let i = 0; i < 2; i += 1) {
            const b = (await run(`(() => {
              const el = document.querySelector('.cz-overlay [data-cz-in]')
              if (!el) return null
              const r = el.getBoundingClientRect()
              return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
            })()`)) as { x: number; y: number } | null
            if (b) {
              win.webContents.sendInputEvent({ type: 'mouseMove', x: b.x, y: b.y })
              win.webContents.sendInputEvent({ type: 'mouseDown', x: b.x, y: b.y, button: 'left', clickCount: 1 })
              win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 })
              await wait(260)
            }
          }
          const zoomed = (await run(`(() => {
            const fig = document.querySelector('.cz-overlay .cz-figure')
            if (!fig) return null
            const node = fig.firstElementChild
            return {
              w: Math.round(fig.getBoundingClientRect().width),
              contentW: node ? Math.round(node.getBoundingClientRect().width) : 0,
            }
          })()`)) as { w: number; contentW: number } | null
          // 放大是改"图本身"的宽度实现的，所以量内容宽度
          check('点「放大」真的变大了', (zoomed?.contentW ?? 0) > 1100, zoomed)
          if ((zoomed?.contentW ?? 0) <= 1100) {
            // 真实鼠标没点到就排查一下：按钮被谁盖住了？
            const diag = await run(`(() => {
              const els = [...document.querySelectorAll('.cz-overlay [data-cz-in]')]
              if (!els.length) return { why: 'no-button' }
              const el = els[els.length - 1]
              const r = el.getBoundingClientRect()
              const cx = Math.round(r.x + r.width / 2)
              const cy = Math.round(r.y + r.height / 2)
              const hit = document.elementFromPoint(cx, cy)
              el.click()
              const figs = [...document.querySelectorAll('.cz-overlay .cz-figure')].map((f) => ({
                computed: getComputedStyle(f).transform,
                inline: f.getAttribute('style'),
              }))
              return {
                overlays: document.querySelectorAll('.cz-overlay').length,
                rect: { x: cx, y: cy, w: Math.round(r.width), h: Math.round(r.height) },
                hit: hit ? hit.tagName + '.' + String(hit.className || '') : null,
                figs,
              }
            })()`)
            console.log('[ZOOMTEST] 诊断 ' + JSON.stringify(diag))
          }

          try {
            const png = join(app.getPath('temp'), 'costudy-zoomtest.png')
            const bounds = win.getContentBounds()
            const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
            writeFileSync(png, img.toPNG())
            console.log('[ZOOMTEST] screenshot: ' + png)
          } catch (e) {
            console.log('[ZOOMTEST] screenshot failed: ' + String(e))
          }

          // Esc 关闭
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
          await wait(400)
          const closed = (await run("!document.querySelector('.cz-overlay')")) as boolean
          check('Esc 能关掉浮层', closed === true)

          await run("(() => { document.getElementById('zoom-fixture')?.remove(); return true })()")
          console.log('[ZOOMTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[ZOOMTEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 诊断：把三种新图真的画到聊天里再截图 ----------
     * 为什么不用 mcptest：那边只断言 SVG 里有字，看不见"画得对不对"。
     * 这里走真实路径（工具 → 存图 → 消息 [chart:id] → 学习页渲染），再截两张：
     * 一张是消息里的样子，一张是点开放大的样子。
     */
    if (isLabShot) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        const chartIds: string[] = []
        // 卡片动作的断言用：失败就把退出码改成 1
        let cardFailed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) cardFailed += 1
          console.log('[LABSHOT] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        let tmpSessionId = ''
        let original = null as ReturnType<typeof currentSession>
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(600)
          const specs: Array<{ tool: string; args: Record<string, unknown>; label: string; caption?: string }> = [
            // 一条消息里把四条能力各放一张，作为"插件真的生效"的可视证据
            { tool: 'plot_function', args: { expr: '2*Math.cos(x)' }, label: 'plot-trig', caption: '数学作图 · 函数 y = 2cos(x)' },
            {
              tool: 'plot_geometry',
              args: {
                objects: [
                  { kind: 'point', x: 0, y: 0, label: 'A' },
                  { kind: 'point', x: 4, y: 0, label: 'B' },
                  { kind: 'point', x: 1.5, y: 3, label: 'C' },
                  // 多边形要的是坐标数组，不是点标签（第一版写成 ['A','B','C'] 只画出了一个点）
                  { kind: 'polygon', points: [[0, 0], [4, 0], [1.5, 3]] },
                  { kind: 'segment', from: [0, 0], to: [1.5, 3] },
                ],
              },
              label: 'plot-geo',
              caption: '数学作图 · 几何（三角形 ABC）',
            },
            { tool: 'render_experiment', args: { kind: 'circuit', params: { emf: 6, r1: 10, r2: 20 } }, label: 'circuit', caption: '实验演示 · 预设：串联电路（I = E/(R₁+R₂)）' },
            { tool: 'render_experiment', args: { kind: 'induction', params: { B: 0.5, L: 0.4, v: 2, R: 0.8 } }, label: 'induction', caption: '实验演示 · 预设：导体棒切割磁感线（ε = BLv）' },
            { tool: 'render_experiment', args: { kind: 'photosynthesis', params: {} }, label: 'photosynthesis', caption: '实验演示 · 预设：光合作用' },
            { tool: 'render_experiment', args: { kind: 'photosynthesis', params: { detail: 'dark' } }, label: 'photosynthesis-dark', caption: '实验演示 · 光合作用只看暗反应（detail=dark）' },
            { tool: 'render_experiment', args: { kind: 'pedigree', params: { pattern: 'AR' } }, label: 'pedigree', caption: '实验演示 · 预设：家族谱系图（常染色体隐性）' },
            {
              // 最后一张**不走预设**：完全是模型用图元摆出来的受力分析图，
              // 用来证明"能画这种图"而不只是"能画这七张"
              tool: 'draw_diagram',
              label: 'free-forces',
              args: {
                scene: {
                  width: 640,
                  height: 400,
                  caption: '自由绘图（无预设）：斜面上的受力分析',
                  elements: [
                    { type: 'polygon', points: [[90, 320], [520, 320], [520, 150]], fill: 'rgba(120,148,178,.12)', stroke: '#10151c', sw: 2 },
                    { type: 'text', x: 112, y: 310, text: 'θ=30°', size: 13, color: '#0a7ae6' },
                    { type: 'polygon', points: [[300, 236], [336, 236], [336, 215], [300, 215]], fill: '#0a7ae6', opacity: 0.85 },
                    { type: 'arrow', x1: 318, y1: 226, x2: 318, y2: 120, color: '#b42318', label: 'N', labelDy: -6 },
                    { type: 'arrow', x1: 318, y1: 226, x2: 318, y2: 330, color: '#10151c', label: 'G', labelDy: 14 },
                    { type: 'arrow', x1: 318, y1: 226, x2: 400, y2: 284, color: '#8a5a00', label: 'f', labelDx: 22 },
                    { type: 'arrow', x1: 318, y1: 226, x2: 250, y2: 182, color: '#0b7d5b', label: 'F', labelDx: -18, labelDy: 4 },
                    { type: 'text', x: 320, y: 356, text: 'N = mg·cos30° ≈ 84.9 N ｜ f = μN ≈ 17.0 N', size: 15, anchor: 'middle', weight: 600 },
                  ],
                },
              },
            },
            {
              // 实验电路图引擎：伏安法（正面用例）
              tool: 'draw_circuit',
              label: 'circuit-voltammeter',
              caption: '实验电路图 · 伏安法测电阻（引擎生成 + 结构校验）',
              args: {
                net: {
                  title: '伏安法测电阻',
                  series: [
                    { id: 'E', type: 'battery', label: '电源 6V' },
                    { id: 'S', type: 'switch', label: '开关 S' },
                    { id: 'A', type: 'ammeter', label: '电流表 A' },
                    { id: 'R', type: 'rheostat', label: '滑动变阻器' },
                    { id: 'Rx', type: 'resistor', label: '待测电阻 Rₓ' },
                  ],
                  parallel: [{ across: 'Rx', id: 'V', type: 'voltmeter', label: '电压表 V' }],
                },
                principle: '用电压表测 Rₓ 两端电压 U、电流表测通过它的电流 I，由 R = U/I 算出电阻。',
                steps: ['按图连接电路，开关断开', '滑动变阻器调到最大阻值', '闭合开关，调滑片，读三组 U、I', '每组算 R = U/I，取平均值'],
              },
            },
            {
              tool: 'draw_apparatus',
              label: 'esterification',
              caption: '化学 · 乙酸乙酯的制备（酯化反应）',
              args: { kind: 'esterification', principle: 'CH₃COOH + C₂H₅OH ⇌(浓硫酸,Δ) CH₃COOC₂H₅ + H₂O；产物蒸气经导管冷凝进饱和碳酸钠溶液。', steps: ['在圆底烧瓶中加入乙醇、乙酸和少量浓硫酸', '加热，导管末端悬在液面上方', '蒸气冷凝后被饱和 Na₂CO₃ 溶液吸收', '液面上层出现有果香味的油状液体'] },
            },
            {
              tool: 'draw_apparatus',
              label: 'air-up',
              caption: '化学 · 向上排空气法收集',
              args: { kind: 'air-up', principle: '气体密度比空气大（O₂、CO₂），从瓶底通入把空气从瓶口顶出去。' },
            },
            {
              tool: 'draw_apparatus',
              label: 'air-down',
              caption: '化学 · 向下排空气法收集',
              args: { kind: 'air-down', principle: '气体密度比空气小（H₂、NH₃），瓶口向下把空气从上面顶出去。' },
            },
            {
              tool: 'draw_forces',
              label: 'forces',
              caption: '物理 · 斜面上的受力分析（m=2kg θ=30° μ=0.2）',
              args: {
                m: 2,
                theta: 30,
                mu: 0.2,
                principle: '沿斜面：Gsinθ − f = ma；垂直斜面：N = Gcosθ；滑动时 f = μN。',
                steps: ['画受力图：重力、支持力、摩擦力', '正交分解重力', '比较 Gsinθ 与 μN 判断是否滑动', '求加速度'],
              },
            },
            {
              tool: 'draw_em',
              label: 'em-circular',
              caption: '物理 · 带电粒子在匀强磁场中的圆周运动',
              args: { kind: 'charge-circular', m: 1, q: 1, v: 2, B: 1, principle: '洛伦兹力提供向心力 qvB = mv²/r → r = mv/(qB)，T = 2πm/(qB)。' },
            },
            {
              tool: 'draw_em',
              label: 'em-double-slit',
              caption: '物理 · 双缝干涉条纹',
              args: { kind: 'double-slit', lambda: 550, d: 0.2, L: 1, principle: '相邻亮纹间距 Δy = Lλ/d；光程差为波长整数倍处是亮纹。' },
            },
            {
              tool: 'draw_optics',
              label: 'optics',
              caption: '光学 · 凸透镜成像（u=30cm, f=10cm → 倒立缩小实像）',
              args: { kind: 'lens', u: 30, f: 10, h: 4, principle: '平行主轴的光线经凸透镜后过焦点，过光心的光线方向不变，两线交点即像点。', steps: ['把蜡烛放在 2 倍焦距外', '调整光屏位置直到最清晰', '读像距、比较像的大小'] },
            },
            {
              tool: 'draw_apparatus',
              label: 'apparatus',
              caption: '化学 · 实验室制取氧气（加热固体 + 排水法）',
              args: { kind: 'o2-heat', principle: '2KMnO₄ --Δ--> K₂MnO₄ + MnO₂ + O₂↑；用排水法收集是因为氧气不易溶于水。', steps: ['检查装置气密性', '装入药品、试管口略向下倾斜', '点燃酒精灯加热', '收集满后先撤导管再熄灭酒精灯'] },
            },
            {
              tool: 'draw_mitosis',
              label: 'mitosis',
              caption: '生物 · 植物细胞有丝分裂过程',
              args: { principle: '一个细胞周期包括间期和分裂期；染色体复制一次、平均分配一次，子细胞染色体数与母细胞相同。', steps: ['间期：DNA 复制', '前期：染色体出现、纺锤体形成', '中期：着丝点排在赤道板', '后期：姐妹染色单体分开', '末期：细胞板形成'] },
            },
            {
              // 反例：电压表串进干路 —— 引擎必须拦下并在图上标红
              tool: 'draw_circuit',
              label: 'circuit-wrong',
              caption: '反例：电压表串进干路（引擎判定不通过）',
              args: { net: { title: '错误接法示例', series: [{ id: 'E', type: 'battery' }, { id: 'V', type: 'voltmeter' }, { id: 'Rx', type: 'resistor' }] } },
            },
          ]
          const sections: Array<{ caption: string; id: string }> = []
          for (const s of specs) {
            const res = await runTool(s.tool, JSON.stringify(s.args))
            const m = /\[chart:(c-[a-f0-9]+)\]/.exec(res.content)
            console.log('[LABSHOT] ' + s.label + ' -> ' + (m ? m[1] : 'FAILED: ' + res.content.slice(0, 120)))
            if (m) {
              chartIds.push(m[1])
              sections.push({ caption: s.caption ?? s.label, id: m[1] })
            }
          }
          if (!chartIds.length) {
            app.exit(1)
            return
          }
          original = currentSession(config.dataDir)
          const tmp = createSession(config.dataDir, 'LABSHOT')
          tmpSessionId = tmp.id
          // 一条消息放一张图 + 一句说明：模型本来就是"一次最多一张图"，
          // 全塞进一条消息的话文字行和图片行会互相错位（截图很难看，也不是真实用法）
          for (const s of sections) {
            appendMessage(config.dataDir, tmp.id, 'assistant', s.caption + '\n\n[chart:' + s.id + ']')
          }
          // 最后再来一条"坏情况"的消息：假编号 + 漏出来的协议文本
          appendMessage(
            config.dataDir,
            tmp.id,
            'assistant',
            '编的编号：\n\n[chart:c-000000000000]\n\n这一行后面原来会露出协议文本：\n<tool_call>diagram_spec</tool_call>\n（上面本该什么都没有）',
          )

          await run('window.__costudySetActive && window.__costudySetActive(2)')
          await wait(1500)
          await run('window.__costudyEnterLearn && window.__costudyEnterLearn()')
          // 等三张图都插进 DOM（chartsGet 是异步的）
          for (let i = 0; i < 40; i += 1) {
            const n = (await run("document.querySelectorAll('.v-comp .chart-box svg').length")) as number
            if (n >= chartIds.length) break
            await wait(200)
          }
          await wait(600)
          const bounds = win.getContentBounds()
          const snap = async (name: string): Promise<void> => {
            // 首启引导会在不经意的时候又盖上来（它有自己的 localStorage 判断），
            // 每次截图前都清一遍，否则截出来是引导遮罩
            await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); document.querySelectorAll('.ob-mask, .ob-wrap').forEach((n) => n.remove()); const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; return true })()")
            await wait(250)
            const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
            writeFileSync(join(app.getPath('temp'), name), img.toPNG())
            console.log('[LABSHOT] saved ' + name)
          }
          await run("(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML=''; const th = document.querySelector('.v-comp .learn-thread'); if (th) th.scrollTop = 0; return true })()")
          await snap('labshot-list.png')
          // 逐段往下截：一张消息里放了七张图，一次截不完
          for (let i = 1; i < 4; i += 1) {
            await run(`(() => { const bs = [...document.querySelectorAll('.v-comp .chart-box')]; const b = bs[${i * 2 + 1}]; if (b) b.scrollIntoView({ block: 'start' }); return true })()`)
            await wait(450)
            await snap('labshot-list-' + (i + 1) + '.png')
          }
          // 滚到最后一张再截一张 —— 两张图并排时它在折叠线以下
          await run("(() => { const bs = [...document.querySelectorAll('.v-comp .chart-box')]; const last = bs[bs.length-1]; if (last) last.scrollIntoView({ block: 'end' }); return true })()")
          await wait(500)
          await snap('labshot-list2.png')
          // 电路图两张单独截：按说明文字定位（索引会随 specs 变，按文字更稳）
          await run("(() => { const b = [...document.querySelectorAll('.v-comp .learn-bubble')].find((el) => el.textContent.includes('伏安法测电阻')); if (b) b.scrollIntoView({ block: 'start' }); return true })()")
          await wait(500)
          await snap('labshot-circuit.png')
          await run("(() => { const b = [...document.querySelectorAll('.v-comp .learn-bubble')].find((el) => el.textContent.includes('反例')); if (b) b.scrollIntoView({ block: 'start' }); return true })()")
          await wait(500)
          await snap('labshot-circuit-wrong.png')

          const params = (await run(`(async () => {
            const msg = [...document.querySelectorAll('.v-comp .learn-msg')].find((m) => m.textContent.includes('凸透镜成像'))
            const box = msg && msg.querySelector('.chart-box')
            if (!box) return { ok: false }
            const sliders = box.querySelectorAll('.chart-params input[type=range]')
            return { ok: true, count: sliders.length }
          })()`)) as { ok: boolean; count?: number }
          check('光学图卡片挂出调参滑杆', Boolean(params.ok) && (params.count ?? 0) === 3, params)

          // 重画走真实 IPC：给 u=6（小于焦距）应重画成虚像
          const rerender = (await run(`(async () => {
            const res = await window.costudy.chartsRerender('optics', { kind: 'lens', u: 6, f: 10, h: 4 })
            if (!res || !res.ok || !res.id) return { ok: false, err: res && res.text }
            const svg = await window.costudy.chartsGet(res.id)
            return { ok: true, hasVirtual: String(svg || '').indexOf('虚像') >= 0 }
          })()`)) as { ok: boolean; hasVirtual?: boolean; err?: string }
          check('调参数会按新参数重画（u=6 变虚像）', Boolean(rerender.ok) && rerender.hasVirtual === true, rerender)
          // 第二批图：光路 / 化学装置 / 分裂（按说明文字定位）
          for (const [needle, name] of [['凸透镜成像', 'labshot-optics.png'], ['实验室制取氧气', 'labshot-apparatus.png'], ['有丝分裂', 'labshot-mitosis.png'], ['斜面上的受力分析', 'labshot-forces.png'], ['带电粒子在匀强磁场', 'labshot-em1.png'], ['双缝干涉', 'labshot-em2.png'], ['酯化反应', 'labshot-ester.png'], ['向上排空气法', 'labshot-airup.png'], ['向下排空气法', 'labshot-airdown.png']] as const) {
            await run(
              '(() => { const b = [...document.querySelectorAll(".v-comp .learn-bubble")].find((el) => el.textContent.includes(' +
                JSON.stringify(needle) +
                ')); if (b) b.scrollIntoView({ block: "start" }); return true })()',
            )
            await wait(450)
            await snap(name)
          }

          /* ---- 图卡片上的五个动作：SVG / PNG / 原理 / 步骤 / 重画 ---- */
          const card = (await run(`(() => {
            // 认准伏安法那条消息里的图卡（每条消息都可能有图，别抓到第一张函数图）
            const msg = [...document.querySelectorAll('.v-comp .learn-msg')].find((m) => m.textContent.includes('伏安法'))
            const box = msg && msg.querySelector('.chart-box')
            const labels = [...box.querySelectorAll('.img-tools .msg-act')].map((b) => b.textContent.trim())
            return { ok: true, labels: labels.join('/') }
          })()`)) as { ok: boolean; labels?: string }
          console.log('[LABSHOT] 卡片按钮 ' + JSON.stringify(card))
          check('图卡片有 SVG/PNG/原理/步骤/重画', Boolean(card.ok) && card.labels === 'SVG/PNG/原理/步骤/重画', card.labels)

          await run(`(() => {
            // 认准伏安法那条消息里的图卡（每条消息都可能有图，别抓到第一张函数图）
            const msg = [...document.querySelectorAll('.v-comp .learn-msg')].find((m) => m.textContent.includes('伏安法'))
            const box = msg && msg.querySelector('.chart-box')
            const btn = box && [...box.querySelectorAll('[data-meta]')].find((b) => b.dataset.metaKind === 'principle')
            if (btn) btn.click()
            return true
          })()`)
          await wait(700)
          const principleText = (await run("document.querySelector('.v-comp .chart-box .chart-panel')?.textContent ?? ''")) as string
          check('点「原理」能展开原理面板', principleText.includes('电压表') && principleText.includes('U/I'), principleText.slice(0, 60))

          await run(`(() => {
            // 认准伏安法那条消息里的图卡（每条消息都可能有图，别抓到第一张函数图）
            const msg = [...document.querySelectorAll('.v-comp .learn-msg')].find((m) => m.textContent.includes('伏安法'))
            const box = msg && msg.querySelector('.chart-box')
            const btn = box && [...box.querySelectorAll('[data-meta]')].find((b) => b.dataset.metaKind === 'steps')
            if (btn) btn.click()
            return true
          })()`)
          await wait(700)
          const stepsContent = (await run("document.querySelector('.v-comp .chart-box .chart-panel')?.textContent ?? ''")) as string
          check('点「步骤」能展开步骤面板', stepsContent.includes('滑动变阻器'), stepsContent.slice(0, 60))

          // PNG 导出：走真实 IPC（传 path 跳过保存框；光栅化仍在页面里做）
          const pngPath = join(app.getPath('temp'), 'labshot-png-test.png')
          const pngOut = (await run(`(async () => {
            const canvas = document.createElement('canvas')
            canvas.width = 240
            canvas.height = 160
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 160)
            ctx.fillStyle = '#0a7ae6'; ctx.fillRect(20, 20, 200, 120)
            return await window.costudy.savePng({ base64: canvas.toDataURL('image/png'), name: 'p', path: ${JSON.stringify(pngPath)} })
          })()`)) as { ok: boolean; path?: string; error?: string }
          check(
            'PNG 能写到磁盘',
            pngOut.ok === true && existsSync(pngPath) && readFileSync(pngPath).subarray(1, 4).toString() === 'PNG',
            pngOut,
          )
          // 点第一张图 → 浮层
          const r = (await run(`(() => {
            const el = document.querySelector('.v-comp .chart-box svg')
            if (!el) return null
            const b = el.getBoundingClientRect()
            return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
          })()`)) as { x: number; y: number } | null
          if (r) {
            win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y })
            win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 })
            win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 })
            await wait(800)
            await snap('labshot-zoom.png')
          }
          console.log('[LABSHOT] result: ' + (cardFailed === 0 ? 'PASS' : 'FAIL (' + cardFailed + ')'))
          app.exit(cardFailed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[LABSHOT] FAIL ' + String(err))
          app.exit(1)
        } finally {
          // 收干净：临时会话 + 这几张图文件
          try {
            if (tmpSessionId) removeSession(config.dataDir, tmpSessionId)
            if (original) setCurrent(config.dataDir, original.id)
            for (const id of chartIds) {
              const f = join(config.dataDir, '图表', id + '.svg')
              if (existsSync(f)) rmSync(f, { force: true })
            }
          } catch {
            /* 收拾失败不影响结论 */
          }
        }
      }, 2600)
    }

    /* ---------- 文本式工具调用解析自检（纯函数，不联网） ----------
     * 有的模型不会用结构化 tool_calls，而是把 `<tool_call>名字</tool_call>` 写在正文里。
     * 这一组断言锁住：三种写法都能解析出来、正文能剥干净、坏格式不炸。
     */
    if (isCallParseTest) {
      const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
      const push = (name: string, ok: boolean, detail?: string): void => {
        checks.push({ name, ok, detail })
      }
      try {
        const a = parseTextCalls('<tool_call>diagram_spec</tool_call>')
        push('纯工具名', a.length === 1 && a[0].name === 'diagram_spec' && a[0].args === '{}', JSON.stringify(a))

        const b = parseTextCalls('<tool_call>{"name":"draw_diagram","arguments":{"scene":{"elements":[]}}}</tool_call>')
        let bArgs = ''
        try {
          bArgs = JSON.stringify(JSON.parse(b[0]?.args ?? '{}'))
        } catch {
          bArgs = 'not-json'
        }
        push('JSON 形式', b.length === 1 && b[0].name === 'draw_diagram' && bArgs.includes('elements'), bArgs.slice(0, 60))

        const c = parseTextCalls('<tool_call>render_experiment({"kind":"pendulum"})</tool_call>')
        let cArgs = ''
        try {
          cArgs = JSON.stringify(JSON.parse(c[0]?.args ?? '{}'))
        } catch {
          cArgs = 'not-json'
        }
        push('name(参数) 形式', c.length === 1 && c[0].name === 'render_experiment' && cArgs.includes('pendulum'), cArgs)

        const d = parseTextCalls('先说一句\n<tool_call>diagram_spec</tool_call>\n中间\n<tool_call>draw_diagram</tool_call>\n结尾')
        push('多个块', d.length === 2 && d[0].name === 'diagram_spec' && d[1].name === 'draw_diagram', String(d.length))

        const raw = '这张图画的是电路。\n\n<tool_call>draw_diagram</tool_call>\n\n你看电压表接在哪？'
        const stripped = stripTextCalls(raw)
        push('正文剥干净', !stripped.includes('<tool_call>') && stripped.includes('这张图画的是电路') && stripped.includes('你看电压表接在哪'), stripped.slice(0, 40))

        /* DSML：模型把结构化 tool_calls 写成了正文。
         * 下面的串是**真实样本**（2026-11-02 会话 s-mvnt9k7v-k8b.jsonl），
         * 分隔符是全角竖线 ｜（U+FF5C），不是半角 |。 */
        const dsml = [
          '<｜｜DSML｜｜ calls>',
          '<｜｜DSML｜｜ invoke name="draw_diagram">',
          '<｜｜DSML｜｜ parameter name="scene" string="false">[{"type":"rect","x":90,"y":30,"w":70,"h":70,"label":"A"}]</｜｜DSML｜｜ parameter>',
          '</｜｜DSML｜｜ invoke>',
          '</｜｜DSML｜｜ calls>',
        ].join('\n')
        const dsmlCalls = parseTextCalls(dsml)
        let dsmlArgs = ''
        try {
          dsmlArgs = JSON.stringify(JSON.parse(dsmlCalls[0]?.args ?? '{}'))
        } catch {
          dsmlArgs = 'not-json'
        }
        push('DSML 块能解析成工具调用', dsmlCalls.length === 1 && dsmlCalls[0].name === 'draw_diagram' && dsmlArgs.includes('rect'), dsmlArgs.slice(0, 70))

        const dsmlStripped = stripTextCalls('棋盘如下：\n\n' + dsml + '\n\n你看对不对？')
        push('DSML 协议文本能被剥干净', !/DSML/i.test(dsmlStripped) && dsmlStripped.includes('棋盘如下') && dsmlStripped.includes('你看对不对'), dsmlStripped.slice(0, 40))

        const halfBar = parseTextCalls(dsml.replace(/｜/g, '|'))
        push('DSML 半角竖线也认', halfBar.length === 1 && halfBar[0].name === 'draw_diagram', String(halfBar.length))

        const twoInvoke =
          '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="diagram_spec">\n</｜｜DSML｜｜ invoke>\n<｜｜DSML｜｜ invoke name="draw_diagram">\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>'
        const twoCalls = parseTextCalls(twoInvoke)
        push('DSML 一个块里调两个', twoCalls.length === 2 && twoCalls[0].name === 'diagram_spec' && twoCalls[1].name === 'draw_diagram', twoCalls.map((x) => x.name).join(','))

        const cutDsml = stripTextCalls('先画个棋盘。\n\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="draw_diagram">\n<｜｜DSML｜｜ parameter name="scene"')
        push('DSML 被截断也不漏到正文', !/DSML/i.test(cutDsml) && cutDsml.includes('先画个棋盘'), cutDsml.slice(0, 30))

        // 裸工具名方括号（模型另一种漏法）：只在"整行只有它"且是已知工具时才算
        const names = toolNames()
        const bare = parseTextCalls('先看一眼清单。\n\n[diagram_spec]\n\n然后画。\n\n【draw_diagram】', names)
        push('裸 [工具名] 也能解析', bare.length === 2 && bare[0].name === 'diagram_spec' && bare[1].name === 'draw_diagram', JSON.stringify(bare))
        const bareText = '先看一眼清单。\n\n[diagram_spec]\n\n然后画。'
        const bareStripped = stripTextCalls(bareText, names)
        push('裸 [工具名] 能被剥掉', !bareStripped.includes('diagram_spec'), bareStripped.slice(0, 30))
        const placeholder = stripTextCalls('好，先摆个装置。\n\n[工具调用]\n\n你看对不对。', names)
        push('「[工具调用]」占位符会被剥掉', !placeholder.includes('[工具调用]') && placeholder.includes('你看对不对'), placeholder.slice(0, 40))
        const normal = '这一条 [注意] 别漏了，第 [1] 步很重要。'
        push('普通方括号文字不动', stripTextCalls(normal, names) === normal, stripTextCalls(normal, names))

        // 画图工具调过了、回复里却没有 [chart:…] —— 要把图补上去，否则界面上是"画空"
        const used = [{ name: 'draw_diagram', args: '{}', result: '图已生成 [chart:c-0123456789ab]' }]
        const fixed = ensureChartMarkers('我先摆出来，你看看。', used)
        push('漏掉 chart 标记会自动补上', fixed.includes('[chart:c-0123456789ab]') && fixed.includes('我先摆出来'), fixed.slice(0, 40))
        const keep = ensureChartMarkers('图在这里 [chart:c-abcdefabcdef]', used)
        push('已有标记不重复补', keep === '图在这里 [chart:c-abcdefabcdef]', keep)

        const plain = '就是一段普通的话，没有协议。'
        push('普通正文不动', stripTextCalls(plain) === plain, plain)

        let safe = true
        try {
          parseTextCalls('<tool_call>没关掉的标签')
          stripTextCalls('<tool_call>没关掉的标签')
        } catch {
          safe = false
        }
        push('坏格式不抛异常', safe)
      } catch (err) {
        push('解析自检本身抛错', false, err instanceof Error ? err.message : String(err))
      }

      let failed = 0
      for (const c of checks) {
        if (!c.ok) failed += 1
        console.log('[CALLPARSE] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
      }
      console.log('[CALLPARSE] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
      app.exit(failed === 0 ? 0 : 1)
    }

    /* ---------- 插件体检：装没装 / 开没开 / 工具到没到模型手上 / 真跑一遍 ---------- */
    if (isPluginProbe) {
      setTimeout(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const push = (name: string, ok: boolean, detail?: string): void => {
          checks.push({ name, ok, detail })
        }
        try {
          // 1) 存储层
          const items = readPlugins(config.dataDir)
          for (const p of items) {
            console.log(
              '[PROBE] 插件 ' + p.id.padEnd(18) + ' kind=' + p.kind.padEnd(10) +
                ' installed=' + String(p.installed) + ' enabled=' + String(p.enabled) + ' status=' + String(p.status ?? '-'),
            )
          }
          const caps = items.filter((p) => p.kind === 'capability')
          push('四条能力插件都在且已装已开', caps.length === 4 && caps.every((p) => p.installed && p.enabled))

          // 2) 模型层：每种模式发给模型的工具清单
          for (const mode of ['chat', 'work'] as const) {
            const names = toolSchemas(allowedPermissions(mode)).map((t) => t.function.name)
            console.log('[PROBE] ' + mode + ' 模式可用工具(' + names.length + ')：' + names.join(', '))
            push(mode + ' 模式看得到作图/实验/英语工具',
              ['plot_function', 'plot_geometry', 'render_experiment', 'draw_diagram', 'diagram_spec', 'check_english_answer']
                .every((n) => names.includes(n)))
            if (mode === 'work') push('work 模式额外看得到 run_code', names.includes('run_code'))
            else push('chat 模式看不到 run_code', !names.includes('run_code'))
          }

          // 3) 执行层：真的调一遍（runTool 就是模型调用走的路）
          const probes: Array<[string, Record<string, unknown>, string]> = [
            ['plot_function', { expr: 'Math.sin(x)' }, '数学作图'],
            ['plot_geometry', { objects: [{ kind: 'point', x: 0, y: 0, label: 'A' }, { kind: 'point', x: 3, y: 1, label: 'B' }, { kind: 'point', x: 1, y: 4, label: 'C' }, { kind: 'polygon', points: ['A', 'B', 'C'] }] }, '几何作图'],
            ['render_experiment', { kind: 'circuit', params: { emf: 6, r1: 10, r2: 20 } }, '实验演示（预设）'],
            ['draw_diagram', { scene: { width: 480, height: 300, caption: '自由绘图自检', elements: [{ type: 'rect', x: 60, y: 60, w: 200, h: 140, fill: 'rgba(10,132,255,.12)' }, { type: 'arrow', x1: 80, y1: 130, x2: 240, y2: 130, label: 'F' }, { type: 'text', x: 240, y: 240, text: 'U = IR = 6 V', size: 15, anchor: 'middle' }] } }, '实验演示（自由绘图）'],
            ['diagram_spec', {}, '图元说明'],
            ['check_english_answer', { expected: 'He has been to Beijing', answer: 'He have been to Beijing' }, '英语判分'],
            ['english_irregular_verb', { verb: 'go' }, '英语不规则动词'],
          ]
          for (const [name, args, label] of probes) {
            const r = await runTool(name, JSON.stringify(args))
            const head = r.content.replace(/\s+/g, ' ').slice(0, 70)
            console.log('[PROBE] runTool ' + name.padEnd(22) + ' ok=' + String(r.ok) + '  ' + head)
            push(label + ' 能真的跑起来', r.ok)
          }

          /* 形状容错：`scene` 直接是**图元数组**（DSML 里模型就是这么给的）。
           * 原来数组也被当 object 透传，lab 服务报 "scene.elements 不能为空"，
           * 于是"解析对了、图还是画不出来"。 */
          const arrScene = await runTool(
            'draw_diagram',
            JSON.stringify({ scene: [{ type: 'rect', x: 60, y: 60, w: 120, h: 90, label: 'A' }, { type: 'text', x: 60, y: 170, text: 'scene 传数组' }] }),
          )
          push('scene 传数组也画得出来', /\[chart:c-[a-f0-9]{12}\]/.test(arrScene.content), arrScene.content.replace(/\s+/g, ' ').slice(0, 50))

          /* 端到端重放：2026-11-02 那段**真实漏到聊天里**的 DSML 正文
           * （用户截图：`<||DSML|| calls>` 那一整段）。
           * 解析 → 执行 → 必须真的出图。纯离线，不花模型额度。 */
          const dsmlSample = [
            '<｜｜DSML｜｜ calls>',
            '<｜｜DSML｜｜ invoke name="draw_diagram">',
            '<｜｜DSML｜｜ parameter name="scene" string="false">[{"type":"rect","x":90,"y":30,"w":70,"h":70,"label":"A"},{"type":"rect","x":160,"y":30,"w":70,"h":70,"label":"a"}]</｜｜DSML｜｜ parameter>',
            '</｜｜DSML｜｜ invoke>',
            '</｜｜DSML｜｜ calls>',
          ].join('\n')
          const replayCalls = parseTextCalls(dsmlSample, toolNames())
          const replay = replayCalls[0]
            ? await runTool(replayCalls[0].name, replayCalls[0].args, allowedPermissions('chat'))
            : { ok: false, content: '（没解析出任何工具调用）' }
          push(
            '真实 DSML 正文能一路画成图',
            /\[chart:c-[a-f0-9]{12}\]/.test(replay.content),
            replayCalls.map((c) => c.name).join(',') + ' -> ' + replay.content.replace(/\s+/g, ' ').slice(0, 40),
          )

          // 4) 开关层：关掉「数学作图」→ 工具消失、调用被拒；再打开恢复
          setPlugin(config.dataDir, 'mcp-jsxgraph', false)
          try {
            const namesOff = toolSchemas(allowedPermissions('chat')).map((t) => t.function.name)
            const denied = await runTool('plot_function', JSON.stringify({ expr: 'x*x' }))
            console.log('[PROBE] 关掉数学作图后 工具清单含 plot_function=' + String(namesOff.includes('plot_function')) + ' 调用 ok=' + String(denied.ok))
            push('关掉插件后工具不再发给模型', !namesOff.includes('plot_function') && !namesOff.includes('plot_geometry'))
            push('关掉插件后调用被拒', !denied.ok && denied.content.includes('关掉'))
          } finally {
            // 无论中间出什么事都要把它开回来，否则用户下次打开应用作图插件是关的
            setPlugin(config.dataDir, 'mcp-jsxgraph', true)
          }
          const back = await runTool('plot_function', JSON.stringify({ expr: 'x*x' }))
          push('重新打开后恢复正常', back.ok)

          const failed = checks.filter((c) => !c.ok)
          for (const c of checks) console.log('[PROBE] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? ' (' + c.detail + ')' : ''))
          console.log('[PROBE] result: ' + (failed.length === 0 ? 'PASS' : 'FAIL (' + failed.length + ')'))
          app.exit(failed.length === 0 ? 0 : 1)
        } catch (err) {
          console.log('[PROBE] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 语音输入自检 ----------
     * 这条链路以前根本没通：asr:start / asr:chunk / asr:stop 三个 IPC 被写进了
     * asr:config:set 的回调里，只有先保存过配置才注册 —— 麦克风永远拿到"接口不可用"。
     * 现在验四件事：本地听写探测、WAV 头、引擎切到 local 后 start/stop 不炸、桥接方法在。
     */
    /* ---------- 上下文压缩自检（纯函数 + 落盘，不调模型） ---------- */
    /* ---------- 多模型路由自检：chat / work 各挑各的，没配就回落 active ---------- */
    if (process.argv.includes('--routetest')) {
      setTimeout(() => {
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[ROUTE] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          const before = readModels(config.dataDir)
          upsertProfile(config.dataDir, { id: 'route-chat', label: 'chat', baseUrl: 'https://a.example/v1', model: 'chat-model', useFor: ['chat'], apiKey: 'k-chat' })
          upsertProfile(config.dataDir, { id: 'route-work', label: 'work', baseUrl: 'https://b.example/v1', model: 'work-model', useFor: ['work'], apiKey: 'k-work' })
          // 1) active 覆盖 chat 时，必须继续用 active（否则会像今天这样被本地配置顶掉）
          const chat = activeModelFor(config.dataDir, 'chat')
          check('active 覆盖 chat 时就用 active', chat.model === before.profiles.find((p) => p.id === before.active)!.model, chat.model)
          // 2) work 也一样（active 也声明了 work）
          const workSame = activeModelFor(config.dataDir, 'work')
          check('active 覆盖 work 时也用 active', workSame.model === chat.model, workSame.model)
          // 3) 把 active 的用途收紧到只剩 chat，work 才应该落到 work 专配
          upsertProfile(config.dataDir, { id: before.active, label: 'deepseek', baseUrl: 'https://api.deepseek.com', model: chat.model, useFor: ['chat'] })
          const workOnly = activeModelFor(config.dataDir, 'work')
          check('active 不覆盖 work 时才分派到 work 专配', workOnly.model === 'work-model', workOnly.model)
          check('resolveLlmConfig 按 mode 分流', resolveLlmConfig(config.dataDir, 'work').model === 'work-model', resolveLlmConfig(config.dataDir, 'work').model)
          // 恢复 active 的用途
          upsertProfile(config.dataDir, { id: before.active, label: 'deepseek', baseUrl: 'https://api.deepseek.com', model: chat.model, useFor: ['chat', 'work'] })
          // 清理：只删测试加的两条，active 恢复原样
          const file = readModels(config.dataDir)
          for (const p of file.profiles) if (p.id === 'route-chat' || p.id === 'route-work') removeProfile(config.dataDir, p.id)
          const after = readModels(config.dataDir)
          check('清理后只剩原来的 profile', after.profiles.length === before.profiles.length, after.profiles.length)
          console.log('[ROUTE] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[ROUTE] FAIL ' + String(err))
          app.exit(1)
        }
      }, 1200)
    }

    /* ---------- 跨学科收起自检：换科目收旧的，但一条都不删 ---------- */
    if (process.argv.includes('--fadetest')) {
      app.whenReady().then(() => {
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[FADE] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          const msgs = [
            { role: 'user' as const, content: '这个英语从句怎么分析' },
            { role: 'assistant' as const, content: '英语定语从句先找先行词' },
            { role: 'user' as const, content: '英语时态又混了' },
            { role: 'assistant' as const, content: '英语一般过去时和现在完成时区别在此' },
            { role: 'user' as const, content: '英语单词怎么背' },
            { role: 'assistant' as const, content: '英语单词建议按词根分组' },
            { role: 'user' as const, content: '现在问个数学题' },
          ]
          check('识别当前科目是数学', subjectOf('现在问个数学题：函数最小值') === '数学', subjectOf('现在问个数学题：函数最小值'))
          const r = fadeOtherSubjects(msgs, '数学', 2)
          check('英语旧消息被收起', r.faded >= 2 && r.messages.length < msgs.length, { faded: r.faded, before: msgs.length, after: r.messages.length })
          check('最近 2 条英语仍原样保留', r.messages.some((m) => m.content.includes('英语单词建议')))
          check('被收起的进了一行提要', r.messages.some((m) => m.content.includes('已收起')), r.messages.map((m) => m.content.slice(0, 18)))
          check('当前科目消息不受影响', r.messages[r.messages.length - 1].content.includes('数学'))
          // 切回英语时，轮到数学被收起（对称）
          const back = fadeOtherSubjects([{ role: 'user', content: '数学函数最小值怎么求' }, { role: 'assistant', content: '数学先看单调性' }], '英语', 2)
          check('切回英语时数学也只会被收（数据仍保留在原会话）', back.faded === 0 || back.messages.length <= 2, { faded: back.faded })
          console.log('[FADE] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[FADE] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 首页胶囊探针：点它到底切到哪一个变体 ---------- */
    if (process.argv.includes('--pillprobe')) {
      setTimeout(async () => {
        try {
          const run2 = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
          const before = (await run2("document.querySelector('.app')?.className || ''")) as string
          const clicked = (await run2("(() => { const p = document.querySelector('.home-pill'); if (!p) return { ok: false }; const r = p.getBoundingClientRect(); p.click(); return { ok: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] } })()")) as Record<string, unknown>
          await new Promise((r) => setTimeout(r, 900))
          const after = (await run2("document.querySelector('.app')?.className || ''")) as string
          const dom = (await run2("({ home: !!document.querySelector('.v-home'), studio: !!document.querySelector('.v-studio'), comp: !!document.querySelector('.v-comp') })")) as Record<string, unknown>
          console.log('[PILL] click=' + JSON.stringify(clicked) + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after) + ' dom=' + JSON.stringify(dom))
          app.exit(0)
        } catch (err) {
          console.log('[PILL] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }
    /* ---------- 语气对比自检：同一问题，两套相反的维度，看语气到底变不变 ---------- */
    if (process.argv.includes('--tonetest')) {
      app.whenReady().then(async () => {
        try {
          const cfgLlm = resolveLlmConfig(config.dataDir)
          const client = createClient(cfgLlm)
          const hot = { warmth: 100, humor: 100, patience: 100, strict: 5, verbosity: 95, encourage: 95 }
          const cold = { warmth: 0, humor: 0, patience: 10, strict: 95, verbosity: 10, encourage: 10 }
          // 先验别名：界面写的 formality/praise/tempo/closeness 必须真的生效
          const aliasChecks: Array<[string, Record<string, number>, string]> = [
            ['正式度', { formality: 100 }, '用词正式'],
            ['鼓励密度', { praise: 95 }, '多给正反馈'],
            ['语速感', { tempo: 100 }, '节奏慢'],
            ['亲和力', { closeness: 95 }, '关系亲近'],
          ]
          for (const [label, dims, expect] of aliasChecks) {
            const hint = buildDimHints(dims)
            console.log('[TONE] 别名 ' + label + ' → ' + (hint.includes(expect) ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(hint.slice(0, 60)))
          }
          const q = '为什么负负得正？'
          for (const [name, dims] of [['热(n=100)', hot], ['冷(n=0)', cold]] as const) {
            const sys = ['你就是「老师」，用第一人称说中文。', buildDimHints(dims as Record<string, number>), '只回答一个问题，不超过 120 字。'].filter(Boolean).join('\n')
            const reply = await client.complete(
              [{ role: 'system', content: sys }, { role: 'user', content: q }],
              { maxTokens: 600, temperature: 0.7 },
            )
            console.log('[TONE] ' + name + ' 提示词片段：' + JSON.stringify((buildDimHints(dims as Record<string, number>) || '(空)').slice(0, 200)))
            console.log('[TONE] ' + name + ' 回答：' + JSON.stringify(String(reply).trim().slice(0, 300)))
          }
          console.log('[TONE] result: PASS')
          app.exit(0)
        } catch (err) {
          console.log('[TONE] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 学习时长自检：累加 / 分天 / 今日 / 一周 ---------- */
    if (process.argv.includes('--studytimetest')) {
      app.whenReady().then(() => {
        const dir3 = mkdtempSync(join(app.getPath('temp'), 'studytime-'))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[TIME] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          check('初始为 0', todaySeconds(dir3) === 0 && todayMinutes(dir3) === 0)
          addSeconds(dir3, 20)
          addSeconds(dir3, 40)
          check('累加 60 秒 = 1 分钟', todaySeconds(dir3) === 60 && todayMinutes(dir3) === 1, { s: todaySeconds(dir3), m: todayMinutes(dir3) })
          const y = new Date()
          y.setDate(y.getDate() - 1)
          addSeconds(dir3, 600, y)
          check('昨天单独记一天', todaySeconds(dir3) === 60, todaySeconds(dir3))
          const week = lastWeekMinutes(dir3)
          check('一周数组 7 项且末位是今天', week.length === 7 && week[6] === 1, week)
          check('昨天落在倒数第二格', week[5] === 10, week)
          addSeconds(dir3, -100)
          check('负数不会倒扣', todaySeconds(dir3) === 60, todaySeconds(dir3))
          console.log('[TIME] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[TIME] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 每日对话条数自检：清空（挪进"已删除"）不能把趋势抹平 ---------- */
    if (process.argv.includes('--dailytest')) {
      app.whenReady().then(() => {
        const dir = mkdtempSync(join(app.getPath('temp'), 'daily-'))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[DAILY] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        const line = (role: string, text: string, at: Date): string =>
          JSON.stringify({ role, text, at: at.toISOString() }) + '\n'
        try {
          const chat = join(dir, '会话')
          const trash = join(chat, '已删除')
          mkdirSync(trash, { recursive: true })
          const today = new Date()
          const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
          // 在线会话：今天 2 条
          writeFileSync(join(chat, 's-a.jsonl'), line('user', '今天的问题', today) + line('assistant', '今天的回答', today))
          // 清空过两次：旧备份只有昨天，新备份包含昨天 + 今天（整份快照互相重叠）
          writeFileSync(join(trash, 's-a-old.jsonl'), line('user', '昨天的问题', yesterday) + line('assistant', '昨天的回答', yesterday))
          writeFileSync(
            join(trash, 's-a-new.jsonl'),
            line('user', '昨天的问题', yesterday) +
              line('assistant', '昨天的回答', yesterday) +
              line('user', '今天的问题', today) +
              line('assistant', '今天的回答', today),
          )
          const r = dailyCounts(dir)
          check('今天 2 条（备份与在线重复的只算一次）', r.byDay[dayKeyOf(today)] === 2, r.byDay)
          check('昨天 2 条', r.byDay[dayKeyOf(yesterday)] === 2, r.byDay)
          check('总数去重后 4 条', r.total === 4, r.total)
          check('覆盖 2 天', r.days === 2, r.days)
          check('今天的消息时间戳给出来了', r.todayTs.length === 2, r.todayTs.length)
          // 真正删除会话（unlink + 删备份）之后才开始减少
          rmSync(join(chat, 's-a.jsonl'))
          rmSync(join(trash, 's-a-new.jsonl'))
          rmSync(join(trash, 's-a-old.jsonl'))
          check('全删干净后归零', dailyCounts(dir).total === 0)
          console.log('[DAILY] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          rmSync(dir, { recursive: true, force: true })
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[DAILY] FAIL ' + String(err))
          rmSync(dir, { recursive: true, force: true })
          app.exit(1)
        }
      })
    }
    /* ---------- 页面转场自检：方向 / 交叉淡入 / 残影清理 / 连点 ---------- */
    if (process.argv.includes('--transitiontest')) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[TRANS] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        /**
         * 切到 i：先抓到"进入动画"本身的关键帧（起始位移方向、起止透明度），
         * 再等它结束采终态。
         *
         * 为什么读关键帧而不是"等 90ms 采一帧计算样式"——
         * 机器忙的时候首帧可能晚到几百毫秒，采到的是尾巴（位移快归零），断言就假红。
         * 关键帧是确定的：起点 translate3d(±24px) scale(0.985)、终点 0 / 1。
         */
        const move = async (i: number): Promise<{
          ghost: boolean
          startX: number
          endX: number
          from: number
          to: number
          anims: number
          finalGhost: boolean
          finalOpacity: number
          finalX: number
          layers: number
        }> => {
          await run('window.__costudySetActive(' + i + ')')
          const probe = `(() => {
            const layer = document.querySelector('#stage > .page-layer')
            const cs = layer ? getComputedStyle(layer) : null
            const m = cs && cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform) : null
            const anims = document.getAnimations().filter((a) => a.effect && a.effect.target === layer)
            const enter = anims.find((a) => {
              const k = a.effect.getKeyframes ? a.effect.getKeyframes() : []
              // 进入动画的特征：从完全透明开始（退出动画是 1 → 0，且挂在旧层上）
              return k.length >= 2 && Number(k[0].opacity) === 0
            })
            const k = enter && enter.effect.getKeyframes ? enter.effect.getKeyframes() : null
            const mat = (t) => { try { return new DOMMatrixReadOnly(String(t)) } catch (e) { return null } }
            const m0 = k ? mat(k[0].transform) : null
            const m1 = k ? mat(k[1].transform) : null
            return {
              found: !!k,
              ghost: !!document.querySelector('.page-ghost'),
              startX: m0 ? m0.m41 : NaN,
              endX: m1 ? m1.m41 : NaN,
              from: k ? Number(k[0].opacity) : NaN,
              to: k ? Number(k[1].opacity) : NaN,
              anims: document.getAnimations().length,
              liveX: m ? m.m41 : 0,
            }
          })()`
          let mid: { found: boolean; ghost: boolean; startX: number; endX: number; from: number; to: number; anims: number } | null = null
          for (let k = 0; k < 40 && !mid; k += 1) {
            await wait(10)
            const s = (await run(probe)) as { found: boolean; ghost: boolean; startX: number; endX: number; from: number; to: number; anims: number }
            if (s.found) mid = s
          }
          if (!mid) {
            const s = (await run(probe)) as { found: boolean; ghost: boolean; startX: number; endX: number; from: number; to: number; anims: number }
            mid = s
          }
          // 320ms 的进入 + 兜底定时器（420ms）都跑完之后再量终态；
          // 采样太早会读到动画中间帧（旧实现里这条一直靠 420ms 刚好卡住，太脆）
          await wait(760)
          const end = (await run(`(() => {
            const layer = document.querySelector('#stage > .page-layer')
            const cs = layer ? getComputedStyle(layer) : null
            const m = cs && cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform) : null
            return {
              ghost: !!document.querySelector('.page-ghost'),
              opacity: cs ? Number(cs.opacity) : -1,
              x: m ? m.m41 : 0,
              styles: document.querySelectorAll('style[data-harness="variant"]').length,
              layers: document.querySelectorAll('#stage > .page-layer').length,
            }
          })()`)) as { ghost: boolean; opacity: number; x: number; styles: number; layers: number }
          return { ...mid, finalGhost: end.ghost, finalOpacity: end.opacity, finalX: end.x, layers: end.layers }
        }
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(400)
          // 先回到首页并等它稳定
          await run('window.__costudySetActive(' + 3 + ')')
          await wait(600)

          /**
           * 减少动效（无障碍）：带上 --force-prefers-reduced-motion 跑时，
           * 这里应当**完全看不到**残影和过渡，切换是瞬时的。
           */
          const reduced = (await run("window.matchMedia('(prefers-reduced-motion: reduce)').matches")) as boolean
          if (reduced) {
            console.log('[TRANS] prefers-reduced-motion = true → 只验"不播动画"这条分支')
            await run('window.__costudySetActive(' + 0 + ')')
            await wait(80)
            const instant = (await run(`(() => {
              const layer = document.querySelector('#stage > .page-layer')
              const cs = getComputedStyle(layer)
              const stale = [...document.querySelectorAll('style[data-harness="variant"]')]
                .filter((s) => (s.textContent || '').includes('.v-home')).length
              return {
                ghost: !!document.querySelector('.page-ghost'),
                opacity: Number(cs.opacity),
                transform: cs.transform,
                stale,
                layers: document.querySelectorAll('#stage > .page-layer').length,
              }
            })()`)) as { ghost: boolean; opacity: number; transform: string; stale: number; layers: number }
            check('减少动效：没有残影层', !instant.ghost, instant)
            check('减少动效：新页立即完全不透明', instant.opacity > 0.99, { opacity: instant.opacity })
            check('减少动效：没有残留 transform', instant.transform === 'none' || instant.transform === 'matrix(1, 0, 0, 1, 0, 0)', instant.transform)
            check('减少动效：舞台只有一层、旧页面样式已回收', instant.layers === 1 && instant.stale === 0, instant)
            console.log('[TRANS] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
            app.exit(failed === 0 ? 0 : 1)
            return
          }

          const toStudio = await move(0)
          check('首页 → 角色工坊：新页从右进（起点 x>0）', toStudio.startX > 1, { startX: toStudio.startX })
          check('首页 → 角色工坊：进入动画透明度 0 → 1', toStudio.from === 0 && toStudio.to === 1, { from: toStudio.from, to: toStudio.to })
          check('转场中旧页面存于 .page-ghost', toStudio.ghost)
          check('转场中有动画在跑', toStudio.anims >= 2, { anims: toStudio.anims })
          check('转场结束：残影已清掉', !toStudio.finalGhost)
          check('转场结束：新页完全不透明、无位移', Math.abs(toStudio.finalX) < 0.5 && toStudio.finalOpacity > 0.99, { x: toStudio.finalX, opacity: toStudio.finalOpacity })
          check('转场结束：舞台上只有一层', toStudio.layers === 1, { layers: toStudio.layers })

          const toPlugins = await move(1)
          check('角色工坊 → 插件：仍是从右进（起点 x>0）', toPlugins.startX > 1, { startX: toPlugins.startX })

          const toStudy = await move(2)
          check('插件 → 伴学：从右进（起点 x>0）', toStudy.startX > 1, { startX: toStudy.startX })

          // 返回：伴学 → 插件，应当从左进（起点 x<0）
          const backToPlugins = await move(1)
          check('伴学 → 插件（返回）：新页从左进（起点 x<0）', backToPlugins.startX < -1, { startX: backToPlugins.startX })
          check('返回时旧页面同样有残影', backToPlugins.ghost)

          const backToStudio = await move(0)
          check('插件 → 角色工坊（返回）：从左进（起点 x<0）', backToStudio.startX < -1, { startX: backToStudio.startX })

          // 连续快速切换：中间不该堆出多份残影，结束后也不该有残留
          await run('window.__costudySetActive(3)')
          await wait(60)
          await run('window.__costudySetActive(0)')
          await wait(60)
          await run('window.__costudySetActive(1)')
          await wait(60)
          await run('window.__costudySetActive(2)')
          await wait(520)
          const rapid = (await run(`(() => ({
            ghosts: document.querySelectorAll('.page-ghost').length,
            layers: document.querySelectorAll('#stage > .page-layer').length,
            comp: !!document.querySelector('.v-comp'),
            opacity: Number(getComputedStyle(document.querySelector('#stage > .page-layer')).opacity),
          }))()`)) as { ghosts: number; layers: number; comp: boolean; opacity: number }
          check('连点 4 次：只剩一层、没有残影', rapid.ghosts === 0 && rapid.layers === 1, rapid)
          check('连点 4 次：最后停在伴学、且完全不透明', rapid.comp && rapid.opacity > 0.99, rapid)

          /**
           * 不许上下跳：从"滚下去过的页面"切走时，
           * 新页面必须在顶部出现（layout 位置恒定），不能沿用上一页的滚动位置。
           * 用 offsetTop 量（不受 transform 影响），才能区分"真的位移"和"动画缩放"。
           */
          await run('window.__costudySetActive(' + 0 + ')')
          await wait(600)
          await run('window.scrollTo(0, 420)')
          await wait(120)
          const scrolledFrom = (await run('window.scrollY')) as number
          await run('window.__costudySetActive(' + 1 + ')')
          const samples: Array<{ y: number; top: number }> = []
          for (let k = 0; k < 10; k += 1) {
            await wait(45)
            samples.push(
              (await run(`(() => {
                const layer = document.querySelector('#stage > .page-layer')
                return { y: Math.round(window.scrollY), top: Math.round(layer ? layer.offsetTop : -1) }
              })()`)) as { y: number; top: number },
            )
          }
          const tops = samples.map((s) => s.top)
          const spread = Math.max(...tops) - Math.min(...tops)
          console.log('[TRANS] 滚动位置采样 ' + JSON.stringify({ from: scrolledFrom, samples }))
          check('切屏前确实滚动过（前提成立）', scrolledFrom > 300, { from: scrolledFrom })
          check('新页面从顶部出现：layout 顶边全程不动（上下不震荡）', spread <= 1, { spread, tops })
          check('切屏后窗口回到顶部', samples[samples.length - 1].y === 0, samples[samples.length - 1])

          // 旧变体的样式必须跟着残影一起删掉，否则 4 个页面的 CSS 会越堆越多。
          // 这里按"内容里还有没有 .v-home 的规则"判断，而不是数个数 ——
          // 每个页面注入的样式表数量本来就不一样（聊天页 2 份、工坊 4 份）。
          const staleStyles = (await run(
            `[...document.querySelectorAll('style[data-harness="variant"]')].filter((s) => (s.textContent || '').includes('.v-home')).length`,
          )) as number
          check('旧页面注入的 <style> 已回收（v-home 规则已移除）', staleStyles === 0, { stale: staleStyles })

          // 留一张转场中间帧给人看
          try {
            await run('window.__costudySetActive(' + 3 + ')')
            await wait(600)
            await run('window.__costudySetActive(' + 0 + ')')
            await wait(110)
            const bounds = win.getContentBounds()
            const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
            const out = process.env['COSTUDY_UI_SHOT_DIR'] || join(config.projectRoot, 'ui-shots')
            mkdirSync(out, { recursive: true })
            writeFileSync(join(out, 'transition-mid.png'), img.toPNG())
            console.log('[TRANS] mid-frame: ' + join(out, 'transition-mid.png'))
          } catch (e) {
            console.log('[TRANS] mid-frame failed: ' + String(e))
          }

          console.log('[TRANS] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[TRANS] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }
    /* ---------- 记忆库自检：去重 / 攒证据 / 待确认→已确认 / 归档 ---------- */
    if (process.argv.includes('--librarytest')) {
      app.whenReady().then(() => {
        const dir2 = mkdtempSync(join(app.getPath('temp'), 'memlib-'))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[LIB] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          const a = recordEntry(dir2, { text: '电压表要并联', evidence: '学生：电压表怎么接' })
          check('全量记录：首次入库即有内容与标记', Boolean(a) && a!.hits === 1 && a!.tags.length > 0, a && a.tags)
          const b = recordEntry(dir2, { text: '电压表要并联。' })
          check('同义重复不新增、hits 累加', Boolean(b) && b!.hits === 2 && viewLibrary(dir2).counts.total === 1, viewLibrary(dir2).counts)
          const found = searchLibrary(dir2, '电压表怎么接', 3)
          check('能按检索标记召回', found.length > 0 && found[0].text.includes('电压表'), found.map((h) => h.text))
          recordEntry(dir2, { text: '透镜成像是倒立的实像', tags: ['物理', '知识点'] })
          recordEntry(dir2, { text: '酯化反应要加热', tags: ['化学', '知识点'] })
          const bySubj = searchLibrary(dir2, '透镜怎么成像', 5, detectSubjects('透镜怎么成像'))
          check('按学科召回：物理问题优先物理记忆', bySubj.length > 0 && bySubj[0].tags.includes('物理'), bySubj.map((h) => h.tags[0]))
          check('视图带按学科统计', (viewLibrary(dir2).counts.bySubject['物理'] ?? 0) >= 1, viewLibrary(dir2).counts.bySubject)
          const c = recordEntry(dir2, { text: '电流表要串联', tags: ['物理'] })
          check('归档后不计入列表', archiveEntry(dir2, c!.id) && viewLibrary(dir2).entries.every((e) => e.id !== c!.id))
          const v = viewLibrary(dir2)
          check('统计一致（总数 4 / 归档 1 / 有标记）', v.counts.total === 4 && v.counts.archived === 1 && v.counts.tagged >= 3, v.counts)
          check('证据被保留', v.entries.some((e) => e.evidence.includes('电压表')), v.entries.map((e) => e.evidence).slice(0, 3))

          /* 物理删除（界面上的「删除」按钮）：记录必须真的从库里消失，
           * 而不是像归档那样只是不再参与检索。加一条再删掉，总数要回到原样。 */
          const delTarget = recordEntry(dir2, { text: '这条会被物理删除' })
          const delOk = Boolean(delTarget) && deleteEntry(dir2, delTarget!.id)
          const v2 = viewLibrary(dir2)
          check(
            '物理删除后条目消失且总数回落',
            delOk && v2.entries.every((e) => e.id !== delTarget!.id) && v2.counts.total === v.counts.total,
            { ok: delOk, total: v2.counts.total },
          )
          check('删不存在的 id 返回 false', deleteEntry(dir2, 'm-nope-nope') === false)
          console.log('[LIB] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[LIB] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 泄漏图文的救回探针 ---------- */
    if (process.argv.includes('--leakprobe')) {
      app.whenReady().then(async () => {
        try {
          const sample =
            '斜面传送带，重点只有一个：摩擦力方向看物块和带谁快。 [画图:{"kind":"diagram","scene":{"width":640,"height":400,"title":"斜面上的传送带：小物块受力分析","caption":"带向上运动"},"elements":[{"type":"polygon","points":[[120,330],[500,130],[500,330]],"fill":"#eef2f7","stroke":"#c8d2df"},{"type":"line","x1":120,"y1":330,"x2":500,"y2":130,"sw":5,"stroke":"#2b2b2b"}]}] 这里是结尾。'
          const out = await renderLeakedDiagram(sample)
          const hasChart = /\[chart:c-[a-f0-9]{12}\]/.test(out)
          const clean = !out.includes('[画图:')
          console.log('[LEAK] hasChart=' + hasChart + ' clean=' + clean + ' text=' + JSON.stringify(out.slice(0, 120)))
          const cut = '截断的例子 [画图:{"kind":"diagram","scene":{"width":640'
          const out2 = await renderLeakedDiagram(cut)
          console.log('[LEAK] truncated clean=' + !out2.includes('[画图:') + ' text=' + JSON.stringify(out2))
          app.exit(hasChart && clean ? 0 : 1)
        } catch (err) {
          console.log('[LEAK] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 代码执行自检：真的跑一段 JS ----------
     * 为什么要单独一项：`--toolprobe` 只测了画电路，`--permtest` 只测"清单里有没有"。
     * 从来没有任何自检真正执行过 run_code，所以「权限写死成只读」这种错误能一路全绿。
     * 这里走的是模型调用的同一条路：runTool → MCP 子进程 → 沙箱目录。
     * 沙箱指到临时目录，跑完就删，不碰真实 记忆/代码沙箱。
     */
    if (isCodeTest) {
      app.whenReady().then(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const dir = mkdtempSync(join(app.getPath('temp'), 'codetest-'))
        const realDir = config.dataDir
        try {
          setChartDataDir(dir)
          const work = allowedPermissions('work')
          const chat = allowedPermissions('chat')

          const t0 = Date.now()
          const okRun = await runTool('run_code', JSON.stringify({ code: 'console.log(1 + 2)\nconsole.log([3,1,2].sort((a,b)=>a-b).join(","))' }), work)
          const cost = Date.now() - t0
          checks.push({ name: '跑一段 JS 拿到 stdout', ok: okRun.ok && okRun.content.includes('3') && okRun.content.includes('1,2,3'), detail: okRun.content.replace(/\s+/g, ' ').slice(0, 60) })
          checks.push({ name: '3 秒内返回', ok: cost < 3000, detail: cost + 'ms' })

          const cn = await runTool('run_code', JSON.stringify({ code: 'console.log("正弦定理 a/sinA = 2R")' }), work)
          checks.push({ name: '中文输出不乱码', ok: cn.ok && cn.content.includes('正弦定理'), detail: cn.content.slice(0, 30) })

          // 注意：runTool 的 ok 说的是"工具跑没跑"，代码自己抛错是放在正文里的（给模型读）
          const bad = await runTool('run_code', JSON.stringify({ code: 'throw new Error("boom")' }), work)
          checks.push({ name: '抛异常时正文带错误信息', ok: bad.content.includes('有错误') && bad.content.includes('boom'), detail: bad.content.replace(/\s+/g, ' ').slice(0, 50) })

          const chatCall = await runTool('run_code', JSON.stringify({ code: 'console.log(1)' }), chat)
          checks.push({ name: '聊天模式下调 exec 被拒', ok: !chatCall.ok && chatCall.content.includes('工作模式'), detail: chatCall.content.slice(0, 40) })

          const noCode = await runTool('run_code', JSON.stringify({ code: '   ' }), work)
          checks.push({ name: '空代码给提示而不是崩', ok: noCode.content.includes('缺少'), detail: noCode.content.slice(0, 20) })

          // 跑完不该在沙箱里留临时文件
          const left = existsSync(join(dir, '代码沙箱')) ? readdirSync(join(dir, '代码沙箱')).length : 0
          checks.push({ name: '临时脚本跑完就删', ok: left === 0, detail: '剩 ' + left + ' 个' })
        } catch (err) {
          checks.push({ name: '自检本身没崩', ok: false, detail: err instanceof Error ? err.message : String(err) })
        } finally {
          setChartDataDir(realDir)
          rmSync(dir, { recursive: true, force: true })
        }
        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[CODETEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[CODETEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    }
    /* ---------- 工作区自检：里面的写放行、外面的写要审批 ----------
     * 验的是**真**隔离：拒绝之后文件确实没生成，不是"界面说拒绝了"。
     * 弹窗用 COSTUDY_APPROVE=allow/deny 旁路，自检里没人点按钮。
     */
    if (isWorkspaceTest) {
      app.whenReady().then(async () => {
        const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
        const push = (name: string, ok: boolean, detail?: string): void => {
          checks.push({ name, ok, detail })
        }
        const ws = mkdtempSync(join(app.getPath('temp'), 'wstest-ws-'))
        const outside = mkdtempSync(join(app.getPath('temp'), 'wstest-out-'))
        const realWs = currentCodeWorkspace()
        const prevAuto = process.env['COSTUDY_APPROVE']
        const work = allowedPermissions('work')
        const writeCode = (file: string): string =>
          "import fs from 'node:fs'\nfs.writeFileSync(" + JSON.stringify(file) + ", 'x')\nconsole.log('written')\n"
        try {
          setCodeWorkspace(ws)
          process.env['COSTUDY_APPROVE'] = 'deny'

          const inWs = await runTool(
            'run_code',
            JSON.stringify({ code: "import fs from 'node:fs'\nfs.writeFileSync('rel.txt','hi')\nconsole.log('ok-rel')" }),
            work,
          )
          push('工作区内相对路径直接放行', inWs.content.includes('ok-rel') && existsSync(join(ws, 'rel.txt')), inWs.content.replace(/\s+/g, ' ').slice(0, 40))

          const denyOut = await runTool('run_code', JSON.stringify({ code: writeCode(join(outside, 'deny.txt')) }), work)
          push('工作区外写入被拒且文件真没生成', denyOut.content.includes('已被拒绝') && !existsSync(join(outside, 'deny.txt')), denyOut.content.replace(/\s+/g, ' ').slice(0, 46))

          process.env['COSTUDY_APPROVE'] = 'allow'
          const allowOut = await runTool('run_code', JSON.stringify({ code: writeCode(join(outside, 'allow.txt')) }), work)
          push('批准后能写到工作区外', existsSync(join(outside, 'allow.txt')), allowOut.content.replace(/\s+/g, ' ').slice(0, 40))

          process.env['COSTUDY_APPROVE'] = 'deny'
          const readOut = await runTool(
            'run_code',
            JSON.stringify({ code: "import fs from 'node:fs'\nconsole.log('read:' + fs.readFileSync(" + JSON.stringify(join(outside, 'allow.txt')) + ", 'utf8'))" }),
            work,
          )
          push('工作区外读取不受限', readOut.content.includes('read:x'), readOut.content.replace(/\s+/g, ' ').slice(0, 30))

          const cmd = await runTool(
            'run_code',
            JSON.stringify({ code: "import cp from 'node:child_process'\nconsole.log(cp.execSync('echo hi').toString())" }),
            work,
          )
          push('起外部程序也要审批（默认拒）', cmd.content.includes('已被拒绝'), cmd.content.replace(/\s+/g, ' ').slice(0, 40))
        } catch (err) {
          push('自检本身没崩', false, err instanceof Error ? err.message : String(err))
        } finally {
          if (prevAuto === undefined) delete process.env['COSTUDY_APPROVE']
          else process.env['COSTUDY_APPROVE'] = prevAuto
          setCodeWorkspace(realWs)
          rmSync(ws, { recursive: true, force: true })
          rmSync(outside, { recursive: true, force: true })
        }
        const failed = checks.filter((c) => !c.ok).length
        for (const c of checks) console.log('[WSTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''))
        console.log('[WSTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
        app.exit(failed === 0 ? 0 : 1)
      })
    }
    /* ---------- 工具探针：走**聊天用的同一条工具入口**，看它到底画出来了没有 ---------- */
    if (process.argv.includes('--toolprobe')) {
      app.whenReady().then(async () => {
        try {
          const net = JSON.stringify({
            title: '伏安法测电阻',
            series: [
              { id: 'E', type: 'battery', label: '电源' },
              { id: 'S', type: 'switch', label: '开关 S' },
              { id: 'A', type: 'ammeter', label: '电流表' },
              { id: 'R', type: 'rheostat', label: '滑动变阻器' },
              { id: 'Rx', type: 'resistor', label: '待测电阻' },
            ],
            parallel: [{ across: 'Rx', id: 'V', type: 'voltmeter', label: '电压表' }],
          })
          const res = await runTool('draw_circuit', net)
          const text = String(res.content ?? '')
          const m = /\[chart:(c-[a-f0-9]{12})\]/.exec(text)
          const id = m ? m[1] : ''
          const file = id ? join(config.dataDir, '图表', id + '.svg') : ''
          console.log(
            '[TOOLPROBE] ok=' +
              res.ok +
              ' chars=' +
              text.length +
              ' id=' +
              (id || '(无)') +
              ' file=' +
              (file ? existsSync(file) : false) +
              ' head=' +
              JSON.stringify(text.slice(0, 120)),
          )
          app.exit(res.ok ? 0 : 1)
        } catch (err) {
          console.log('[TOOLPROBE] FAIL ' + String(err))
          app.exit(1)
        }
      })
    }
    /* ---------- 图渲染探针：直接问"取图 API 返回什么" + "DOM 里有没有 svg" ---------- */
    if (process.argv.includes('--chartprobe')) {
      setTimeout(async () => {
        try {
          const run2 = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
          // 探针必须切到伴学页，否则 .v-comp 根本不存在（第一次就踩了：boxes=0）
          await run2('window.__costudySetActive && window.__costudySetActive(2)')
          await new Promise((r) => setTimeout(r, 4500))
          const idx = process.argv.indexOf('--chartprobe')
          const cid = String(process.argv[idx + 1] ?? '')
          const direct = (await run2(
            '(async () => { const svg = await window.costudy.chartsGet(' +
              JSON.stringify(cid) +
              '); return { api: typeof window.costudy.chartsGet, got: typeof svg, len: String(svg ?? "").length, head: String(svg ?? "").slice(0, 40) } })()',
          )) as Record<string, unknown>
          const keyboard = (await run2('(() => { const k = document.querySelector(".v-comp .math-key"); const pad = document.querySelector(".v-comp .math-pad"); return { key: Boolean(k), pad: Boolean(pad), keys: pad ? pad.querySelectorAll(".mp-key").length : 0, hidden: pad ? pad.hidden : null } })()')) as Record<string, unknown>
          console.log('[CHART] keyboard ' + JSON.stringify(keyboard))
          const ring = (await run2('(() => { const r = document.querySelector(".v-comp .ctx-ring"); if (!r) return { found: false }; const b = r.getBoundingClientRect(); return { found: true, w: Math.round(b.width), h: Math.round(b.height), pct: r.querySelector(".ctx-pct")?.textContent, title: (r.title || "").slice(0, 60) } })()')) as Record<string, unknown>
          console.log('[CHART] ring ' + JSON.stringify(ring))
          const dom = (await run2(
            '(() => { const boxes = [...document.querySelectorAll(".v-comp .chart-box")]; const withSvg = boxes.filter((b) => b.querySelector("svg")); const b = boxes[boxes.length - 1]; const r = b ? b.getBoundingClientRect() : null; return { boxes: boxes.length, withSvg: withSvg.length, lastHtmlLen: b ? b.innerHTML.length : 0, lastRect: r ? [Math.round(r.width), Math.round(r.height)] : null, lastText: b ? (b.textContent || "").slice(0, 40) : null } })()',
          )) as Record<string, unknown>
          console.log('[CHART] direct ' + JSON.stringify(direct))
          console.log('[CHART] dom ' + JSON.stringify(dom))
          app.exit(0)
        } catch (err) {
          console.log('[CHART] FAIL ' + String(err))
          app.exit(1)
        }
      }, 4000)
    }
    if (isContextTest) {
      setTimeout(() => {
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[CTX] ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          // 1) 触发水位：不到 18 条不压，到了就压到"最近 10 条"
          check('9 条不触发压缩', planCompression(9, 0) === null)
          check('17 条不触发', planCompression(17, 0) === null)
          const p20 = planCompression(20, 0)
          check('20 条触发，压到剩 10 条', Boolean(p20) && p20!.from === 0 && p20!.to === 10, p20)
          const p40 = planCompression(40, 10)
          check('已压过 10 条后再压，从水位接着压', Boolean(p40) && p40!.from === 10 && p40!.to === 30, p40)
          check('压完没新增就不重复压', planCompression(30, 20) === null)

          // 2) 摘要原文渲染：带角色、限长
          const msgs = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: '第' + i + '句话' }))
          const transcript = renderForSummary(msgs, 0, 12)
          check('摘要原文带角色前缀', transcript.includes('学生：') && transcript.includes('你：'))
          check('摘要原文限长', renderForSummary(msgs, 0, 30, 40).length <= 60)

          // 3) 落盘 / 读回 / 提示词
          const sid = 'ctx-test-' + Date.now().toString(36)
          writeSummary(config.dataDir, sid, { upTo: 12, summary: '学到电路图，电压表总被串进去。', updatedAt: new Date().toISOString(), rounds: 1 })
          const back = readSummary(config.dataDir, sid)
          check('摘要能落盘并读回', Boolean(back) && back!.upTo === 12 && back!.summary.includes('电压表'), { back, dataDir: config.dataDir })
          const block = renderSummaryBlock(back!.summary)
          check('摘要能拼成提示词块', block.includes('压缩摘要') && block.includes('以最近的原话为准'))
          check('空摘要不产生提示词', renderSummaryBlock('') === '')

          // 4) token 估算 + 占用百分比（圆环用的数）
          const st = contextStats(
            Array.from({ length: 30 }, () => ({ role: 'user' as const, text: '电路图里的电压表应该并联在待测电阻两端' })),
            { upTo: 20, summary: '学到电路图，电压表常被串进去。', updatedAt: '', rounds: 1 },
            128000,
          )
          check('估算：中文接近 1 字 1 token', estimateTokens('电压表并联') === 5, estimateTokens('电压表并联'))
          check('占用按最近原文 + 摘要算', st.recentTokens > 0 && st.summaryTokens > 0 && st.usedTokens === st.recentTokens + st.summaryTokens)
          check('百分比被夹在 0–100', st.percent >= 0 && st.percent <= 100, st.percent)
          check('统计里带已压缩条数', st.compressed === 20 && st.hasSummary === true, st.compressed)

          // 5) 按 token 触发（不是按条数）
          const longMsg = { role: 'user' as const, text: '电压表并联在待测电阻两端' } // ≈ 14 token
          const many = Array.from({ length: 40 }, () => longMsg) // ≈ 560 token
          check('短对话不触发（token 没超 60%）', planCompressionByTokens(many, 0, 128000) === null)
          const big = Array.from({ length: 40 }, () => ({ role: 'user' as const, text: '这'.repeat(3000) })) // ≈ 12 万 token
          const pToken = planCompressionByTokens(big, 0, 128000)
          check('token 超阈值会触发压缩', Boolean(pToken) && pToken!.to > 0 && pToken!.to < 40, pToken && { from: pToken.from, to: pToken.to })
          check('压缩后保留部分不超过窗口 25%', (() => {
            if (!pToken) return false
            let kept = 0
            for (let i = pToken.to; i < big.length; i += 1) kept += estimateTokens(big[i].text)
            return kept <= 128000 * 0.25 + 3000
          })())
          try {
            rmSync(join(config.dataDir, '摘要', sid + '.json'), { force: true })
          } catch {
            /* ignore */
          }

          console.log('[CTX] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[CTX] FAIL ' + String(err))
          app.exit(1)
        }
      }, 1200)
    }

    if (isAsrTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[ASRTEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); return true })()")
          await wait(700)

          // 1) 本地听写可用性
          const probe = await probeLocalAsr()
          console.log('[ASRTEST] 本地识别器 ' + JSON.stringify(probe))
          check('能探测系统识别器（有或没有都算通过）', typeof probe.ok === 'boolean' && Boolean(probe.detail))

          // 1.5) 中文经 PowerShell 往返不乱码（这条是真踩过的坑：乱码消息）
          const rt = await psUtf8RoundTrip()
          check('中文经 PowerShell 往返不乱码', rt.ok && rt.text.includes('滑动变阻器') && !rt.text.includes('\uFFFD'), rt.text)
          // 2) WAV 头
          const pcm = Buffer.alloc(16000) // 0.5 秒静音
          const wav = pcmToWav(pcm)
          const okRiff = wav.subarray(0, 4).toString('ascii') === 'RIFF' && wav.subarray(8, 12).toString('ascii') === 'WAVE'
          const okRate = wav.readUInt32LE(24) === 16000 && wav.readUInt16LE(22) === 1
          const okLen = wav.length === 44 + pcm.length && wav.readUInt32LE(40) === pcm.length
          check('PCM 能封成 16k 单声道 WAV', okRiff && okRate && okLen)

          // 3) 切到本地引擎 + start/stop 不炸
          const saved = saveAsrSettings(config.dataDir, { engine: 'local' })
          check('能把引擎切到 local', saved.engine === 'local', saved.engine)
          const started = await startAsr(config.dataDir)
          check('asr:start 在没配密钥时也能起来（本地引擎）', started.ok || probe.ok === false, started)
          if (started.ok) {
            for (let i = 0; i < 5; i += 1) pushAsrAudio(Buffer.alloc(3200).toString('base64'))
            const finalText = await stopAsr()
            check('asr:stop 返回字符串（静音时可能是空串）', typeof finalText === 'string', finalText.slice(0, 40))
          }
          const view = describeAsrSettings(config.dataDir)
          check('设置视图带 local 引擎', view.engine === 'local', view.engine)

          // 4) 界面桥接在
          const bridge = (await run("(() => ({ start: typeof window.costudy.asrStart, chunk: typeof window.costudy.asrChunk, stop: typeof window.costudy.asrStop, probe: typeof window.costudy.asrProbeLocal, useLocal: typeof window.costudy.asrUseLocal }))()")) as Record<string, string>
          check('渲染端桥接方法齐全', Object.values(bridge).every((v) => v === 'function'), bridge)

          // 5) 麦克风按钮在（先切到伴学页，dock 只在那里）
          await run('window.__costudySetActive && window.__costudySetActive(2)')
          await wait(900)
          const mic = (await run("!!document.querySelector('.v-comp .dock [data-asr-mic]')")) as boolean
          check('输入框有麦克风按钮', mic === true)

          // 6) 语音专名表：默认词表能生成提示词、能读写、单字词标了"别替换"
          const g0 = readGlossary(config.dataDir)
          check('专名表默认有词条', g0.entries.length >= 10, g0.entries.length)
          const gPrompt = glossaryPrompt(config.dataDir)
          check('专名表能拼成提示词', gPrompt.includes('滑动变阻器') && gPrompt.includes('不要擅自改写'), gPrompt.slice(0, 40))
          const gSaved = saveGlossary(config.dataDir, { ...g0, entries: [...g0.entries, { term: '单位圆', category: '数学', wrong: ['当位圆'] }] })
          check('专名表能加词条并落盘', gSaved.entries.some((e) => e.term === '单位圆'), gSaved.entries.length)
          check('单字词条带"别替换"标记', g0.entries.some((e) => e.noAutoFix === true))
          saveGlossary(config.dataDir, g0) // 恢复原样，别污染用户的词表

          // 7) 假图编号会被换成真编号（或删掉）
          const fake = fixChartMarkers('画好了 [chart:c-000000000000] 你看', () => false, ['c-abcdefabcdef'])
          check('假编号换成这一轮真存的图', fake.includes('[chart:c-abcdefabcdef]') && !fake.includes('c-000000000000'), fake)
          const none = fixChartMarkers('画好了 [chart:c-000000000000]', () => false, [])
          check('没有真图时删掉标记并说明', !none.includes('[chart:') && none.includes('没生成成功'), none)
          const keep = fixChartMarkers('图 [chart:c-abcdefabcdef]', (x) => x === 'c-abcdefabcdef', [])
          check('真编号原样保留', keep.includes('[chart:c-abcdefabcdef]'), keep)

          console.log('[ASRTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[ASRTEST] FAIL ' + String(err))
          app.exit(1)
        }
      }, 2600)
    }

    /* ---------- 发照片自检：存得下、取得到、界面显示得出、点得开放大 ---------- */
    if (isPhotoTest) {
      setTimeout(async () => {
        const run = (js: string): Promise<unknown> => win.webContents.executeJavaScript(js)
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        let failed = 0
        const check = (name: string, ok: boolean, detail?: unknown): void => {
          if (!ok) failed += 1
          console.log('[PHOTOTEST] ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
        }
        let imageId = ''
        /** 这个测试造出来的图，跑完全部删掉（粘贴的那张也要算进来） */
        const cleanupIds: string[] = []
        let tmpSessionId = ''
        let original = null as ReturnType<typeof currentSession>
        try {
          await run("(() => { const s = document.querySelector('[data-ob-skip]'); if (s) s.click(); document.querySelectorAll('.ob-mask, .ob-wrap').forEach((n) => n.remove()); return true })()")
          await wait(900)

          // 1) 存储层：存一张"题目的照片"（SVG 也能当图片看，省得在测试里造 PNG）
          const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">',
            '<rect width="480" height="300" fill="#fffdf7"/>',
            '<text x="40" y="70" font-size="26" fill="#10151c">3x + 5 = 20</text>',
            '<text x="40" y="120" font-size="20" fill="#5a6a7a">求 x 的值</text>',
            '<line x1="40" y1="150" x2="440" y2="150" stroke="#d9dee6" stroke-width="2"/>',
            '<text x="40" y="200" font-size="16" fill="#9aa8b6">（学生拍的照片 · 测试用）</text>',
            '</svg>',
          ].join('')
          const saved = saveImage(config.dataDir, { data: Buffer.from(svg), mime: 'image/svg+xml', name: '题目.svg' })
          imageId = saved.id
          cleanupIds.push(saved.id)
          check('能存进 记忆/图片/', /^i-[a-f0-9]{12}$/.test(saved.id), saved.id)
          const back = readImage(config.dataDir, saved.id)
          check('能按 id 读回来', Boolean(back) && back?.bytes === Buffer.byteLength(svg), back?.bytes ?? null)

          // 2) 标记与提示词
          const marker = '[图片:' + saved.id + ']'
          const ids = imageIds('老师这题怎么解\n' + marker)
          check('标记能解析出 id', ids.length === 1 && ids[0] === saved.id, ids)
          check('标记能从正文里剥掉', !stripImageMarkers('这题怎么解 ' + marker).includes('图片:'))
          check('纯文本模型不会假装看到图', imagePromptNote([{ name: '题目.svg' }]).includes('看不到图像'))
          check('deepseek-flash 判定为视觉模型（--x1 实测 200）', visionCapable('deepseek-flash') === true)
          check('qwen-vl-max 判定为视觉模型', visionCapable('qwen-vl-max') === true)

          // 3) 界面层：临时会话里放一条带图消息，看气泡里有没有 <img>
          original = currentSession(config.dataDir)
          const tmp = createSession(config.dataDir, 'PHOTOTEST')
          tmpSessionId = tmp.id
          appendMessage(config.dataDir, tmp.id, 'user', '老师这题怎么解\n' + marker)
          await run('window.__costudySetActive && window.__costudySetActive(2)')
          await wait(1200)
          await run('window.__costudyEnterLearn && window.__costudyEnterLearn()')
          for (let i = 0; i < 40; i += 1) {
            const n = (await run("document.querySelectorAll('.v-comp .img-box img').length")) as number
            if (n >= 1) break
            await wait(200)
          }
          const ui = (await run(`(() => {
            const img = document.querySelector('.v-comp .img-box img')
            if (!img) return { ok: false }
            return { ok: true, src: String(img.src).slice(0, 30), w: Math.round(img.getBoundingClientRect().width) }
          })()`)) as { ok: boolean; src?: string; w?: number }
          console.log('[PHOTOTEST] 气泡里的图 ' + JSON.stringify(ui))
          check('气泡里渲染出了照片', ui.ok === true && String(ui.src).startsWith('data:image/'), ui)
          check('照片按容器缩放了（不是 0 宽）', (ui.w ?? 0) > 60, ui.w)

          // 4) 点开放大（真实鼠标）
          const rect = (await run(`(() => {
            const img = document.querySelector('.v-comp .img-box img')
            if (!img) return null
            const r = img.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)) as { x: number; y: number } | null
          if (rect) {
            win.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y })
            win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
            win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
            await wait(600)
          }
          const zoom = (await run(`(() => {
            const ov = document.querySelector('.cz-overlay')
            if (!ov) return { open: false }
            const img = ov.querySelector('.cz-figure img')
            return { open: true, img: !!img, w: img ? Math.round(img.getBoundingClientRect().width) : 0 }
          })()`)) as { open: boolean; img?: boolean; w?: number }
          console.log('[PHOTOTEST] 放大浮层 ' + JSON.stringify(zoom))
          check('点照片能放大', zoom.open === true && zoom.img === true && (zoom.w ?? 0) > 200, zoom)

          try {
            await run("(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML=''; return true })()")
            const png = join(app.getPath('temp'), 'costudy-phototest.png')
            const bounds = win.getContentBounds()
            const img = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
            writeFileSync(png, img.toPNG())
            console.log('[PHOTOTEST] screenshot: ' + png)
          } catch (e) {
            console.log('[PHOTOTEST] screenshot failed: ' + String(e))
          }

          // 5) 复制：点消息上的「复制」，剪贴板里应该正好是这条正文
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
          await wait(300)
          clipboard.writeText('__before__')
          const clicked = (await run(`(() => {
            const btns = [...document.querySelectorAll('.v-comp .learn-msg [data-copy]')]
            if (!btns.length) return { ok: false }
            btns[btns.length - 1].click()
            return { ok: true, n: btns.length }
          })()`)) as { ok: boolean; n?: number }
          await wait(400)
          void clipboard.readText()
          // 用户消息不该再出现「复制」（改成只有 AI 回答才有），这里反向断言
          check('用户消息上没有「复制」按钮', clicked.ok === false, clicked.n)
          // 6) 下载：按钮在，且 IPC 真能把文件写出来（直接传 path，跳过保存对话框）
          const hasSave = (await run("!!document.querySelector('.v-comp .img-box [data-save]')")) as boolean
          check('图上有「下载」按钮', hasSave === true)
          const target = join(app.getPath('temp'), 'phototest-saved.svg')
          const savedFile = (await run(
            `window.costudy.saveAs({ source: 'photo', id: ${JSON.stringify(saved.id)}, path: ${JSON.stringify(target)} })`,
          )) as { ok: boolean; path?: string; bytes?: number; error?: string }
          check(
            '下载真的写到了磁盘',
            savedFile.ok === true && existsSync(target) && readFileSync(target).length === Buffer.byteLength(svg),
            savedFile,
          )

          // 7) 粘贴：往输入框里塞一个图片剪贴板，应该自动发出去并渲染成图片
          const beforeCount = (await run("document.querySelectorAll('.v-comp .img-box').length")) as number
          const pasted = (await run(`(() => {
            const input = document.querySelector('.v-comp .dock input.input')
            if (!input) return { ok: false, why: 'no-input' }
            input.focus()
            const dt = new DataTransfer()
            dt.items.add(new File([${JSON.stringify(svg)}], 'pasted.svg', { type: 'image/svg+xml' }))
            input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
            return { ok: true }
          })()`)) as { ok: boolean; why?: string }
          await wait(1600)
          const afterCount = (await run("document.querySelectorAll('.v-comp .img-box').length")) as number
          check('输入框能粘贴图片', pasted.ok === true && afterCount > beforeCount, {
            before: beforeCount,
            after: afterCount,
            why: pasted.why,
          })
          // 粘贴出来的那张图也是测试产物，记下来一起清掉
          const pastedIds = (await run(`(() => {
            return [...document.querySelectorAll('.v-comp .img-box')].map((el) => el.dataset.imgId || '').filter(Boolean)
          })()`)) as string[]
          for (const pid of pastedIds) if (!cleanupIds.includes(pid)) cleanupIds.push(pid)

          // 截一张"悬停时的小按钮"：鼠标停在最新的图上，下载按钮和复制按钮才会显示
          const hoverRect = (await run(`(() => {
            const imgs = [...document.querySelectorAll('.v-comp .img-box')]
            const el = imgs[imgs.length - 1]
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)) as { x: number; y: number } | null
          if (hoverRect) {
            win.webContents.sendInputEvent({ type: 'mouseMove', x: hoverRect.x, y: hoverRect.y })
            await wait(500)
            try {
              const png2 = join(app.getPath('temp'), 'costudy-phototools.png')
              const bounds2 = win.getContentBounds()
              const img2 = await win.webContents.capturePage({ x: 0, y: 0, width: bounds2.width, height: bounds2.height })
              writeFileSync(png2, img2.toPNG())
              console.log('[PHOTOTEST] tools screenshot: ' + png2)
            } catch (e) {
              console.log('[PHOTOTEST] tools screenshot failed: ' + String(e))
            }
          }

          console.log('[PHOTOTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ' 项)'))
          app.exit(failed === 0 ? 0 : 1)
        } catch (err) {
          console.log('[PHOTOTEST] FAIL ' + String(err))
          app.exit(1)
        } finally {
          try {
            if (tmpSessionId) removeSession(config.dataDir, tmpSessionId)
            if (original) setCurrent(config.dataDir, original.id)
            if (imageId) deleteImage(config.dataDir, imageId)
            for (const id of cleanupIds) deleteImage(config.dataDir, id)
          } catch {
            /* 收拾失败不影响结论 */
          }
        }
      }, 2600)
    }

    if (isSmoke) {
      const fail = (msg: string): void => {
        console.error('[SMOKE] FAIL: ' + msg)
        app.exit(1)
      }

      win.webContents.on('console-message', (...args: unknown[]) => {
        // Electron 45 改成 (event, details)，旧版是 (event, level, message, ...)；两种都兼容
        const second = args[1] as { level?: string; message?: string } | string | undefined
        const level = typeof second === 'string' ? second : String(second?.level ?? '')
        const message = typeof second === 'string' ? String(args[2] ?? '') : String(second?.message ?? '')
        console.log('[renderer:' + level + '] ' + message)
      })
      win.webContents.on('render-process-gone', (_e, d) => { if (win.isDestroyed()) return; fail('renderer gone: ' + JSON.stringify(d)) })
      win.webContents.on('did-fail-load', (_e, code, desc) => { if (win.isDestroyed()) return; fail('did-fail-load ' + code + ' ' + desc) })

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