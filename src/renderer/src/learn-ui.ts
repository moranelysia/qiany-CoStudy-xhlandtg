/**
 * 学习界面接线（P1 最后一步）。
 *
 * 把 Companion 学习页从"原型夹具"换成真实会话：
 *   · 进页面 -> ensureSession（没有就建）-> 渲染历史消息
 *   · 底部显示当前阶段（目标确认 / 逐点教学 …）
 *   · 发送 -> learn:reply（落盘 + 调模型）-> 显示回复并再落盘
 *
 * 为什么用 MutationObserver 而不是改 companion.js：
 *   那是原型变体代码，画面结构由它管；这里只做"数据接管"，
 *   变体重建后自动重挂，不需要改它的渲染逻辑。
 */
import { speak, stopSpeaking } from './speech-play'
import { isMicRunning, startMic, stopMic } from './mic-input'

interface SessionMeta {
  id: string
  phase: string
  title: string
  count: number
}

interface Msg {
  role: 'user' | 'assistant'
  text: string
  at: string
}

import { renderChart, splitCharts } from './chart-ui'
import { setMathContent } from './math-ui'

const PHASE_LABEL: Record<string, string> = {
  opening: '开场',
  goal: '目标确认',
  probe: '学情探测',
  breakdown: '知识点拆解',
  teach: '逐点教学',
  check: '阶段检验',
  wrap: '收尾',
}

let sessionId = ''
let busy = false
let rendering = false

function thread(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.v-comp .learn-thread')
}

function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'learn-msg ' + (role === 'user' ? 'me' : 'ai')

  // 助手消息里可能带 [画图: {...}]：拆成文字段 + 图表段
  const segments = role === 'assistant' ? splitCharts(text) : [{ type: 'text' as const, text }]
  for (const seg of segments) {
    if (seg.type === 'text') {
      const b = document.createElement('div')
      b.className = 'learn-bubble'
      // 文字段走 KaTeX：分数上下堆叠、指数上标，和课本一致
      setMathContent(b, seg.text)
      wrap.appendChild(b)
    } else {
      const chartWrap = document.createElement('div')
      chartWrap.className = 'learn-chart'
      chartWrap.style.cssText = 'width:100%;max-width:78%;margin-top:6px'
      wrap.appendChild(chartWrap)
      void renderChart(seg.spec, chartWrap)
    }
  }
  return wrap
}

function setPhase(meta: SessionMeta): void {
  const top = document.querySelector<HTMLElement>('.v-comp .learn-top')
  if (!top) return
  let chip = top.querySelector<HTMLElement>('[data-phase]')
  if (!chip) {
    chip = document.createElement('span')
    chip.setAttribute('data-phase', '')
    chip.style.cssText =
      'margin-left:10px;padding:2px 10px;border-radius:999px;font-size:11px;color:#0a5cc4;background:rgba(10,132,255,.12)'
    top.appendChild(chip)
  }
  chip.textContent = PHASE_LABEL[meta.phase] ?? meta.phase
  chip.title = '当前阶段 · 由状态机决定'
  void renderDueChip(top)
}

/**
 * 「今天该复习 N 条」胶囊。
 *
 * 间隔重复的数据层早就有了（learn/points.ts），但界面上一处都没露 ——
 * 等于用户永远不知道有东西该复习。这里把它放到学习页顶部，
 * 点一下打开画像浮层看具体是哪几条。
 */
let dueChipBusy = false

