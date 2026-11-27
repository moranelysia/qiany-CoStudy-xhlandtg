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
import { speak, speakSlow, stopSpeaking } from './speech-play'
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
  tools?: string[]
}

import { renderChart, splitCharts } from './chart-ui'
import { openMemoryLibrary } from './memory-ui'
import { setMarkdownContent } from './markdown'
import { openSettings } from './settings-ui'

let sessionId = ''
let busy = false
let rendering = false
/** 每条消息"复制"按钮对应的原文（DOM 上只存引用，长文本不进 data 属性） */
const copyTexts = new WeakMap<HTMLElement, string>()

function thread(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#stage .v-comp .learn-thread')
}

/** 图表 / 照片右上角的「下载」工具条 */
/**
 * 图卡片「调参数」：给可调引擎挂一组滑杆，拖一下就用新参数重画。
 * 只对 optics / forces / em 开放 —— 电路是网表、装置是配方，滑杆没有意义。
 */
const PARAM_SPECS: Record<string, Array<{ key: string; label: string; min: number; max: number; step: number }>> = {
  optics: [
    { key: 'u', label: '物距 u', min: 2, max: 40, step: 1 },
    { key: 'f', label: '焦距 f', min: 2, max: 20, step: 1 },
    { key: 'h', label: '物高 h', min: 1, max: 8, step: 0.5 },
  ],
  forces: [
    { key: 'theta', label: '倾角 θ', min: 0, max: 80, step: 1 },
    { key: 'mu', label: '摩擦系数 μ', min: 0, max: 1.2, step: 0.05 },
    { key: 'm', label: '质量 m', min: 0.5, max: 10, step: 0.5 },
  ],
  em: [
    { key: 'v', label: '速度 v', min: 0.5, max: 6, step: 0.5 },
    { key: 'B', label: '磁感应 B', min: 0.2, max: 3, step: 0.1 },
    { key: 'q', label: '电荷 q', min: 0.5, max: 4, step: 0.5 },
  ],
}

async function attachParamPanel(box: HTMLElement, id: string): Promise<void> {
  const api = window.costudy
  if (!api?.chartsMeta || !api.chartsRerender) return
  let meta: { kind?: string; args?: Record<string, unknown> } | null = null
  try {
    meta = (await api.chartsMeta(id)) as { kind?: string; args?: Record<string, unknown> } | null
  } catch {
    return
  }
  const kind = meta?.kind ?? ''
  const spec = PARAM_SPECS[kind]
  if (!spec) return
  const base = { ...(meta?.args ?? {}) }
  const panel = document.createElement('div')
  panel.className = 'chart-params'
  panel.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-top:1px solid rgba(120,148,178,.18)'
  let timer: number | undefined
  for (const item of spec) {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--label-2)'
    const name = document.createElement('span')
    name.style.cssText = 'min-width:76px'
    const val = Number(base[item.key] ?? item.min)
    name.textContent = item.label + ' ' + val
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(item.min)
    slider.max = String(item.max)
    slider.step = String(item.step)
    slider.value = String(val)
    slider.style.flex = '1'
    slider.addEventListener('input', () => {
      const v = Number(slider.value)
      name.textContent = item.label + ' ' + v
      base[item.key] = v
      // 拖动时 180ms 合并一次，别每个像素都请求一次重画
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void (async () => {
          const res = await api.chartsRerender?.(kind, base)
          if (!res?.ok || !res.id) return
          const svg = await api.chartsGet?.(res.id)
          if (!svg) return
          const holder = box.querySelector('svg')
          if (holder?.parentElement) {
            const tmp = document.createElement('div')
            tmp.innerHTML = svg
            const next = tmp.querySelector('svg')
            if (next) holder.replaceWith(next)
          }
        })()
      }, 180)
    })
    row.append(name, slider)
    panel.appendChild(row)
  }
  box.appendChild(panel)
}

function saveTools(source: 'photo' | 'chart', id: string): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'img-tools'
  const mk = (text: string, attrs: Record<string, string>): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'msg-act'
    b.textContent = text
    for (const [k, v] of Object.entries(attrs)) b.dataset[k] = v
    bar.appendChild(b)
    return b
  }
  if (source === 'photo') {
    mk('下载', { save: '1', saveSource: 'photo', saveId: id })
    return bar
  }
  // 图表卡片：下载 SVG、下载 PNG、看原理、看步骤、重画
  mk('SVG', { save: '1', saveSource: 'chart', saveId: id })
  mk('PNG', { png: '1', pngId: id })
  mk('原理', { meta: '1', metaId: id, metaKind: 'principle' })
  mk('步骤', { meta: '1', metaId: id, metaKind: 'steps' })
  mk('重画', { redraw: '1', redrawId: id })
  return bar
}

/** 把卡片里的 SVG 画到 canvas，导出 PNG data URL（2 倍分辨率，打印也清楚） */
function svgToPngDataUrl(svg: SVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const box = svg.getBoundingClientRect()
    const w = Math.max(320, Math.round(box.width || 640))
    const h = Math.max(200, Math.round(box.height || (w * 0.62)))
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    const data = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = w * scale
        canvas.height = h * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('没有 canvas 上下文'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = () => reject(new Error('图读不出来'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data)
  })
}

