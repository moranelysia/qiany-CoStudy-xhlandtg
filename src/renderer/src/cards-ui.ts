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
 *   所以这里只同步"身份"三项：名字、称呼、头像 emoji。
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

function renderRail(rail: HTMLElement, list: CardSummary[]): void {
  rail.innerHTML = list
    .map(
      (card) => `
    <button class="card-item${card.isActive ? ' is-on' : ''}" data-card="${card.id}">
      ${avatarMarkup(card.emoji || '✧')}
      <span class="card-meta">
        <span class="card-name">${card.name.replace(/[<>&]/g, '')}</span>
        <span class="card-line">${card.name === '新角色' ? '还没开始塑造' : '当前角色'}</span>
      </span>
    </button>`,
    )
    .join('')
}

/** 把卡片的身份字段填进编辑器（名字 / 称呼 / emoji） */
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
  if (!list.length) return false

  renderRail(rail, list)

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
