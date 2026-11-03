/**
 * 把界面里的「我的角色」接到真实角色卡仓库。
 *
 * 【为什么放在渲染层而不是改原型变体】
 *   三个变体是原型阶段的产物，各自用一套夹具数据。直接改变体的渲染函数
 *   会让"界面"和"数据"耦合得更深。这里做一层薄适配：
 *   仓库有卡 → 用真实卡替换列表；没有卡 → 保留夹具（演示模式）。
 *
 * 【为什么点卡片只填名字】
 *   维度滑条（12 维）目前还没进角色卡的数据模型（阶段 4/5 的工作），
 *   所以这里只同步"身份"两项：名字、称呼。（头像 emoji 已从编辑器移除，见 card-editor）
 *   其余字段由编辑器（阶段 3.2）负责。
 */
/** 与主进程 cards:list 返回结构一致（渲染层不 import preload，避免跨 tsconfig） */
export interface CardSummary {
  id: string
  name: string
  emoji: string
  address: string
  ageRating: string
  updatedAt: string
  isActive: boolean
}

interface CostudyCardsApi {
  list: () => Promise<CardSummary[]>
  setActive: (id: string) => Promise<boolean>
  get: (id: string) => Promise<Record<string, unknown> | null>
  /** preload 里映射到 cards:delete；主进程的 CardStore.remove 会顺手把当前卡指针挪走 */
  remove: (id: string) => Promise<boolean>
}

function cardsApi(): CostudyCardsApi | null {
  const anyWindow = window as unknown as {
    costudy?: { cards?: CostudyCardsApi }
  }
  return anyWindow.costudy?.cards ?? null
}

/** 与原型里 avatar() 产出的结构保持一致，样式才不会错位 */
function avatarMarkup(emoji: string, size = 30): string {
  const safe = emoji.replace(/[<>&]/g, '')
  return `<span class="avatar" style="--sz:${size}px">${safe}</span>`
}

/**
 * 角色卡上的删除按钮样式。
 *
 * 为什么注入一份而不是改 studio.js：
 *   那三个变体是原型代码，卡片行（.card-item）由它们负责画；这里只在需要时
 *   追加一条自己的样式，不去动它的 CSS。
 *   变体切换时主进程那边会把挂载后新增的 <style> 全部清掉（installVariantPicker
 *   的 clearVariantStyles），所以每次重画列表都要检查一遍有没有被清走。
 */
const DEL_STYLE = `
.v-studio .card-item .card-del {
  margin-left: auto;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 15px;
  line-height: 1;
  color: var(--label-2);
  opacity: .32;
  transition: opacity .12s ease, background-color .12s ease, color .12s ease;
}
.v-studio .card-item:hover .card-del,
.v-studio .card-item .card-del.is-armed { opacity: 1; }
.v-studio .card-item .card-del:hover { background: rgba(255, 59, 48, .12); color: #ff3b30; }
.v-studio .card-item .card-del.is-armed {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 59, 48, .14);
  color: #ff3b30;
}
@media (hover: none) { .v-studio .card-item .card-del { opacity: 1; } }
`

function ensureDelStyle(): void {
  if (document.querySelector('[data-carddel-style]')) return
  const el = document.createElement('style')
  el.setAttribute('data-carddel-style', '')
  el.textContent = DEL_STYLE
  document.head.appendChild(el)
}

function renderRail(rail: HTMLElement, list: CardSummary[]): void {
  if (list.length === 0) {
    // 卡被删光时给一句实话，而不是退回原型那批假角色（夹具会让人以为真有卡）
    rail.innerHTML =
      '<p class="small muted" style="margin:6px;line-height:1.6">还没有角色<br />点上面「＋新建」造一个</p>'
    return
  }
  rail.innerHTML = list
    .map(
      (card) => `
    <button class="card-item${card.isActive ? ' is-on' : ''}" data-card="${card.id}">
      ${avatarMarkup(card.emoji || '✧')}
      <span class="card-meta">
        <span class="card-name">${card.name.replace(/[<>&]/g, '')}</span>
        <span class="card-line">${card.name === '新角色' ? '还没开始塑造' : '当前角色'}</span>
      </span>
      <span class="card-del" data-card-del="${card.id}" title="删除这个角色" aria-label="删除">×</span>
    </button>`,
    )
    .join('')
}