async function renderDueChip(top: HTMLElement): Promise<void> {
  if (dueChipBusy) return
  const api = window.costudy
  if (!api?.learnOverview) return
  dueChipBusy = true
  try {
    const data = (await api.learnOverview()) as unknown as { due?: unknown[] } | null
    const count = data?.due?.length ?? 0
    let chip = top.querySelector<HTMLElement>('[data-due]')
    if (!chip) {
      chip = document.createElement('span')
      chip.setAttribute('data-due', '')
      chip.style.cssText =
        'margin-left:8px;padding:2px 10px;border-radius:999px;font-size:11px;cursor:pointer;color:#0a5cc4;background:rgba(10,132,255,.08)'
      top.appendChild(chip)
    }
    chip.textContent = count > 0 ? '今天该复习 ' + count + ' 条' : '今天没有要到期的'
    chip.style.opacity = count > 0 ? '1' : '.55'
    chip.title = '点开看具体哪几条'
    chip.onclick = () => {
      const open = (window as unknown as Record<string, unknown>).__costudyOpenOverview as
        | (() => void)
        | undefined
      if (open) open()
    }
  } catch {
    /* 拿不到就不显示 */
  } finally {
    dueChipBusy = false
  }
}

/** 从当前角色卡取开场白 */
async function loadOpening(): Promise<string | null> {
  const api = window.costudy
  if (!api?.cards) return null
  try {
    const list = await api.cards.list()
    const active = list.find((c) => c.isActive) ?? list[0]
    if (!active) return null
    const card = await api.cards.get(active.id)
    const text = (card?.opening || card?.firstMes || '').trim()
    return text || null
  } catch {
    return null
  }
}

/**
 * 上一次真正画进 DOM 的会话指纹。
 *
 * 为什么必须记：observer 盯的是整个 body，而 renderHistory 自己会
 * `thread.innerHTML = ''` 再塞几十个气泡 —— 这些写入又会触发 observer，
 * 于是「渲染 -> 触发 -> 再渲染」无限重画。每重画一次，所有气泡的入场动画
 * 都被重置回 opacity:0，于是任何时刻截屏都可能看到"半透明 / 叠在一起 / 一片空白"，
 * 而消息数永远是齐的（55 条），看起来像"数据没问题但界面不显示"。
 * 实测（诊断.jsonl）里 opacity 在 0 和 1 之间反复横跳、时间线却正常推进，
 * 就是这条回路的证据。
 *
 * 指纹 = 会话 id + 条数 + 最后一条正文。内容没变就不碰 DOM，回路自然断掉。
 */
let lastSig = ''
/** 上一次把内容画进的那个 thread 元素；变体重建后它会换一个新的，必须重画 */
let renderedEl: HTMLElement | null = null

async function renderHistory(): Promise<void> {
  const api = window.costudy
  if (!api?.sessionEnsure || rendering || busy) return
  const t = thread()
  if (!t) return

  rendering = true
  try {
    const meta = (await api.sessionEnsure()) as unknown as SessionMeta | null
    if (!meta) return
    sessionId = meta.id

    const msgs = ((await api.sessionMessages(meta.id)) ?? []) as unknown as Msg[]
    const sig = meta.id + '|' + msgs.length + '|' + (msgs[msgs.length - 1]?.text ?? '')
    // 同一个 thread 元素 + 内容没变 => 这次是我们自己刚写的，别再重画
    if (sig === lastSig && t === renderedEl) return
    lastSig = sig
    renderedEl = t

    setPhase(meta)
    t.innerHTML = ''
    if (msgs.length === 0) {
      // 开场白取自角色卡的 opening（没有就用 firstMes），不再写死一句通用提示。
      // 不落盘：它是模板，落盘会让每次新建会话都多出一条同样的记录。
      const opening =
        (await loadOpening()) ?? '说说你想弄懂什么 —— 我会先问清目标，再一步步往下讲。'
      t.appendChild(bubble('assistant', opening))
      return
    }
    for (const m of msgs) t.appendChild(bubble(m.role, m.text))
    t.scrollTop = t.scrollHeight
  } finally {
    rendering = false
  }
}

