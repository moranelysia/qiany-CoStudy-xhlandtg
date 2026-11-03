/**
 * 顶部保障条（P3）：依赖异常 + 未发送消息。
 *
 * 两类问题都用同一条窄提示解决，因为它们性质一样 —— "有东西坏了，但你不该靠猜"：
 *   1. 外部依赖挂了（模型 / 语音 / 搜索）
 *   2. 有消息没发出去（断网时攒下来的）
 *
 * 刷新策略：启动 2.5 秒后探一次，之后每 60 秒一次（主进程里有 60 秒缓存，不会真打网络）。
 *
 * 【2026-11-02 用户要求】依赖类的提示别一直挂着：
 *   · 弹出来 10 秒后自动消失
 *   · 本次运行**不再重复**（哪怕 60 秒一次的探活又失败）
 *   · 下次打开应用重新弹一次（状态只在内存里，重启即清）
 * 手动点「重试」不算"重复提醒"，所以会解除静默再探一次 —— 否则按钮点了没反应。
 *
 * 未发送消息那条**同样**纳入静默：怕丢数据是理由，但用户明确说了"这种提示性标语
 * 全部改成 10 秒后自动消失、重开才再出现" —— 数据本身在 `记忆/待发送.json` 里不会丢，
 * 点「重发」也随时能补，所以不必一直挂在屏幕上。
 */
const STYLE_ID = 'health-banner-style'

/** 依赖类提示挂了多久自动消失 */
const HIDE_AFTER_MS = 10_000

const CSS = `
.health-banner {
  position: fixed; left: 50%; transform: translateX(-50%);
  /* 【为什么不是 52px】灵动岛（.proto-picker）也钉在顶部正中：
       top = 标题区 42px + 8px = 50px，高 38px（悬停 40px），z-index 拉到最大值。
     保障条原来写死 top:52px —— 两块叠在同一条线上，而岛的层级更高，
     于是保障条被压在岛身后面，只在左右两端各露出 20~30px：
     左端那颗橙点（.health-dot）+ 右端被截掉的「重试」按钮（.health-btn）。
     用户看到的就是"灵动岛后面一条奶油黄胶囊"，而且怎么改都改不掉背景色。
     现在让到岛下面一行（50 + 38 + 12），两块彻底分开。 */
  top: calc(var(--titlebar-overlay, 42px) + 58px);
  z-index: 90;
  display: none; align-items: center; gap: 10px;
  max-width: min(760px, calc(100vw - 120px));
  padding: 7px 14px; border-radius: 999px;
  font-size: 12px; line-height: 1.4;
  color: #8a5a00; background: rgba(255, 244, 224, 0.94);
  box-shadow: 0 6px 20px rgba(30, 44, 62, 0.14), inset 0 0 0 1px rgba(214, 158, 46, 0.28);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  -webkit-app-region: no-drag;
}
.health-banner[data-show] { display: flex; }
.health-banner[data-kind='queue'] { color: #0a4a8f; background: rgba(232, 242, 255, 0.95); box-shadow: 0 6px 20px rgba(30, 44, 62, 0.14), inset 0 0 0 1px rgba(10, 132, 255, 0.26); }
.health-dot { width: 7px; height: 7px; border-radius: 50%; background: #d69e2e; flex: none; }
.health-banner[data-kind='queue'] .health-dot { background: #0a84ff; }
.health-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.health-btn {
  flex: none; border: 0; padding: 3px 10px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11.5px; font-weight: 600; color: inherit; background: rgba(120, 148, 178, 0.18);
}
.health-btn:hover { background: rgba(120, 148, 178, 0.3); }
`

interface HealthReport {
  degraded: boolean
  items: Array<{ id: string; label: string; ok: boolean; detail: string }>
}
interface OutboxItem {
  id: string
  text: string
  at: string
  error?: string
}

