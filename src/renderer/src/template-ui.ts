/**
 * 模式 B：模板填空（不需要 API）。
 *
 * 用户原话："模板的意思是可以填入的角色卡，比如：角色名称： 对你的称呼： 性格： 口头禅："
 *
 * 所以它不是"预设样板"，而是**一张待填的卡片**：
 * 每个字段一句提示 + 一个例子，用户可以只填两三格就出卡。
 *
 * 从新建角色进入时使用空白表单，从编辑入口进入时预填当前角色。
 */
const STYLE_ID = 'tpl-ui-style'

const CSS = `
.tpl-mask { position: fixed; inset: 0; z-index: 116; display: grid; place-items: center;
  background: rgba(18,26,38,.3); backdrop-filter: blur(8px); }
.tpl-panel { width: min(640px, calc(100vw - 56px)); max-height: min(84vh, 820px); overflow-y: auto;
  padding: 22px 24px 18px; border-radius: 26px; color: #10151c;
  background: rgba(255,255,255,.94); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 26px 74px rgba(30,44,62,.26); -webkit-app-region: no-drag; }
.tpl-head { display: flex; justify-content: space-between; align-items: center; }
.tpl-title { font-size: 17px; font-weight: 700; }
.tpl-close { border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #5a6a7a; }
.tpl-sub { margin: 6px 0 16px; font-size: 12px; line-height: 1.6; color: #5a6a7a; }
.tpl-field { margin-bottom: 14px; }
.tpl-label { display: block; font-size: 12px; font-weight: 600; color: #3c4b5d; margin-bottom: 5px; }
.tpl-hint { font-size: 11px; color: #8a97a8; margin-bottom: 5px; }
.tpl-input, .tpl-area { width: 100%; border: 0; border-radius: 14px; font: inherit; font-size: 13px;
  color: #10151c; outline: none; background: rgba(196,219,242,.3);
  box-shadow: inset 0 1px 2px rgba(70,100,140,.1); }
.tpl-input { height: 36px; padding: 0 12px; }
.tpl-area { min-height: 58px; padding: 10px 12px; resize: vertical; line-height: 1.6; }
.tpl-input:focus, .tpl-area:focus { background: rgba(196,219,242,.46); }
.tpl-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.tpl-btn { height: 34px; padding: 0 16px; border: 0; border-radius: 999px; font: inherit;
  font-size: 13px; cursor: pointer; color: #10151c; background: rgba(120,148,178,.14); }
.tpl-btn.primary { color: #fff; background: linear-gradient(180deg,#0a84ff,#0a72e0);
  box-shadow: 0 8px 20px rgba(10,132,255,.26); }
`

interface Field {
  key: string
  label: string
  hint: string
  example: string
  multiline?: boolean
}

/** 字段定义：和以后 AI 生成用的是同一套（口头禅等新字段放 extensions.dshCosplay） */
const FIELDS: Field[] = [
  { key: 'name', label: '角色名称', hint: '他叫什么？', example: '球叔' },
  { key: 'address', label: '对你的称呼', hint: '他怎么叫你？', example: '队员' },
  { key: 'personality', label: '性格', hint: '具体一点：遇到你答错时他会怎么做', example: '不急着给答案，先问卡在哪一步', multiline: true },
  { key: 'catchphrase', label: '口头禅', hint: '一句话，最好能反复用', example: '先定第一步，不贪多' },
  { key: 'style', label: '说话风格', hint: '句子长短、先结论还是先提问', example: '短句，一次只给一个指令', multiline: true },
  { key: 'dislikes', label: '不喜欢的', hint: '他明确不做什么', example: '不喊口号，不连着问三个问题', multiline: true },
]

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

