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
  const b = document.createElement('div')
  b.className = 'learn-bubble'
  b.textContent = text
  wrap.appendChild(b)
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

async function renderHistory(): Promise<void> {
  const api = window.costudy
  if (!api?.sessionEnsure || rendering) return
  const t = thread()
  if (!t) return

  rendering = true
  try {
    const meta = (await api.sessionEnsure()) as unknown as SessionMeta | null
    if (!meta) return
    sessionId = meta.id
    setPhase(meta)

    const msgs = ((await api.sessionMessages(meta.id)) ?? []) as unknown as Msg[]
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
    // SCROLL-BOTTOM：等布局算完再滚，否则 scrollHeight 还是旧的
    requestAnimationFrame(() => {
      t.scrollTop = t.scrollHeight
    })
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

  const pending = bubble('assistant', '…')
  t.appendChild(pending)
  t.scrollTop = t.scrollHeight

  try {
    const result = await api.learnReply({ sessionId, text })
    pending.remove()
    if (!result.ok) {
      t.appendChild(bubble('assistant', '（这一句没发出去：' + (result.error ?? '未知错误') + '）'))
      return
    }
    t.appendChild(bubble('assistant', result.reply ?? ''))
    t.scrollTop = t.scrollHeight
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
let autoEntered = false

function autoEnterLearn(): void {
  if (autoEntered) return
  const comp = document.querySelector('.v-comp')
  if (!comp) {
    // 离开伴学变体后复位，下次再进来还能自动切
    autoEntered = false
    return
  }
  if (comp.querySelector('.learn-wrap')) {
    autoEntered = true
    return
  }
  autoEntered = true
  const enter = (window as unknown as Record<string, unknown>).__costudyEnterLearn as
    | (() => void)
    | undefined
  if (enter) enter()
}

export function installLearnSession(): void {
  // AUTO-ENTER-RETRY：真实路径进来时没人调 __costudyEnterLearn，
  // 于是伴学停在开场页、没有 .learn-thread，消息无处渲染。
  // 这里做个短重试：看到伴学但没进学习视图，就自己进一次。
  let tries = 0
  const tryEnter = (): void => {
    if (tries >= 10) return
    tries += 1
    const comp = document.querySelector('.v-comp')
    if (comp && !comp.querySelector('.learn-thread')) {
      const w = window as unknown as Record<string, unknown>
      ;(w.__costudyEnterLearn as (() => void) | undefined)?.()
    }
    if (comp && comp.querySelector('.learn-thread')) return
    window.setTimeout(tryEnter, 300)
  }
  window.setTimeout(tryEnter, 400)

  // BUBBLE-FALLBACK：我们自己往 learn-thread 里插的气泡，
  // 如果 companion 的 CSS 没覆盖到，会出现"有 DOM 但看不见"。
  const css = document.createElement('style')
  // 关键：必须给 background-color（不是只有 gradient）。
  // 探针实测过：白字 + 透明底 = 内容全在、但看不见。
  css.textContent = `
    .v-comp .learn-thread .learn-bubble { color: #10151c !important; }
    .v-comp .learn-msg.me .learn-bubble {
      background-color: #0a84ff !important;
      background-image: linear-gradient(180deg, #0a84ff, #0a72e0) !important;
      color: #ffffff !important;
    }
    .v-comp .learn-msg.ai .learn-bubble {
      background-color: #e9f1fb !important;
      color: #10151c !important;
    }
    .v-comp .learn-msg .learn-bubble { padding: 10px 14px !important; border-radius: 16px !important; }
  `
  document.head.appendChild(css)

  // 学习页出现就接管：渲染历史 + 拦截发送
  const observer = new MutationObserver(() => {
    autoEnterLearn()
    if (!thread()) return
    void renderHistory()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // 捕获阶段拦 dock 的发送，避免原型的假回复再插一条
  document.addEventListener(
    'click',
    (e) => {
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