/** 把卡片的身份字段填进编辑器（名字 / 称呼） */
async function fillEditor(api: CostudyCardsApi, id: string): Promise<void> {
  const card = await api.get(id)
  if (!card) return

  const name = String(card.name ?? '')
  const address = String(card.address ?? '')

  const nameInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
  if (nameInput && name) {
    nameInput.value = name
    // 派发 input 事件，让原型自己的状态跟着更新（它监听的就是这个）
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const addressInput = document.querySelector<HTMLInputElement>(
    '.v-studio [data-in="address"], .v-studio [data-in="learner"]',
  )
  if (addressInput && address) {
    addressInput.value = address
    addressInput.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

/**
 * 同步一次。返回是否用真实卡替换了列表。
 * 每次变体挂载后调用一次即可（Studio 才有角色栏）。
 */
export async function syncCardsToRail(): Promise<boolean> {
  const api = cardsApi()
  if (!api) return false

  const rail = document.querySelector<HTMLElement>('.v-studio [data-cards]')
  if (!rail) return false

  let list: CardSummary[] = []
  try {
    list = await api.list()
  } catch {
    return false
  }
  if (!list.length) {
    // 卡被删光：给空态，别退回原型那批假角色
    ensureDelStyle()
    renderRail(rail, list)
    return true
  }

  ensureDelStyle()
  renderRail(rail, list)

  /* ---------- 删除角色 ----------
   * 两段式：先点一下把图标变成「删?」（3 秒后自动收回），再点一下才真删。
   * 不弹系统对话框 —— 那东西和液态玻璃的界面完全不是一路，而且会卡住渲染进程。
   */
  let armedEl: HTMLElement | null = null
  let armedTimer = 0
  const disarmAll = (): void => {
    rail.querySelectorAll<HTMLElement>('.card-del').forEach((node) => {
      node.classList.remove('is-armed')
      node.textContent = '×'
    })
    armedEl = null
  }

  rail.querySelectorAll<HTMLElement>('[data-card-del]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      // 必须掐住，否则会冒泡到角色行，把"删除"当成"切换角色"
      ev.preventDefault()
      ev.stopPropagation()
      const id = el.dataset.cardDel ?? ''
      if (!id) return

      if (armedEl !== el) {
        disarmAll()
        armedEl = el
        el.classList.add('is-armed')
        el.textContent = '删?'
        window.clearTimeout(armedTimer)
        armedTimer = window.setTimeout(() => disarmAll(), 3000)
        return
      }

      window.clearTimeout(armedTimer)
      const rowName =
        el.closest('.card-item')?.querySelector('.card-name')?.textContent?.trim() ?? '这个角色'
      armedEl = null
      void (async () => {
        const gone = await api.remove(id)
        if (!gone) {
          window.__toast?.('删不掉：这张卡可能已经不在磁盘上了')
          disarmAll()
          return
        }
        // 主进程会把当前卡指针挪到剩下第一张，重画一次让列表和编辑器跟上
        await syncCardsToRail()
        window.dispatchEvent(new CustomEvent('costudy:card-changed'))
        window.__toast?.('已删除「' + rowName + '」')
      })()
    })
  })

  rail.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.card ?? ''
      if (!id) return
      void (async () => {
        await api.setActive(id)
        rail.querySelectorAll('[data-card]').forEach((node) => {
          node.classList.toggle('is-on', node === el)
        })
        await fillEditor(api, id)
        // 通知编辑器：当前卡变了（它要重挂，否则保存会写到旧卡）
        window.dispatchEvent(new CustomEvent('costudy:card-changed'))
      })()
    })
  })

  // 首次进入：把当前卡的字段填进编辑器
  const active = list.find((c) => c.isActive) ?? list[0]
  if (active) await fillEditor(api, active.id)

  return true
}

