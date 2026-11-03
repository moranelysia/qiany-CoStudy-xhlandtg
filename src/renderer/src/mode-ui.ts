/**
 * chat / work 模式开关。
 *
 * 为什么要有它：权限三档只有**用户看得见、能切**才叫"分权限"。
 * 默认「聊天」只读；切到「工作」才允许写笔记、跑代码。
 *
 * 【2026-11-02 修·其一】选择器原来写的是 `.learn-head` —— 那是向导变体的类名，
 * 伴学页的头部早就改成 `.learn-top` 了，于是这个开关**从来没被挂上去过**。
 *
 * 【2026-11-02 修·其二】只有伴学页右上角一个蓝色胶囊，用户根本认不出那是按钮：
 * 他说"有 work 和 chat 的区别，但没有切换按钮"。所以现在有**两个**入口：
 *   1. 伴学页头部胶囊（保留，改成更像按钮）
 *   2. 插件页顶部一条真正的分段控件 —— 用户是在插件页开「代码执行」的，
 *      开关就得在他眼前，而不是跑到另一屏去找
 *
 * 状态是**单一来源**：所有入口读写同一份 `current`，切换后广播给所有在场控件，
 * 免得一个地方显示「工作」另一个还写着「聊天」。
 */
const STYLE_ID = 'mode-ui-style'

const CSS = `
.mode-pill {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 11px; border: 1px solid rgba(10, 132, 255, .28);
  border-radius: 999px; font: inherit; font-size: 11.5px; font-weight: 600;
  cursor: pointer; color: #0a5cc4; background: rgba(10, 132, 255, .1);
  -webkit-app-region: no-drag;
}
.mode-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .75; }
.mode-pill[data-mode='work'] { color: #8a5a00; border-color: rgba(214, 158, 46, .45); background: rgba(214, 158, 46, .16); }
.mode-pill:hover { filter: brightness(.96); }

/* 插件页顶部的权限条 */
.mode-bar {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  margin: 0 0 18px; padding: 12px 14px;
  border: .5px solid rgba(120, 148, 178, .28); border-radius: 12px;
  background: rgba(120, 148, 178, .05);
}
.mode-bar-main { flex: 1; min-width: 220px; }
.mode-bar-title { font-size: 12.5px; font-weight: 700; color: var(--ink, #10151c); }
.mode-bar-desc { margin-top: 3px; font-size: 11.5px; color: var(--label-2); line-height: 1.6; }
.mode-seg {
  display: inline-flex; flex: none; padding: 2px; border-radius: 999px;
  background: rgba(120, 148, 178, .16);
}
.mode-seg button {
  border: 0; padding: 6px 13px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 600; color: var(--label-2);
  background: transparent; transition: background-color .16s ease, color .16s ease;
}
.mode-seg button[data-active] { background: #fff; color: var(--ink, #10151c); box-shadow: 0 1px 3px rgba(16, 21, 28, .14); }
.mode-seg button[data-active][data-mode-choice='work'] { color: #8a5a00; }
`

export type AgentMode = 'chat' | 'work'

interface ModeApi {
  modeGet?: () => Promise<{ mode: AgentMode; allowed?: string[] }>
  modeSet?: (mode: string) => Promise<{ mode: AgentMode; allowed?: string[] }>
}

const DESC: Record<AgentMode, string> = {
  chat: '聊天：只读。模型能查时间、作图、检索记忆，不会动文件、不会跑代码。',
  work: '工作：可写。模型能写笔记、跑代码（3 秒超时 / 128MB），生成的代码由你确认。',
}

let current: AgentMode = 'chat'
const listeners = new Set<() => void>()
let watching = false

function api(): ModeApi | undefined {
  return window.costudy as unknown as ModeApi | undefined
}

export function getMode(): AgentMode {
  return current
}

function broadcast(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* 单个控件出错不影响别的 */
    }
  }
}

