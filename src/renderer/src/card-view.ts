/**
 * 卡详情：文档式，逐模块就地编辑。
 *
 * 用户原话："直接让用户看到完整的角色卡，并且可以模块化更改，
 *            实例：用户可以直接选中口头禅一栏进行更改。"
 *
 * 所以这里不是表单，是**一份文档**：
 *   · 平时只读，像阅读一份设定
 *   · hover 出现「改」→ 点一下那一块变成输入框 → 回车存 / Esc 取消
 *   · 存完立刻写盘，不需要点全局「保存角色」
 *
 * 只做"改"不做"排版"，因为改是用户的真实需求，排版是次要的。
 */
import { esc } from './app/ui.js'

const STYLE_ID = 'card-view-style'

const CSS = `
.cv-mask { position: fixed; inset: 0; z-index: 117; display: grid; place-items: center;
  background: rgba(18,26,38,.3); backdrop-filter: blur(8px); }
.cv-panel { width: min(680px, calc(100vw - 56px)); max-height: min(84vh, 840px); overflow-y: auto;
  padding: 24px 26px 20px; border-radius: 26px; color: #10151c;
  background: rgba(255,255,255,.95); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 28px 76px rgba(30,44,62,.28); -webkit-app-region: no-drag; }
.cv-head { display: flex; align-items: center; gap: 10px; }
.cv-emoji { font-size: 26px; }
.cv-name { font-size: 19px; font-weight: 700; }
.cv-close { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: #5a6a7a; font-size: 14px; }
.cv-sub { margin: 6px 0 18px; font-size: 12px; line-height: 1.6; color: #8a97a8; }

.cv-sec { padding: 12px 0; border-top: 1px solid rgba(120,148,178,.16); }
.cv-sec:first-of-type { border-top: 0; }
.cv-label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #3c4b5d; margin-bottom: 6px; }
.cv-edit { margin-left: auto; border: 0; cursor: pointer; font: inherit; font-size: 11px; color: #0a5cc4;
  background: rgba(10,132,255,.1); padding: 2px 10px; border-radius: 999px; opacity: 0;
  transition: opacity 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)); }
.cv-sec:hover .cv-edit { opacity: 1; }
.cv-edit:hover { background: rgba(10,132,255,.2); }
.cv-text { font-size: 13.5px; line-height: 1.75; white-space: pre-wrap; color: #22303f; }
.cv-text.empty { color: #a7b3c2; font-style: italic; }
.cv-input {
  width: 100%; min-height: 74px; padding: 10px 12px; border: 0; border-radius: 12px;
  font: inherit; font-size: 13.5px; line-height: 1.7; color: #10151c; resize: vertical; outline: none;
  background: rgba(196,219,242,.34); box-shadow: inset 0 1px 2px rgba(70,100,140,.12);
}
.cv-row { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
.cv-btn { height: 30px; padding: 0 14px; border: 0; border-radius: 999px; font: inherit; font-size: 12px;
  cursor: pointer; color: #10151c; background: rgba(120,148,178,.16); }
.cv-btn.primary { color: #fff; background: linear-gradient(180deg,#0a84ff,#0a72e0); }
.cv-hint { margin-top: 14px; font-size: 11px; color: #8a97a8; }
`

/** 可编辑模块：key 对应 cards.save 的字段名 */
interface Module {
  key: string
  label: string
  hint?: string
}

const MODULES: Module[] = [
  { key: 'name', label: '角色名称' },
  { key: 'address', label: '对你的称呼' },
  { key: 'personality', label: '性格' },
  { key: 'catchphrase', label: '口头禅' },
  { key: 'style', label: '说话风格' },
  { key: 'dislikes', label: '不喜欢的' },
  { key: 'rules', label: '守则' },
]

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/**
 * 从卡片对象里读一个字段 —— 要容忍三种形状：
 *   1. 扁平卡：{ name, personality, cosplay: { style, catchphrase } }
 *   2. V2 原始载荷：{ data: { name, extensions: { dshCosplay: {...} } } }
 *   3. 包一层：{ card: ... }
 *
 * 之前只处理了第 1 种，导致"保存成功但面板不刷新"——
 * 因为 cards.get 返回的是第 2/3 种，读不到就渲染成空。
 */