/**
 * 把「身份」面板的输入框接到当前卡上。
 *
 * 之前这里是写死的「温柔学姐」—— 卡片改了名字，面板还显示旧值，
 * 属于典型的 UI 夹具。现在挂载后按当前卡回填一次。
 */
export async function syncIdentityInputs(): Promise<boolean> {
  const api = window.costudy
  if (!api?.cards) return false
  try {
    const list = await api.cards.list()
    const active = list.find((c) => c.isActive) ?? list[0]
    if (!active) return false
    const card = await api.cards.get(active.id)
    if (!card) return false
    const nameEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
    const nickEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="nickname"]')
    if (nameEl && nameEl.value !== card.name) {
      nameEl.value = card.name
      nameEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (nickEl && card.address && nickEl.value !== card.address) {
      nickEl.value = card.address
      nickEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return true
  } catch {
    return false
  }
}

/** 从 DOM 读 12 维滑条的当前值（保存时用） */
export function readDimsFromDom(): Record<string, number> {
  const out: Record<string, number> = {}
  document.querySelectorAll<HTMLElement>('.v-studio [data-dims] [data-dim]').forEach((row) => {
    const key = row.getAttribute('data-dim')
    const input = row.querySelector<HTMLInputElement>('[data-slider]')
    if (key && input) out[key] = Number(input.value)
  })
  return out
}

/**
 * 把卡片里的 12 维值灌进滑条。
 *
 * 之前滑条只活在 studio.js 的 state.dims 里，和 card.dims 是两套数据：
 * 换一张卡，滑条还停在上一个角色的值 —— 典型的 UI 夹具。
 * 这里逐个 dispatch input，让 studio 自己的 onDimChange 跑一遍，
 * 这样内部 state 也跟着同步，不用去碰它的私有变量。
 */
export async function syncDimsFromCard(): Promise<boolean> {
  const api = window.costudy
  if (!api?.cards) return false
  try {
    const list = await api.cards.list()
    const active = list.find((c) => c.isActive) ?? list[0]
    if (!active) return false
    const card = await api.cards.get(active.id)
    if (!card?.dims) return false
    let applied = 0
    document.querySelectorAll<HTMLElement>('.v-studio [data-dims] [data-dim]').forEach((row) => {
      const key = row.getAttribute('data-dim')
      const value = key ? card.dims[key] : undefined
      if (!key || typeof value !== 'number') return
      const input = row.querySelector<HTMLInputElement>('[data-slider]')
      if (!input || Number(input.value) === value) return
      input.value = String(value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      applied += 1
    })
    return applied > 0
  } catch {
    return false
  }
}

/**
 * 预览区的角色名接当前卡，并给"示例回复"打个标记。
 *
 * 两件事：
 * 1. .reply-name 之前写死「温柔学姐」—— 换卡后名字不对，属于夹具
 * 2. 预览回复本身是模板文案（没调模型），必须标出来，
 *    否则用户会以为是真的在对话（这也是教训录 L13：别让人误以为真）
 */
export async function syncPreviewReplyName(): Promise<boolean> {
  const api = window.costudy
  if (!api?.cards) return false
  try {
    const list = await api.cards.list()
    const active = list.find((c) => c.isActive) ?? list[0]
    if (!active) return false
    const card = await api.cards.get(active.id)
    if (!card) return false
    const nameEl = document.querySelector<HTMLElement>('.v-studio .reply-name')
    if (nameEl && nameEl.textContent !== card.name) nameEl.textContent = card.name

    const reply = document.querySelector<HTMLElement>('.v-studio .reply')
    if (reply && !reply.querySelector('[data-sample-badge]')) {
      const badge = document.createElement('span')
      badge.setAttribute('data-sample-badge', '')
      badge.textContent = '示例文案 · 未接模型'
      badge.style.cssText =
        'display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;' +
        'font-size:10px;color:#5a6a7a;background:rgba(120,148,178,.16)'
      const head = reply.querySelector('.reply-name')
      if (head) head.appendChild(badge)
      else reply.prepend(badge)
    }
    return true
  } catch {
    return false
  }
}
