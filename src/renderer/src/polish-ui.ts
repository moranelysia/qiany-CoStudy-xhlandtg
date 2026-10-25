/**
 * M1-1 界面：AI 收尾提示词
 *
 * 交互链条（刻意做成三段，不让 AI 直接覆盖）：
 *   点按钮 → 生成中（按钮禁用）→ 弹出对比面板（左：现有 / 右：AI 版）
 *   → 用户点「采用」才写入 systemPrompt；点「取消」什么都不动。
 *
 * 为什么不做成"点了就替换"：
 *   提示词是角色的核心资产，模型偶尔会写飘。必须能看见差异再决定。
 */
const STYLE_ID = 'polish-ui-style'

const CSS = `
.pol-entry {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 14px; border: 0; border-radius: 999px;
  cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, 0.12);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.pol-entry:hover { background: rgba(10, 132, 255, 0.2); }
.pol-entry:active { transform: scale(0.96); }
.pol-entry:disabled { opacity: .55; cursor: default; }

.pol-mask {
  position: fixed; inset: 0; z-index: 110; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.28); backdrop-filter: blur(7px);
  opacity: 1; transition: opacity 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .pol-mask { opacity: 0; } }

.pol-panel {
  width: min(860px, calc(100vw - 56px)); max-height: min(76vh, 720px);
  display: flex; flex-direction: column;
  padding: 20px 22px 16px; border-radius: 26px; color: #10151c;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 26px 74px rgba(30, 44, 62, 0.26); -webkit-app-region: no-drag;
  transform: scale(1);
  transition: transform 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    opacity 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .pol-panel { opacity: 0; transform: scale(0.97); } }

.pol-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.pol-title { font-size: 16px; font-weight: 700; }
.pol-close { border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #5a6a7a; }
.pol-meta { font-size: 11px; color: #8a97a8; margin-bottom: 12px; }

.pol-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 0; flex: 1; }
.pol-col { display: flex; flex-direction: column; min-height: 0; }
.pol-col-name { font-size: 12px; color: #5a6a7a; margin-bottom: 6px; }
.pol-text {
  flex: 1; overflow: auto; padding: 12px 14px; border-radius: 16px;
  font-size: 12px; line-height: 1.65; white-space: pre-wrap;
  background: rgba(196, 219, 242, 0.26);
}
.pol-text.new { background: rgba(10, 132, 255, 0.08); }

.pol-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.pol-btn {
  height: 32px; padding: 0 16px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; cursor: pointer; color: #10151c;
  background: rgba(120, 148, 178, 0.14);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.pol-btn:active { transform: scale(0.96); }
.pol-btn.primary {
  color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0);
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.26);
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

interface ActiveCardDetail {
  systemPrompt?: string
  name?: string
}

async function applyPrompt(text: string): Promise<boolean> {
  const api = window.costudy
  if (!api?.cards) return false
  const list = await api.cards.list()
  const active = list.find((c) => c.isActive) ?? list[0]
  if (!active) return false
  const result = await api.cards.save(active.id, { systemPrompt: text } as never)
  return Boolean(result.ok)
}

function openCompare(aiText: string, meta: string): void {
  ensureStyle()
  const api = window.costudy

  const mask = document.createElement('div')
  mask.className = 'pol-mask'
  mask.innerHTML = `
    <div class="pol-panel" role="dialog" aria-label="AI 收尾提示词">
      <div class="pol-head">
        <span class="pol-title">AI 收尾提示词</span>
        <button class="pol-close" data-pol-close aria-label="关闭">✕</button>
      </div>
      <div class="pol-meta" data-pol-meta>${meta}</div>
      <div class="pol-cols">
        <div class="pol-col">
          <div class="pol-col-name">现在的提示词</div>
          <div class="pol-text" data-pol-old>（空）</div>
        </div>
        <div class="pol-col">
          <div class="pol-col-name">AI 版本</div>
          <div class="pol-text new" data-pol-new></div>
        </div>
      </div>
      <div class="pol-actions">
        <button class="pol-btn" data-pol-cancel>取消</button>
        <button class="pol-btn primary" data-pol-apply>采用这一版</button>
      </div>
    </div>
  `
  document.body.appendChild(mask)
  mask.querySelector('[data-pol-new]')!.textContent = aiText

  const close = (): void => mask.remove()
  mask.querySelector('[data-pol-close]')?.addEventListener('click', close)
  mask.querySelector('[data-pol-cancel]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  mask.querySelector('[data-pol-apply]')?.addEventListener('click', () => {
    void (async () => {
      const ok = await applyPrompt(aiText)
      close()
      window.__toast?.(ok ? '已采用，写进角色卡了' : '写入失败，卡片可能没保存成功')
    })()
  })

  // 拉一次当前卡的 systemPrompt 填左栏
  void (async () => {
    const old = mask.querySelector<HTMLElement>('[data-pol-old]')
    if (!old) return
    const list = await api?.cards?.list?.()
    const active = list?.find((c) => c.isActive) ?? list?.[0]
    const detail = active ? await api?.cards?.get?.(active.id) : null
    const text = (detail as ActiveCardDetail | null)?.systemPrompt ?? ''
    old.textContent = text.trim() || '（还没有写系统提示词，点下面的按钮会直接落这一版）'
  })()
}

let busy = false

async function runPolish(btn: HTMLButtonElement): Promise<void> {
  if (busy) return
  const api = window.costudy
  if (!api?.cardPolish) {
    window.__toast?.('接口没接上')
    return
  }
  busy = true
  const original = btn.textContent
  btn.disabled = true
  btn.textContent = '生成中…'
  try {
    const result = await api.cardPolish()
    if (!result.ok) {
      window.__toast?.('生成失败：' + (result.error ?? '未知原因'))
      return
    }
    openCompare(
      result.text ?? '',
      `${result.client ?? ''} · ${result.ms ?? 0}ms · 采用前请通读一遍`,
    )
  } finally {
    busy = false
    btn.disabled = false
    btn.textContent = original
  }
}

/** 把入口按钮挂到 footer（「AI 帮我写」右边），变体重建后补挂 */
export function installPolishEntry(): void {
  ensureStyle()

  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.pol-entry')) return
    const anchor = footer.querySelector('[data-ai]')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pol-entry'
    btn.title = '把当前设定交给模型，写出最终系统提示词'
    btn.textContent = 'AI 收尾提示词'
    btn.addEventListener('click', () => void runPolish(btn))
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.appendChild(btn)
  }

  window.setTimeout(() => {
    paint()
    const observer = new MutationObserver(() => paint())
    observer.observe(document.body, { childList: true, subtree: true })
  }, 380)
}