function readOf(input: unknown, key: string): string {
  const unwrap = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null

  let node = unwrap(input)
  if (!node) return ''

  // 形状 3：{ ok, card }
  if (node.card && typeof node.card === 'object') node = unwrap(node.card)
  if (!node) return ''

  // 形状 1（扁平卡）
  const direct = node[key]
  if (typeof direct === 'string') return direct
  const cosplay = unwrap(node.cosplay)
  if (cosplay && typeof cosplay[key] === 'string') return String(cosplay[key])

  // 形状 2（V2 载荷：data.extensions.dshCosplay）
  const data = unwrap(node.data)
  if (data) {
    if (typeof data[key] === 'string') return String(data[key])
    const ext = unwrap(data.extensions)
    const cp = ext ? unwrap(ext.dshCosplay) : null
    if (cp && typeof cp[key] === 'string') return String(cp[key])
  }
  return ''
}

export async function openCardView(): Promise<void> {
  ensureStyle()
  const api = window.costudy
  if (!api?.cards) {
    window.__toast?.('角色卡接口没接上')
    return
  }

  const list = await api.cards.list()
  const active = list.find((c) => c.isActive) ?? list[0]
  if (!active) {
    window.__toast?.('还没有角色卡')
    return
  }
  let card = (await api.cards.get(active.id)) as unknown as Record<string, unknown> | null

  const mask = document.createElement('div')
  mask.className = 'cv-mask'
  const panel = document.createElement('div')
  panel.className = 'cv-panel'
  mask.appendChild(panel)
  document.body.appendChild(mask)

  const render = (): void => {
    panel.innerHTML =
      '<div class="cv-head">' +
      '<span class="cv-emoji">' + esc(readOf(card, 'emoji') || '✧') + '</span>' +
      '<span class="cv-name">' + esc(readOf(card, 'name') || '未命名') + '</span>' +
      '<button class="cv-close" data-cv-close aria-label="关闭">✕</button>' +
      '</div>' +
      '<p class="cv-sub">这就是这张卡。想改哪一块，鼠标移上去点「改」——改完立刻存，不用点全局保存。</p>' +
      MODULES.map((m) => {
        const value = readOf(card, m.key)
        return (
          '<div class="cv-sec" data-sec="' + m.key + '">' +
          '<div class="cv-label">' + m.label +
          '<button class="cv-edit" data-edit="' + m.key + '">改</button></div>' +
          (value
            ? '<div class="cv-text">' + esc(value) + '</div>'
            : '<div class="cv-text empty">（还没写）</div>') +
          '</div>'
        )
      }).join('') +
      '<div class="cv-hint">这些字段会进提示词。口头禅/不喜欢的属于伴学扩展字段。</div>'

    panel.querySelector('[data-cv-close]')?.addEventListener('click', () => mask.remove())

    panel.querySelectorAll<HTMLElement>('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-edit')!
        const module = MODULES.find((m) => m.key === key)!
        const sec = panel.querySelector<HTMLElement>('[data-sec="' + key + '"]')!
        const current = readOf(card, key)

        sec.innerHTML =
          '<div class="cv-label">' + module.label + '</div>' +
          '<textarea class="cv-input" data-edit-input>' + esc(current) + '</textarea>' +
          '<div class="cv-row">' +
          '<button class="cv-btn" data-cancel>取消</button>' +
          '<button class="cv-btn primary" data-save>保存</button>' +
          '</div>'

        const input = sec.querySelector<HTMLTextAreaElement>('[data-edit-input]')!
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)

        sec.querySelector('[data-cancel]')?.addEventListener('click', () => render())
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') render()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        })

        const save = (): void => {
          void (async () => {
            const value = input.value.trim()
            const res = await api.cards.save(active.id, { [key]: value } as never)
            if (!res.ok) {
              window.__toast?.('保存失败：' + (res.error ?? '未知原因'))
              return
            }
            card = (await api.cards.get(active.id)) as unknown as Record<string, unknown> | null
            window.dispatchEvent(new CustomEvent('costudy:card-changed'))
            window.__toast?.('已保存')
            render()
          })()
        }
        sec.querySelector('[data-save]')?.addEventListener('click', save)
      })
    })
  }

  render()
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.remove()
  })
}

export function installCardViewEntry(): void {
  ensureStyle()
  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.cv-entry')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cv-entry mh-entry'
    btn.textContent = '看卡'
    btn.title = '查看完整角色卡，逐块修改'
    btn.addEventListener('click', () => void openCardView())
    const anchor = footer.querySelector('.mh-entry')
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.prepend(btn)
  }
  window.setTimeout(() => {
    paint()
    new MutationObserver(() => paint()).observe(document.body, { childList: true, subtree: true })
  }, 560)
}