function bubble(role: 'user' | 'assistant', text: string, tools?: string[]): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'learn-msg ' + (role === 'user' ? 'me' : 'ai')

  // 助手消息里可能带 [画图: {...}]：拆成文字段 + 图表段
  // 工具画图只回一个 [chart:id] 标记，先把它从正文里剥掉
  // 另外：有的模型会把工具调用当正文吐出来（<tool_call>…</tool_call> / [diagram_spec]），
  // 历史消息里已经存了这种垃圾，这里统一剥掉 —— 用户不该看到协议文本。
  const sanitized = text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    // 整行只有一个 [工具名] / 【工具名】（工具名都带下划线，普通方括号文字不会被误伤）
    .replace(/^[ \t]*(?:\[|【)[ \t]*[a-z][a-z0-9]*(?:_[a-z0-9]+)+[ \t]*(?:\]|】)[ \t]*$/gim, '')
    // 「[工具调用]」这种占位符也不该出现在聊天里
    .replace(/^[ \t]*(?:\[|【)[ \t]*(?:工具调用|调用工具|tool[ _]?call)[ \t]*(?:\]|】)[ \t]*$/gim, '')
  const chartIds = Array.from(sanitized.matchAll(/\[chart:(c-[a-f0-9]+)\]/g)).map((m) => m[1])
  const imageIds = Array.from(sanitized.matchAll(/\[图片:(i-[a-f0-9]{12})\]/g)).map((m) => m[1])
  const cleanText = sanitized
    .replace(/\[读:[^\]|]+(\|slow)?\]/g, '')
    .replace(/\[chart:(c-[a-f0-9]+)\]/g, '')
    .replace(/\[图片:(i-[a-f0-9]{12})\]/g, '')
    .trim()
  // [读:apple] / [读:apple|slow]：模型教发音时插的朗读标记，渲染成一个可点的胶囊
  const speakTokens = Array.from(sanitized.matchAll(/\[读:([^\]|]+)(\|slow)?\]/g)).map((m) => ({
    text: m[1].trim(),
    slow: Boolean(m[2]),
  }))
  const segments = role === 'assistant' ? splitCharts(cleanText) : [{ type: 'text' as const, text: cleanText }]
  for (const seg of segments) {
    if (seg.type === 'text') {
      const b = document.createElement('div')
      b.className = 'learn-bubble'
      // 文字段走 KaTeX：分数上下堆叠、指数上标，和课本一致
      setMarkdownContent(b, seg.text)
      wrap.appendChild(b)
    } else {
      const chartWrap = document.createElement('div')
      chartWrap.className = 'learn-chart'
      chartWrap.style.cssText = 'width:100%;max-width:78%;margin-top:6px'
      wrap.appendChild(chartWrap)
      void renderChart(seg.spec, chartWrap)
    }
  }
  // 朗读胶囊：点一下念这个词/句，慢读时逐词念
  for (const token of speakTokens) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'speak-chip'
    chip.textContent = (token.slow ? '🔊 慢读 ' : '🔊 ') + token.text
    chip.title = token.slow ? '逐词慢读' : '朗读'
    chip.addEventListener('click', () => {
      stopSpeaking()
      void (token.slow ? speakSlow(token.text) : speak(token.text))
    })
    wrap.appendChild(chip)
  }

  // 图表：凭 id 向主进程取 SVG 再塞进来（消息里只有标记，图不在正文里）
  for (const id of chartIds) {
    const box = document.createElement('div')
    box.className = 'chart-box'
    box.style.cssText = 'margin-top:8px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.72)'
    box.textContent = '画图中…'
    wrap.appendChild(box)
    void (async () => {
      const svg = await window.costudy?.chartsGet?.(id)
      // 空串/半截内容也算没取到，否则界面上就是空白小方块（用户只会说"图又加载不出来了"）
      if (!svg || !String(svg).includes('<svg')) {
        void window.costudy?.diagRender?.({ stage: 'chart-empty', id: id, got: typeof svg, len: String(svg ?? '').length })
        // 只有两种可能：写盘没成功，或者模型自己编了个不存在的编号。
        const tip = document.createElement('div')
        tip.className = 'chart-missing'
        tip.style.cssText =
          'display:flex;align-items:center;gap:10px;padding:12px 14px;font-size:12.5px;color:var(--label-2);line-height:1.5'
        const label = document.createElement('span')
        label.style.flex = '1'
        label.textContent = '这张图没存下来（画图时写盘失败，或者编号是编的）'
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'chart-retry'
        retry.textContent = '重画一次'
        retry.style.cssText =
          'flex:none;padding:6px 13px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:12px;font-weight:600;color:#0a5cc4;background:rgba(10,132,255,.12)'
        retry.addEventListener('click', () => {
          retry.disabled = true
          retry.textContent = '重新画…'
          void send('刚才那张图没显示出来，麻烦重画一次')
        })
        tip.append(label, retry)
        box.appendChild(tip)
        return
      }
      box.textContent = ''
      // 这一行被误删过一次：没有它，卡片里就只剩工具条，图是空白（25 个卡片 0 个 svg）
      box.innerHTML = svg
      box.appendChild(saveTools('chart', id))
      // 「调参数」：光学/受力/电磁可调，拖滑杆就重画
      void attachParamPanel(box, id)
    })()
  }
  // 图片：凭 id 向主进程取 data URL 再塞进 <img>（消息里只有 [图片:id] 标记）
  for (const id of imageIds) {
    const box = document.createElement('div')
    box.className = 'img-box'
    box.dataset.imgId = id
    box.style.cssText = 'margin-top:8px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.6);min-width:80px;min-height:40px'
    wrap.appendChild(box)
    void (async () => {
      const img = await window.costudy?.imageGet?.(id)
      box.textContent = ''
      if (!img) {
        const tip = document.createElement('div')
        tip.style.cssText = 'padding:12px 14px;font-size:12.5px;color:var(--label-2)'
        tip.textContent = '这张图找不到了（可能已经删掉）'
        box.appendChild(tip)
        return
      }
      const el = document.createElement('img')
      el.src = img.dataUrl
      el.alt = img.name
      el.style.cssText = 'display:block;max-width:100%;max-height:420px;height:auto'
      box.appendChild(el)
      box.appendChild(saveTools('photo', id))
    })()
  }
  appendToolTag(wrap, tools)
  // 「复制」只给 AI 的回答：用户的问题他自己有，不需要复制（用户明确要求去掉）
  const copyable = role === 'assistant' ? cleanText : ''
  if (copyable) {
    const actions = document.createElement('div')
    actions.className = 'msg-actions'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'msg-act'
    btn.dataset.copy = '1'
    btn.textContent = '复制'
    copyTexts.set(btn, copyable)
    actions.appendChild(btn)
    // 贴在 AI 回答正文的旁边：塞进第一个文字气泡里，用绝对定位浮在右上角
    const firstBubble = wrap.querySelector('.learn-bubble')
    if (firstBubble instanceof HTMLElement) {
      firstBubble.classList.add('has-copy')
      firstBubble.appendChild(actions)
    } else {
      wrap.appendChild(actions)
    }
  }
  return wrap
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
/** 上一次画进界面的消息条数（清空按钮上要显示"清空 N 条"） */
let lastMsgCount = 0