interface Api {
  healthCheck?: () => Promise<HealthReport>
  outboxList?: () => Promise<OutboxItem[]>
  outboxDrop?: (id: string) => Promise<unknown>
  learnReply?: (payload: { text: string }) => Promise<{ ok: boolean; error?: string }>
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

let banner: HTMLElement | null = null
let timer = 0
let busy = false
/** 本次运行已经提醒过的依赖项（重启清空 —— 下次进来要再提醒一次） */
const muted = new Set<string>()
/** 未发送消息那条是否已经提过（同样的：只在内存里，重启即清） */
let queueMuted = false
let autoHideTimer = 0

function setBanner(kind: 'health' | 'queue', text: string, action: string): void {
  if (!banner) return
  banner.setAttribute('data-show', '')
  banner.setAttribute('data-kind', kind)
  const label = banner.querySelector<HTMLElement>('.health-text')
  if (label) label.textContent = text
  const btn = banner.querySelector<HTMLButtonElement>('[data-health-action]')
  if (btn) btn.textContent = action
  /* 两类提示一视同仁：10 秒后自己收起来。
   * （2026-11-02 用户要求 —— 原来"消息没发出去"那条是我特意留着不自动收的，
   *  用户明确说"这种提示性标语全部改成 10 秒后自动消失"。） */
  window.clearTimeout(autoHideTimer)
  autoHideTimer = window.setTimeout(() => hideBanner(), HIDE_AFTER_MS)
}

function hideBanner(): void {
  window.clearTimeout(autoHideTimer)
  autoHideTimer = 0
  banner?.removeAttribute('data-show')
}

async function refresh(): Promise<void> {
  const api = window.costudy as unknown as Api | undefined
  if (!api || !banner || busy) return

  // 未发送消息优先显示：它比"某个服务挂了"更急
  try {
    const queued = (await api.outboxList?.()) ?? []
    if (queued.length) {
      // 本次运行已经提过一次就不再弹（重开应用 queueMuted 是 false，会再提一次）
      if (queueMuted) return
      queueMuted = true
      const head = queued[0]?.text ?? ''
      setBanner('queue', '有 ' + queued.length + ' 条消息没发出去：' + head.slice(0, 24) + (head.length > 24 ? '…' : ''), '重发')
      return
    }
    // 队列清了：解除静默，以后真再发不出去还能提醒一次
    queueMuted = false
  } catch {
    /* 队列读不到就当没有 */
  }

  try {
    const report = await api.healthCheck?.()
    if (!report) return
    const bad = report.items.filter((i) => !i.ok)
    if (!bad.length) {
      // 全好了：静默名单也该清掉，下次真的又挂了还能提醒一次
      muted.clear()
      hideBanner()
      return
    }
    // 本次运行已经提醒过的就不再弹（重启后 muted 是空的，会重新提醒一次）
    const fresh = bad.filter((i) => !muted.has(i.id))
    if (!fresh.length) {
      hideBanner()
      return
    }
    for (const i of fresh) muted.add(i.id)
    setBanner('health', fresh.map((i) => i.label + '：' + i.detail).join(' · '), '重试')
  } catch {
    /* 探活本身失败不打扰用户 */
  }
}

/**
 * 断网恢复 / 重启恢复：自动补发
 *   · 网络回来（online 事件）立刻试一次
 *   · 启动 6 秒后试一次（重启前攒下的）
 *   · 60 秒内只自动试一次，避免反复弹提示
 */
let lastAutoFlush = 0
async function autoFlush(reason: string): Promise<void> {
  if (Date.now() - lastAutoFlush < 60000) return
  const api = window.costudy as unknown as Api | undefined
  if (!api?.outboxList) return
  try {
    const queued = await api.outboxList()
    if (!queued.length) return
  } catch {
    return
  }
  lastAutoFlush = Date.now()
  window.__toast?.(reason + '，正在自动补发没发出去的消息')
  await flushQueue()
}

export function installAutoFlush(): void {
  window.addEventListener('online', () => {
    void autoFlush('网络回来了')
  })
  window.setTimeout(() => {
    void autoFlush('应用已启动')
  }, 6000)
}

async function flushQueue(): Promise<void> {
  const api = window.costudy as unknown as Api | undefined
  if (!api?.outboxList || !api.learnReply || !api.outboxDrop) return
  busy = true
  try {
    const queued = await api.outboxList()
    for (const item of queued) {
      const res = await api.learnReply({ text: item.text })
      if (res.ok) {
        await api.outboxDrop(item.id)
        window.__toast?.('已补发一条')
      } else {
        window.__toast?.('还是发不出去：' + (res.error ?? '未知原因'))
        break
      }
    }
  } finally {
    busy = false
    await refresh()
  }
}

export function installHealthBanner(): void {
  installAutoFlush()
  ensureStyle()
  if (banner) return
  banner = document.createElement('div')
  banner.className = 'health-banner'
  banner.innerHTML =
    '<span class="health-dot"></span><span class="health-text"></span>' +
    '<button class="health-btn" data-health-action>重试</button>'
  banner.querySelector('[data-health-action]')?.addEventListener('click', () => {
    const kind = banner?.getAttribute('data-kind')
    if (kind === 'queue') {
      void flushQueue()
      return
    }
    // 手动重试 = 用户主动想看结果，解除静默再探一次（否则点了没反应）
    muted.clear()
    void refresh()
  })
  document.body.appendChild(banner)
  window.setTimeout(() => void refresh(), 2500)
  timer = window.setInterval(() => void refresh(), 60_000)
  window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true })
}