async function send(text: string): Promise<void> {
  const api = window.costudy
  const t = thread()
  if (!api?.learnReply || !t || busy) return
  busy = true
  t.appendChild(bubble('user', text))
  t.scrollTop = t.scrollHeight

  stopSpeaking()
  const pending = bubble('assistant', '…')
  t.appendChild(pending)
  t.scrollTop = t.scrollHeight

  try {
    const result = await api.learnReply({ sessionId, text, search: searchOn() })
    pending.remove()
    if (!result.ok) {
      t.appendChild(bubble('assistant', '（这一句没发出去：' + (result.error ?? '未知错误') + '）'))
      return
    }
    const reply = bubble('assistant', result.reply ?? '')
    // 联网了就把来源挂在气泡下面，用户能点回去核对
    if (result.sources?.length) {
      const list = document.createElement('ul')
      list.className = 'src-list'
      for (const source of result.sources.slice(0, 5)) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = source.url
        a.textContent = '· ' + (source.title || source.url)
        a.addEventListener('click', (ev) => {
          ev.preventDefault()
          void window.costudy?.openExternal?.(source.url)
        })
        li.appendChild(a)
        list.appendChild(li)
      }
      reply.appendChild(list)
    } else if (result.searchError) {
      const note = document.createElement('div')
      note.className = 'small muted'
      note.style.marginTop = '6px'
      note.textContent = '这轮没联网成功：' + result.searchError
      reply.appendChild(note)
    }
    t.appendChild(reply)
    t.scrollTop = t.scrollHeight
    // 语音开着就念出来（引擎关着时 speak 会直接返回）
    void speak(result.reply ?? '')
    if (result.sessionId) sessionId = result.sessionId
    if (result.phase) setPhase({ id: sessionId, phase: result.phase, title: '', count: 0 })
  } finally {
    busy = false
  }
}

/**
 * 伴学变体挂载后直接进学习模式。
 *
 * 原因：那个变体默认打开的是「问答」页 —— 里面是写死的 Q&A 列表（纯夹具）。
 * 真实流程根本用不到它，留着只会让人以为"问答就是这样的"。
 * 这里不删它的代码（删了怕影响别处），只是**不再让它成为入口**。
 */
/*
 * 【为什么不再用一个 autoEntered 布尔闩】
 *   旧实现只要见过一次 .v-comp 就把自动切换永久置位，之后再也不重试。
 *   实测在用户机器上出现过：.v-comp 明明挂载了、__costudyEnterLearn 也是 function，
 *   页面却一直停在访谈视图（诊断.jsonl：hasLearnWrap 连续 20 秒以上都是 false）。
 *   一次没切成功（变体还没注册入口 / 渲染中途抛错 / 时序没对上）就再也救不回来。
 *
 *   现在改成「目标状态 + 有界重试」：
 *     · 只要 .v-comp 在、且里面没有 .learn-wrap，就是没到位，继续试
 *     · 每 200ms 试一次，同一容器最多 15 次（约 3 秒），不会无限打转
 *     · 到位了就立刻停手，不会反复重渲染
 *   万一 enter() 抛错，写一条 [DIAG] 到 诊断.jsonl —— 下次就能看到真正的错因。
 */
let enterTarget: Element | null = null
let enterTries = 0
let enterTimer = 0

function ensureLearnView(): void {
  const comp = document.querySelector('.v-comp')
  if (!comp) {
    // 离开伴学变体：清干净，下次进来重新算
    enterTarget = null
    enterTries = 0
    window.clearTimeout(enterTimer)
    enterTimer = 0
    return
  }
  if (comp.querySelector('.learn-wrap')) {
    enterTries = 0
    return
  }
  if (enterTarget !== comp) {
    // 换了新容器（变体重建）：重新计时
    enterTarget = comp
    enterTries = 0
  }
  if (enterTimer || enterTries >= 15) return
  enterTries += 1

  const enter = (window as unknown as Record<string, unknown>).__costudyEnterLearn as
    | (() => void)
    | undefined
  if (typeof enter === 'function') {
    try {
      enter()
    } catch (e) {
      console.log(
        '[DIAG]' +
          JSON.stringify({
            stage: 'enterLearn-threw',
            try: enterTries,
            msg: String((e as Error)?.message ?? e),
          }),
      )
    }
  }
  enterTimer = window.setTimeout(() => {
    enterTimer = 0
    ensureLearnView()
  }, 200)
}