function appendToolTag(container: HTMLElement, tools?: string[]): void {
  if (!tools?.length) return
  const labels: Record<string, string> = { get_current_time: '查询了当前时间' }
  const tag = document.createElement('div')
  tag.className = 'tool-tag'
  tag.textContent = '· ' + tools.map((name) => labels[name] ?? ('调用了 ' + name)).join(' · ')
  container.appendChild(tag)
}

async function renderHistory(): Promise<void> {
  const api = window.costudy
  if (!api?.sessionEnsure || rendering || busy) return
  const t = thread()
  if (!t) return

  rendering = true
  try {
    const meta = (await api.sessionEnsure()) as unknown as SessionMeta | null
    if (!meta || thread() !== t || busy) return

    const msgs = ((await api.sessionMessages(meta.id)) ?? []) as unknown as Msg[]
    if (thread() !== t || busy) return
    sessionId = meta.id
    lastMsgCount = msgs.length
    const sig = meta.id + '|' + msgs.length + '|' + (msgs[msgs.length - 1]?.text ?? '')
    // 同一个 thread 元素 + 内容没变 => 这次是我们自己刚写的，别再重画
    if (sig === lastSig && t === renderedEl) return
    const content = document.createDocumentFragment()
    if (msgs.length === 0) {
      // 开场白取自角色卡的 opening（没有就用 firstMes），不再写死一句通用提示。
      // 不落盘：它是模板，落盘会让每次新建会话都多出一条同样的记录。
      const opening =
        (await loadOpening()) ?? '说说你想弄懂什么 —— 我会先问清目标，再一步步往下讲。'
      if (thread() !== t || busy) return
      content.appendChild(bubble('assistant', opening))
    } else {
      for (const m of msgs) content.appendChild(bubble(m.role, m.text, m.tools))
    }
    lastSig = sig
    renderedEl = t
    t.replaceChildren(content)
    t.scrollTop = t.scrollHeight
  } finally {
    rendering = false
    if (thread() !== t) void renderHistory()
  }
}

/* ==========================================================
   清空聊天记录
   ==========================================================
   入口放在学习页头部（「联网查一下 / 改所学内容」旁边），**不放进 dock**：
   dock 里全是"发送"这类高频正向动作，把不可撤销的删除摆在发送键旁边，
   手一滑就是整段清零。

   两次点击才算确认：第一次按钮变红字「再点一次，清空 N 条」，4 秒不点自动收回。
   不用 window.confirm —— 阻塞式原生弹窗脚本自检点不了（--uitest 吃过这个亏），
   风格也和整屏玻璃对不上。

   数据侧：主进程把原 jsonl 挪进 记忆/会话/已删除/（可捞回来），
   索引归零回到「开场」。retrieval 只扫 会话/*.jsonl，备份不会被召回。
   ========================================================== */
let clearTimer = 0

function paintClearButton(btn: HTMLButtonElement, armed: boolean): void {
  btn.toggleAttribute('data-armed', armed)
  btn.textContent = armed ? (lastMsgCount > 0 ? '再点一次，清空 ' + lastMsgCount + ' 条' : '再点一次') : '清空对话'
  btn.style.cssText = armed ? 'flex:none;color:#c0392b;background:rgba(255,69,58,.12)' : 'flex:none'
}