/** 只挂一次：每次模式变化，把所有在场控件重画一遍 */
function watch(): void {
  if (watching) return
  watching = true
  listeners.add(() => {
    document.querySelectorAll<HTMLButtonElement>('[data-mode-toggle]').forEach(paintPill)
    document.querySelectorAll<HTMLElement>('[data-mode-bar]').forEach(paintBar)
  })
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/** 从主进程读一次当前模式 */
export async function refreshMode(): Promise<AgentMode> {
  const a = api()
  if (!a?.modeGet) return current
  try {
    const res = await a.modeGet()
    const next: AgentMode = res.mode === 'work' ? 'work' : 'chat'
    if (next !== current) {
      current = next
      broadcast()
    } else {
      current = next
    }
  } catch {
    /* 读不到就保持原值 */
  }
  return current
}

/** 写主进程并同步所有控件 */
export async function setMode(mode: AgentMode): Promise<AgentMode> {
  const a = api()
  const want: AgentMode = mode === 'work' ? 'work' : 'chat'
  if (!a?.modeSet) return current
  try {
    const res = await a.modeSet(want)
    current = res.mode === 'work' ? 'work' : 'chat'
  } catch {
    window.__toast?.('切换失败')
    return current
  }
  broadcast()
  window.__toast?.(current === 'work' ? '已切到工作模式：可以写笔记、跑代码了' : '已切回聊天模式：只读')
  return current
}

function paintPill(btn: HTMLButtonElement): void {
  btn.dataset.mode = current
  btn.textContent = current === 'work' ? '工作模式' : '聊天模式'
  btn.setAttribute('aria-pressed', current === 'work' ? 'true' : 'false')
  btn.title = current === 'work' ? '点一下切回聊天模式（只读）' : '点一下切到工作模式：可以写笔记、跑代码'
}

function mountPill(head: Element): void {
  if (head.querySelector('[data-mode-toggle]')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mode-pill'
  btn.dataset.modeToggle = ''
  paintPill(btn)
  // 放在「改所学内容」之后
  head.appendChild(btn)
  btn.addEventListener('click', () => {
    void setMode(current === 'work' ? 'chat' : 'work')
  })
}

function paintBar(bar: HTMLElement): void {
  bar.querySelectorAll<HTMLButtonElement>('[data-mode-choice]').forEach((b) => {
    const on = b.dataset.modeChoice === current
    if (on) b.setAttribute('data-active', '')
    else b.removeAttribute('data-active')
    b.setAttribute('aria-pressed', on ? 'true' : 'false')
  })
  const desc = bar.querySelector<HTMLElement>('[data-mode-desc]')
  if (desc) desc.textContent = DESC[current]
}

/**
 * 插件页顶部那条权限条。
 * `onChange` 用来让插件列表重画（"需切到工作模式"的提示要跟着消失）。
 */
export function mountModeBar(host: HTMLElement, onChange?: () => void): void {
  ensureStyle()
  watch()
  host.innerHTML =
    '<div class="mode-bar" data-mode-bar>' +
    '<div class="mode-bar-main">' +
    '<div class="mode-bar-title">权限模式</div>' +
    '<div class="mode-bar-desc" data-mode-desc></div>' +
    '</div>' +
    '<div class="mode-seg" role="group" aria-label="权限模式">' +
    '<button type="button" data-mode-choice="chat">聊天（只读）</button>' +
    '<button type="button" data-mode-choice="work">工作（可写 · 可跑代码）</button>' +
    '</div>' +
    '</div>'
  const bar = host.querySelector<HTMLElement>('[data-mode-bar]')
  if (!bar) return
  paintBar(bar)
  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode-choice]')
    if (!btn) return
    const want: AgentMode = btn.dataset.modeChoice === 'work' ? 'work' : 'chat'
    if (want === current) return
    void setMode(want).then(() => {
      paintBar(bar)
      onChange?.()
    })
  })
  void refreshMode().then(() => {
    paintBar(bar)
    onChange?.()
  })
}

/** 伴学页头部胶囊 */
export function installModePill(): void {
  ensureStyle()
  watch()
  const mountAll = (): void => {
    document.querySelectorAll('.v-comp .learn-top').forEach(mountPill)
  }
  void refreshMode().then(mountAll)
  const observer = new MutationObserver(mountAll)
  observer.observe(document.body, { childList: true, subtree: true })
}