/**
 * 联网搜索开关。
 *
 * 学用户描述的样子：像 DeepSeek 客户端，输入框旁边一个开关，开着就这一轮先搜再答。
 * 状态存 localStorage —— 关掉应用再打开还是上次的选择。
 */
const SEARCH_KEY = 'costudy.search.on'

function searchOn(): boolean {
  try {
    return localStorage.getItem(SEARCH_KEY) === '1'
  } catch {
    return false
  }
}

function paintSearchToggle(): void {
  const on = searchOn()
  document.querySelectorAll<HTMLElement>('.v-comp .dock [data-search-toggle]').forEach((btn) => {
    btn.toggleAttribute('data-on', on)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
  })
}

export function installLearnSession(): void {
  // 学习页出现就接管：渲染历史 + 拦截发送
  const observer = new MutationObserver(() => {
    ensureLearnView()
    if (!thread()) return
    void renderHistory()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // 每次 DOM 变化后同步开关外观（渲染会把 dock 重建）
  const paintObserver = new MutationObserver(() => paintSearchToggle())
  paintObserver.observe(document.body, { childList: true, subtree: true })
  paintSearchToggle()

  // 麦克风按钮：点一下开始录音（实时把识别结果写进输入框），再点一下结束
  document.addEventListener(
    'click',
    (e) => {
      const mic = (e.target as HTMLElement).closest('.v-comp .dock [data-asr-mic]')
      if (!mic) return
      e.stopPropagation()
      e.preventDefault()
      const input = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
      const paint = (on: boolean): void => {
        mic.toggleAttribute('data-on', on)
        mic.textContent = on ? '听…' : '说'
      }
      if (isMicRunning()) {
        void stopMic().then((final) => {
          paint(false)
          if (final && input) {
            input.value = final
            input.focus()
          }
        })
        return
      }
      void startMic({
        onPartial: (text) => {
          if (input) input.value = text
        },
        onFinal: (text) => {
          if (!input) return
          input.value = text
          input.focus()
        },
        onError: (message) => {
          paint(false)
          window.__toast?.('语音识别出错：' + message)
        },
      }).then((res) => {
        if (!res.ok) {
          paint(false)
          window.__toast?.(res.error ?? '录音没起来')
          return
        }
        paint(true)
      })
    },
    { capture: true },
  )
  // 捕获阶段拦 dock 的发送，避免原型的假回复再插一条
  document.addEventListener(
    'click',
    (e) => {
      // 联网开关：切换 + 记住 + 立刻改外观
      const toggle = (e.target as HTMLElement).closest('.v-comp .dock [data-search-toggle]')
      if (toggle) {
        e.stopPropagation()
        e.preventDefault()
        try {
          localStorage.setItem(SEARCH_KEY, searchOn() ? '0' : '1')
        } catch {
          /* 存不了就只在内存里生效 */
        }
        paintSearchToggle()
        window.__toast?.(searchOn() ? '联网搜索已开：下一句会先查网页再答' : '联网搜索已关')
        return
      }
      const btn = (e.target as HTMLElement).closest('.v-comp .dock .dock-btn.send')
      if (!btn) return
      const input = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
      const text = (input?.value ?? '').trim()
      if (!text) return
      e.stopPropagation()
      e.preventDefault()
      input!.value = ''
      void send(text)
    },
    { capture: true },
  )

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      const input = e.target as HTMLElement
      if (!input.classList?.contains('input')) return
      if (!input.closest('.v-comp .dock')) return
      const text = (input as HTMLInputElement).value.trim()
      if (!text) return
      e.preventDefault()
      e.stopPropagation()
      ;(input as HTMLInputElement).value = ''
      void send(text)
    },
    { capture: true },
  )
}