async function doClearMessages(btn: HTMLButtonElement): Promise<void> {
  const api = window.costudy
  window.clearTimeout(clearTimer)
  if (!api?.sessionClear) return
  btn.disabled = true
  btn.textContent = '清空中…'
  try {
    const res = await api.sessionClear(sessionId)
    if (!res?.ok) {
      window.__toast?.('没清掉：' + (res?.error ?? '未知错误'))
      return
    }
    // 指纹和已画元素都清掉，强制 renderHistory 重画（否则会被"内容没变"挡回去）
    lastSig = ''
    renderedEl = null
    lastMsgCount = 0
    await renderHistory()
    window.__toast?.(res.removed > 0 ? '已清空 ' + res.removed + ' 条聊天记录' : '本来就没有记录')
  } catch (e) {
    window.__toast?.('清空失败：' + String((e as Error)?.message ?? e))
  } finally {
    btn.disabled = false
    paintClearButton(btn, false)
  }
}

function ensureClearButton(): void {
  const top = document.querySelector<HTMLElement>('.v-comp .learn-top')
  if (!top || top.querySelector('[data-clear-thread]')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn ghost'
  btn.setAttribute('data-clear-thread', '')
  btn.title = document.documentElement.dataset.platform === 'web'
    ? '清空此浏览器的当前对话记录'
    : '删除这个会话的聊天记录（原记录备份在 记忆/会话/已删除/）'
  paintClearButton(btn, false)
  btn.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    if (busy) {
      window.__toast?.('这条回复还没回来，等一下再清')
      return
    }
    if (btn.hasAttribute('data-armed')) {
      void doClearMessages(btn)
      return
    }
    paintClearButton(btn, true)
    window.clearTimeout(clearTimer)
    clearTimer = window.setTimeout(() => paintClearButton(btn, false), 4000)
  })
  top.appendChild(btn)
}

function ensureLearnSettingsButton(): void {
  const top = document.querySelector<HTMLElement>('.v-comp .learn-top')
  if (!top || top.querySelector('[data-learn-model]')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn ghost'
  button.dataset.learnModel = ''
  button.textContent = '模型设置'
  button.addEventListener('click', () => void openSettings())
  top.appendChild(button)
}

/**
 * 顶部「学习报告」按钮：把当前会话导出成一份可打印的 HTML。
 *
 * 为什么用导出而不是在页面上画图表：报告能截图、能打印、能直接贴进比赛材料，
 * 而且不用碰原型 UI 的渲染逻辑（那里动一下容易连锁坏）。
 */
function ensureReportButton(): void {
  // 浏览器体验版没有 learnReportOpen（报告要读主进程的会话状态），不挂一个点不动的按钮
  if (!window.costudy?.learnReportOpen) return
  const top = document.querySelector<HTMLElement>('.v-comp .learn-top')
  if (!top || top.querySelector('[data-learn-report]')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn ghost'
  btn.setAttribute('data-learn-report', '')
  btn.textContent = '学习报告'
  btn.title = '导出本节课的七阶段进度、知识点掌握度、检验结果与错题'
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    const api = window.costudy
    if (!api?.learnReportOpen) return
    btn.disabled = true
    try {
      const result = await api.learnReportOpen(sessionId || undefined)
      window.__toast?.(result.ok ? '学习报告已生成' : result.error || '生成失败')
    } catch {
      window.__toast?.('暂时无法生成学习报告，请重试。')
    } finally {
      btn.disabled = false
    }
  })
  top.appendChild(btn)
}