export async function openTemplateForm({ create = false }: { create?: boolean } = {}): Promise<void> {
  ensureStyle()
  const api = window.costudy
  if (!api?.cards) {
    window.__toast?.('角色卡接口没接上')
    return
  }

  const list = create ? [] : await api.cards.list()
  const active = list.find((c) => c.isActive) ?? list[0]
  const card = active ? await api.cards.get(active.id) : null

  const current: Record<string, string> = {
    name: card?.name ?? '',
    address: card?.address ?? '',
    personality: card?.personality ?? '',
    catchphrase: (card as unknown as { catchphrase?: string })?.catchphrase ?? '',
    style: card?.style ?? '',
    dislikes: card?.dislikes ?? '',
  }

  const mask = document.createElement('div')
  mask.className = 'tpl-mask'
  mask.innerHTML =
    '<div class="tpl-panel" role="dialog" aria-label="填一张角色卡">' +
    '<div class="tpl-head"><span class="tpl-title">填一张角色卡</span>' +
    '<button class="tpl-close" data-tpl-close aria-label="关闭">✕</button></div>' +
    '<p class="tpl-sub">选填称呼、性格和说话风格。保存后进入伴学。</p>' +
    FIELDS.map(
      (f) =>
        '<div class="tpl-field">' +
        '<label class="tpl-label" for="tpl-field-' + f.key + '">' + f.label + '</label>' +
        '<div class="tpl-hint">' + f.hint + '　例如：' + f.example + '</div>' +
        (f.multiline
          ? '<textarea class="tpl-area" data-tpl="' + f.key + '" id="tpl-field-' + f.key + '" placeholder="' + f.example + '"></textarea>'
          : '<input class="tpl-input" data-tpl="' + f.key + '" id="tpl-field-' + f.key + '" placeholder="' + f.example + '" />') +
        '</div>',
    ).join('') +
    '<div class="tpl-actions">' +
    '<button class="tpl-btn" data-tpl-cancel>取消</button>' +
    '<button class="tpl-btn primary" data-tpl-save>保存，去学习</button>' +
    '</div></div>'

  document.body.appendChild(mask)

  FIELDS.forEach((f) => {
    const el = mask.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-tpl="' + f.key + '"]')
    if (el && current[f.key]) el.value = current[f.key]
  })

  const close = (): void => mask.remove()
  mask.querySelector('[data-tpl-close]')?.addEventListener('click', close)
  mask.querySelector('[data-tpl-cancel]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  const button = mask.querySelector<HTMLButtonElement>('[data-tpl-save]')!
  button.addEventListener('click', async () => {
    if (button.disabled) return
    const read = (key: string): string => {
      const field = mask.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-tpl="' + key + '"]')
      return field?.value.trim() ?? ''
    }
    const patch = {
      name: read('name') || '新角色',
      address: read('address') || '同学',
      personality: read('personality'),
      style: read('style'),
      catchphrase: read('catchphrase'),
      dislikes: read('dislikes'),
    }
    button.disabled = true
    try {
      if (active) {
        const result = await api.cards.save(active.id, patch)
        if (!result.ok) throw new Error(result.error ?? '无法写入角色卡')
      } else if (!(await api.cards.create(patch.name, patch))) {
        throw new Error('无法保存新角色')
      }
      window.dispatchEvent(new CustomEvent('costudy:card-changed'))
      close()
      window.__toast?.('已保存「' + patch.name + '」')
      const view = window as Window & { __costudySetActive?: (index: number) => void }
      view.__costudySetActive?.(2)
    } catch (error) {
      window.__toast?.('保存失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      button.disabled = false
    }
  })
}

/** footer 入口 */
export function installTemplateEntry(): void {
  ensureStyle()
  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.tpl-entry')) return
    const anchor = footer.querySelector('.pf-entry') ?? footer.querySelector('[data-ai]')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tpl-entry pf-entry'
    btn.textContent = '填卡'
    btn.title = '模板填空：填几个字段就能用，不需要 API'
    btn.addEventListener('click', () => void openTemplateForm())
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.appendChild(btn)
  }
  window.setTimeout(() => {
    paint()
    new MutationObserver(() => paint()).observe(document.body, { childList: true, subtree: true })
  }, 480)
}