async function send(text: string, input?: HTMLInputElement): Promise<void> {
  const api = window.costudy
  const t = thread()
  if (!t) return
  if (busy) {
    window.__toast?.('上一条消息还在处理，请稍后发送。')
    return
  }
  if (!api?.learnReply) {
    window.__toast?.('当前页面无法发送消息。')
    return
  }
  busy = true
  const draft = input?.value ?? ''
  let edited = false
  const markEdited = (): void => { edited = true }
  if (input) {
    input.value = ''
    input.addEventListener('input', markEdited)
  }

  const sent = bubble('user', text)
  t.appendChild(sent)
  t.scrollTop = t.scrollHeight

  stopSpeaking()
  const pending = bubble('assistant', '…')
  t.appendChild(pending)
  t.scrollTop = t.scrollHeight
  const showSendError = (message: string, queued = false, requiresModel = false): void => {
    if (!queued) {
      sent.remove()
      if (input?.isConnected && thread() === t && !edited && !input.value) input.value = draft
    }
    if (thread() !== t) return
    const error = bubble('assistant', queued ? '（' + message + '）' : '（这一句没发出去：' + message + '）')
    if (requiresModel) {
      const settings = document.createElement('button')
      settings.className = 'btn ghost'
      settings.type = 'button'
      settings.textContent = '去配置模型'
      settings.addEventListener('click', () => void openSettings())
      error.querySelector('.learn-bubble')?.appendChild(settings)
    } else if (document.documentElement.dataset.platform === 'web') {
      const trial = document.createElement('a')
      trial.href = './trial.html'
      trial.textContent = '先免密钥试学一道题'
      error.querySelector('.learn-bubble')?.appendChild(trial)
    }
    t.appendChild(error)
    t.scrollTop = t.scrollHeight
  }

  try {
    const result = await api.learnReply({ sessionId, text, search: searchOn() })
    pending.remove()
    if (!result.ok) {
      if (result.queued) {
        if (result.sessionId) sessionId = result.sessionId
        if (thread() === t) lastMsgCount += 1
      }
      showSendError(result.error ?? '未知错误', result.queued, result.requiresModel)
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
    // 工具调用要可见：用户得知道"这个回答是查过实时数据才给出的"
    // 工具标记由 renderHistory 从消息数据的 tools 字段渲染（落盘后自动出现）
    void speak(result.reply ?? '')
    if (result.sessionId) sessionId = result.sessionId
    if (thread() === t) {
      lastMsgCount += 2
      window.dispatchEvent(new Event('costudy:turn-complete'))
      if (document.documentElement.dataset.platform !== 'web') {
        void api.sessionMessages(sessionId).then((messages) => {
          const latest = messages.at(-1) as Msg | undefined
          if (reply.isConnected && latest?.role === 'assistant' && latest.text === result.reply) {
            appendToolTag(reply, latest.tools)
          }
        }).catch(() => undefined)
      }
    }
  } catch (error) {
    showSendError(error instanceof Error ? error.message : String(error))
  } finally {
    input?.removeEventListener('input', markEdited)
    pending.remove()
    busy = false
    if (thread() !== t) void renderHistory()
  }
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

let learnInstalled = false

export function installLearnSession(): void {
  // 只装一次：重复调用会让 dock 上多出一份「0% / 忆 / Σ」，并成倍放大观察器开销
  if (learnInstalled) return
  learnInstalled = true
  // 右键「说」：切换"说完自动发送"（默认开）
  document.addEventListener(
    'contextmenu',
    (e) => {
      const mic = (e.target as HTMLElement).closest('.v-comp .dock [data-asr-mic]')
      if (!mic) return
      e.preventDefault()
      e.stopPropagation()
      const KEY = 'costudy.asr.autoSend'
      let on = true
      try {
        on = localStorage.getItem(KEY) !== '0'
      } catch {
        on = true
      }
      try {
        localStorage.setItem(KEY, on ? '0' : '1')
      } catch {
        /* 存不了就只在本次生效 */
      }
      window.__toast?.(on ? '语音：说完先填进输入框，不自动发' : '语音：说完自动发送')
    },
    { capture: true },
  )

  // 上下文占用圆环（放在输入框右边的「题」按钮旁边）：像 codex 那样一眼看出用了多少
  const ctxRing = document.createElement('div')
  ctxRing.className = 'ctx-ring'
  ctxRing.title = '上下文占用（估算）'
  ctxRing.innerHTML =
    '<svg viewBox="0 0 36 36" aria-hidden="true">' +
    '<circle cx="18" cy="18" r="15" fill="none" stroke="rgba(120,148,178,.28)" stroke-width="4"/>' +
    '<circle class="ctx-arc" cx="18" cy="18" r="15" fill="none" stroke="#0a7ae6" stroke-width="4" ' +
    'stroke-linecap="round" stroke-dasharray="0 94.25" transform="rotate(-90 18 18)"/>' +
    '</svg><span class="ctx-pct">0%</span>'
  const refreshCtx = async (): Promise<void> => {
    const api2 = window.costudy as unknown as {
      contextStats?: () => Promise<{ percent: number; usedTokens: number; windowTokens: number; messages: number; compressed: number; hasSummary: boolean; real?: boolean }>
    } | undefined
    const s = await api2?.contextStats?.()
    if (!s) return
    const arc = ctxRing.querySelector('.ctx-arc') as SVGCircleElement | null
    const pct = ctxRing.querySelector('.ctx-pct')
    const len = 2 * Math.PI * 15
    const p = Math.max(0, Math.min(100, s.percent))
    if (arc) {
      arc.setAttribute('stroke-dasharray', (len * p) / 100 + ' ' + len)
      arc.setAttribute('stroke', p >= 90 ? '#b42318' : p >= 60 ? '#b45309' : '#0a7ae6')
    }
    if (pct) pct.textContent = Math.round(p) + '%'
    ctxRing.title =
      '上下文约 ' + p + '%（' + (s.real ? '真实用量' : '估算') + ' ' + s.usedTokens.toLocaleString() + ' / ' + s.windowTokens.toLocaleString() + ' tokens）\n' +
      '会话 ' + s.messages + ' 条，已压缩 ' + s.compressed + ' 条' + (s.hasSummary ? '（有摘要）' : '') +
      '\n压缩按 token 触发：未压缩部分超窗口 60% 才压，压到最近部分 ≤25%'
  }
  ctxRing.addEventListener('click', () => void refreshCtx())
  // 真实学习时长：在伴学页里每 20 秒记一次，窗口不在前台就不记
  window.setInterval(() => {
    const apiTick = (window.costudy as unknown as { studyTick?: (s: number) => Promise<number> } | undefined)?.studyTick
    if (!thread()) return
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return
    void apiTick?.(20)
  }, 20000)
  // 记忆库：输入框旁边的「忆」→ 打开记忆库界面（统计 / 检索 / 筛选 / 归档）
  const memBtn = document.createElement('button')
  memBtn.type = 'button'
  memBtn.className = 'mem-key'
  memBtn.title = '记忆库（可检索）'
  memBtn.textContent = '忆'
  memBtn.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    void openMemoryLibrary()
  })
  // 数学键盘：输入框旁边的「∑」。点符号就插到光标处，省得切输入法找 π、√、²
  const MATH_KEYS: string[][] = [
    ['π', '°', '∠', '△', '⊥', '∥', '√', '∞'],
    ['+', '−', '×', '÷', '±', '=', '≠', '≈'],
    ['≤', '≥', '²', '³', 'ⁿ', '½', '⅓', '¼'],
    ['α', 'β', 'γ', 'θ', 'λ', 'μ', 'ω', 'φ'],
    ['Δ', 'Σ', 'Ω', '∫', '∑', '∏', '∂', '→'],
    ['⇒', '⇔', '∈', '∉', '⊂', '∪', '∩', '∅'],
    ['(', ')', '[', ']', '{', '}', '|', '_'],
    ['x₁', 'x₂', 'y₁', 'y₂', 'aₙ', 'Sₙ', 'f(x)', 'lim'],
  ]
  const mathBtn = document.createElement('button')
  mathBtn.type = 'button'
  mathBtn.className = 'math-key'
  mathBtn.title = '数学键盘'
  mathBtn.textContent = '∑'
  const mathPad = document.createElement('div')
  mathPad.className = 'math-pad'
  mathPad.hidden = true
  for (const row of MATH_KEYS) {
    const line = document.createElement('div')
    line.className = 'mp-row'
    for (const sym of row) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'mp-key'
      b.textContent = sym
      b.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const box = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
        if (!box) return
        const start = box.selectionStart ?? box.value.length
        const end = box.selectionEnd ?? start
        box.value = box.value.slice(0, start) + sym + box.value.slice(end)
        const caret = start + sym.length
        box.setSelectionRange(caret, caret)
        box.focus()
      })
      line.appendChild(b)
    }
    mathPad.appendChild(line)
  }
  mathBtn.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    mathPad.hidden = !mathPad.hidden
    mathBtn.toggleAttribute('data-on', !mathPad.hidden)
  })
  document.addEventListener(
    'click',
    (ev) => {
      if (mathPad.hidden) return
      const el = ev.target as HTMLElement
      if (el.closest('.math-pad') || el.closest('.math-key')) return
      mathPad.hidden = true
      mathBtn.removeAttribute('data-on')
    },
    { capture: true },
  )
  let boundThread: HTMLElement | null = null
  const bindLearnView = (): void => {
    const current = thread()
    if (current === boundThread) return
    boundThread = current
    if (!current) {
      renderedEl = null
      return
    }
    const comp = current.closest('.v-comp')
    const dock = comp?.querySelector('.dock')
    mathPad.hidden = true
    mathBtn.removeAttribute('data-on')
    dock?.append(ctxRing, memBtn, mathBtn)
    comp?.appendChild(mathPad)
    ensureClearButton()
    ensureLearnSettingsButton()
    ensureReportButton()
    paintSearchToggle()
    void refreshCtx()
    void renderHistory()
  }
  const stage = document.getElementById('stage')
  if (stage) new MutationObserver(bindLearnView).observe(stage, { childList: true, subtree: true })
  bindLearnView()
  window.addEventListener('costudy:turn-complete', () => void refreshCtx())
  window.addEventListener('costudy:session-updated', () => void renderHistory())
  // 麦克风按钮：点一下开始录音（实时把识别结果写进输入框），再点一下结束
  document.addEventListener(
    'click',
    (e) => {
      const mic = (e.target as HTMLElement).closest('.v-comp .dock [data-asr-mic]') as HTMLElement | null
      if (!mic) return
      e.stopPropagation()
      e.preventDefault()
      const input = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
      const paint = (on: boolean): void => {
        mic.toggleAttribute('data-on', on)
        mic.textContent = on ? '听…' : '说'
        if (!on) mic.style.boxShadow = ''
      }
      // 「说完自动发」：默认开，可在本机设置里关掉（存 localStorage）
      const AUTO_SEND_KEY = 'costudy.asr.autoSend'
      const autoSendOn = (): boolean => {
        try {
          return localStorage.getItem(AUTO_SEND_KEY) !== '0'
        } catch {
          return true
        }
      }
      const finish = (final: string): void => {
        paint(false)
        if (!input) return
        input.value = final
        input.focus()
        if (final && autoSendOn()) {
          // 自动发送：说完就发出去，省一次点击
          void send(final, input)
        }
      }
      const stopAndFinish = (): void => {
        void stopMic().then(finish)
      }
      if (isMicRunning()) {
        stopAndFinish()
        return
      }
      // 音量环：看着有波动才知道真的在听
      const onLevel = (level: number): void => {
        const pct = Math.round(level * 100)
        mic.style.boxShadow = level > 0.02 ? '0 0 0 ' + Math.min(6, 1 + pct / 18) + 'px rgba(180,35,24,.35)' : ''
      }
      void startMic({
        onLevel,
        autoStopMs: 1400,
        onAutoStop: stopAndFinish,
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
      }).then(async (res) => {
        if (!res.ok) {
          paint(false)
          const msg = res.error ?? '录音没起来'
          // 没配引擎（默认就是 off）时，给一条能直接走通的路：改用系统听写
          if (msg.includes('没开') || msg.includes('不可用')) {
            const api2 = window.costudy as unknown as {
              asrProbeLocal?: () => Promise<{ ok: boolean; detail: string }>
              asrUseLocal?: () => Promise<unknown>
            } | undefined
            const probe = await api2?.asrProbeLocal?.()
            if (probe?.ok) {
              // 不弹 confirm：阻塞式原生弹窗在某些环境里根本出不来（脚本自检也点不了）。
              // 直接切到系统听写再重试，并 toast 说清楚发生了什么。
              paint(true)
              window.__toast?.('语音输入还没配引擎，已自动改用系统听写（' + probe.detail + '，离线）')
              await api2?.asrUseLocal?.()
              const retry = await startMic({
                onLevel,
                autoStopMs: 1400,
                onAutoStop: stopAndFinish,
                onPartial: (text) => {
                  if (input) input.value = text
                },
                onFinal: (text) => {
                  if (!input) return
                  input.value = text
                  input.focus()
                },
                onError: (m) => {
                  paint(false)
                  window.__toast?.('语音识别出错：' + m)
                },
              })
              if (retry.ok) {
                paint(true)
                return
              }
              window.__toast?.(retry.error ?? '还是没起来')
              return
            } else {
              window.__toast?.('本地听写也不可用：' + (probe?.detail ?? '未知原因'))
              return
            }
          }
          window.__toast?.(msg)
          return
        }
        paint(true)
      })
    },
    { capture: true },
  )
  // 选照片：系统对话框选图 → 存进 记忆/图片/ → 发一条带 [图片:id] 标记的消息
  document.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest('.v-comp .dock [data-photo]')
      if (!btn) return
      e.stopPropagation()
      e.preventDefault()
      const api = window.costudy as unknown as {
        imagePick?: () => Promise<{ ok: boolean; canceled?: boolean; id?: string; name?: string; vision?: boolean; error?: string }>
      } | undefined
      if (!api?.imagePick) {
        window.__toast?.('这个版本还没有发图功能')
        return
      }
      const input = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
      btn.setAttribute('data-busy', '1')
      void api
        .imagePick()
        .then((res) => {
          btn.removeAttribute('data-busy')
          if (res.canceled) return
          if (!res.ok || !res.id) {
            window.__toast?.(res.error ?? '照片没发出去')
            return
          }
          const draft = (input?.value ?? '').trim()
          // 图片放在文字后面：模型看到的是"这句话 + 这张图"
          void send((draft ? draft + '\n' : '') + '[图片:' + res.id + ']', input ?? undefined)
          // 模型看不了图就说清楚，别让人以为 TA 已经看见题目了
          if (res.vision === false) {
            window.__toast?.('照片发出去了，但当前模型看不了图 —— TA 会请你把题目用文字说一下')
          }
        })
        .catch((err: unknown) => {
          btn.removeAttribute('data-busy')
          window.__toast?.('发图失败：' + (err instanceof Error ? err.message : String(err)))
        })
    },
    { capture: true },
  )

  // 复制消息正文 / 下载图表或照片
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement
      const copy = target.closest('[data-copy]') as HTMLElement | null
      if (copy) {
        e.stopPropagation()
        e.preventDefault()
        const text = copyTexts.get(copy) ?? ''
        if (!text) return
        void navigator.clipboard
          .writeText(text)
          .then(() => window.__toast?.('已复制'))
          .catch(() => window.__toast?.('复制失败'))
        return
      }
      const save = target.closest('[data-save]') as HTMLElement | null
      if (save) {
        e.stopPropagation()
        e.preventDefault()
        const api = window.costudy
        const source = save.dataset.saveSource === 'photo' ? 'photo' : 'chart'
        const id = save.dataset.saveId ?? ''
        if (!api?.saveAs || !id) return
        save.textContent = '保存中…'
        void api
          .saveAs({ source, id })
          .then((res) => {
            save.textContent = source === 'photo' ? '下载' : 'SVG'
            if (res.canceled) return
            window.__toast?.(res.ok ? '已保存到 ' + res.path : res.error ?? '保存失败')
          })
          .catch((err: unknown) => {
            save.textContent = source === 'photo' ? '下载' : 'SVG'
            window.__toast?.('保存失败：' + (err instanceof Error ? err.message : String(err)))
          })
        return
      }

      // 下载 PNG：把卡片里的 SVG 画到 canvas 再存（主进程没有 SVG 光栅化能力）
      const pngBtn = target.closest('[data-png]') as HTMLElement | null
      if (pngBtn) {
        e.stopPropagation()
        e.preventDefault()
        const box = pngBtn.closest('.chart-box')
        const svgEl = box?.querySelector('svg')
        const api = window.costudy
        if (!svgEl || !api?.savePng) {
          window.__toast?.('这张图暂时导不出来')
          return
        }
        const old = pngBtn.textContent
        pngBtn.textContent = '导出中…'
        void svgToPngDataUrl(svgEl)
          .then((dataUrl) => api.savePng({ base64: dataUrl, name: '实验图' }))
          .then((res) => {
            pngBtn.textContent = old
            if (res.canceled) return
            window.__toast?.(res.ok ? 'PNG 已保存到 ' + res.path : res.error ?? '导出失败')
          })
          .catch((err: unknown) => {
            pngBtn.textContent = old
            window.__toast?.('导出 PNG 失败：' + (err instanceof Error ? err.message : String(err)))
          })
        return
      }

      // 原理 / 步骤：读图卡片的附属信息，展开一个小面板
      const metaBtn = target.closest('[data-meta]') as HTMLElement | null
      if (metaBtn) {
        e.stopPropagation()
        e.preventDefault()
        const box = metaBtn.closest('.chart-box')
        if (!box) return
        const id = metaBtn.dataset.metaId ?? ''
        const kind = metaBtn.dataset.metaKind === 'steps' ? 'steps' : 'principle'
        const existing = box.querySelector('.chart-panel') as HTMLElement | null
        if (existing && existing.dataset.kind === kind) {
          existing.remove()
          return
        }
        existing?.remove()
        const panel = document.createElement('div')
        panel.className = 'chart-panel'
        panel.dataset.kind = kind
        panel.textContent = '读取中…'
        box.appendChild(panel)
        void window.costudy
          ?.chartsMeta?.(id)
          .then((meta) => {
            if (!meta) {
              panel.textContent = '这张图没有附带' + (kind === 'steps' ? '实验步骤' : '实验原理') + '。'
              return
            }
            const issues = Array.isArray(meta.issues) ? meta.issues : []
            if (kind === 'principle') {
              const lines: string[] = []
              if (meta.title) lines.push('【' + meta.title + '】')
              lines.push(meta.principle ? meta.principle : '这张图没有记录实验原理。')
              if (issues.length) lines.push('⚠ 结构校验未通过：' + issues.join('；'))
              panel.textContent = lines.join('\n')
            } else {
              const steps = Array.isArray(meta.steps) ? meta.steps : []
              panel.textContent = steps.length
                ? steps.map((s, i) => i + 1 + '. ' + s).join('\n')
                : '这张图没有记录实验步骤。'
            }
            panel.style.whiteSpace = 'pre-wrap'
          })
          .catch(() => {
            panel.textContent = '读取失败'
          })
        return
      }

      // 重新生成：让 TA 再画一次（带上标题，便于它复现同一张图）
      const redraw = target.closest('[data-redraw]') as HTMLElement | null
      if (redraw) {
        e.stopPropagation()
        e.preventDefault()
        const id = redraw.dataset.redrawId ?? ''
        redraw.textContent = '重画中…'
        void window.costudy
          ?.chartsMeta?.(id)
          .then((meta) => {
            const title = meta?.title ? '「' + meta.title + '」' : '刚才那张实验图'
            redraw.textContent = '重画'
            void send('把' + title + '重画一次，画完直接给我图。')
          })
          .catch(() => {
            redraw.textContent = '重画'
            void send('刚才那张实验图重画一次，画完直接给我图。')
          })
        return
      }
    },
    { capture: true },
  )

  // 粘贴图片：Ctrl+V 直接把剪贴板里的图发出去（截图、复制的题图都行）
  document.addEventListener(
    'paste',
    (e) => {
      const el = e.target as HTMLElement
      if (!el?.closest?.('.v-comp .dock')) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        e.preventDefault()
        e.stopPropagation()
        const api = window.costudy as unknown as {
          imagePaste?: (p: { base64: string; mime?: string; name?: string }) => Promise<{
            ok: boolean
            id?: string
            name?: string
            vision?: boolean
            error?: string
          }>
        } | undefined
        if (!api?.imagePaste) {
          window.__toast?.('这个版本还不支持粘贴图片')
          return
        }
        const paste = api.imagePaste
        if (!paste) return
        const input = document.querySelector<HTMLInputElement>('.v-comp .dock input.input')
        void file
          .arrayBuffer()
          .then((buf) => {
            let bin = ''
            const bytes = new Uint8Array(buf)
            for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
            return paste({ base64: btoa(bin), mime: file.type || 'image/png', name: '粘贴的图片.png' })
          })
          .then((res) => {
            if (!res?.ok || !res.id) {
              window.__toast?.(res?.error ?? '粘贴没成功')
              return
            }
            const draft = (input?.value ?? '').trim()
            void send((draft ? draft + '\n' : '') + '[图片:' + res.id + ']', input ?? undefined)
            if (res.vision === false) window.__toast?.('粘贴的图发出去了，但当前模型看不了图')
          })
          .catch((err: unknown) => window.__toast?.('粘贴失败：' + (err instanceof Error ? err.message : String(err))))
        return
      }
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
      void send(text, input ?? undefined)
    },
    { capture: true },
  )

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
      const input = e.target as HTMLElement
      if (!input.classList?.contains('input')) return
      if (!input.closest('.v-comp .dock')) return
      const text = (input as HTMLInputElement).value.trim()
      if (!text) return
      e.preventDefault()
      e.stopPropagation()
      void send(text, input as HTMLInputElement)
    },
    { capture: true },
  )
}
