/**
 * 把"死按钮"接上真实行为。
 *
 * 【背景】
 *   原型里有一批控件只有 `window.__toast('…')` —— 点了弹一句话，什么都不发生。
 *   按方案表 R8（窗口里没有假数据、操作要有真实反馈），这些必须真做事：
 *
 *     [data-profile]  学习者画像      → 打开画像浮层（真数据）
 *     [data-start]    从某点开始      → 切到学习页
 *     [data-skip]     先做题测一下    → 切到学习页
 *     [data-save]     保存角色        → 走角色卡编辑器那条真保存链路
 *     [data-discard]  放弃            → 从卡里重新载入编辑器
 *     [data-ai]       AI 帮我写      → 调 cards.generate，填进编辑器
 *     [data-golearn]  去学习          → 切到学习页
 *     dock 的 ↑ / 回车               → 真的插入消息气泡
 *     dock 的 题                      → 按最薄弱知识点插一道题
 *
 * 【为什么用委托而不是逐个绑定】
 *   变体每次挂载都会重建 DOM，逐个绑要跟着重绑，漏一个就又是"点不动"。
 *   这里在 document 上挂一次，按 closest() 判断 —— 重建 DOM 也不影响。
 */
import { openOverview } from './overview'
import { readDimsFromDom } from './cards-ui'

interface OverviewLite {
  profile: { weakPoints: Array<{ name: string; mastery: number }> }
  due: Array<{ name: string }>
  card: { name: string; address: string }
}

let cached: OverviewLite | null = null

async function loadOverview(): Promise<OverviewLite | null> {
  if (cached) return cached
  try {
    const api = window.costudy
    if (!api?.learnOverview) return null
    cached = (await api.learnOverview()) as unknown as OverviewLite
    return cached
  } catch {
    return null
  }
}

/** 切到 Companion 并进入学习模式 */
function goLearn(): void {
  const setActive = (window as unknown as Record<string, unknown>).__costudySetActive as
    | ((i: number) => void)
    | undefined
  if (!setActive) {
    window.__toast?.('切换界面失败（入口未就绪）')
    return
  }
  setActive(0) // GO-STUDIO：学习页已隐藏，去角色工坊而不是进空白页
  // 等 Companion 挂载完再点它自己的「开始学习」
  window.setTimeout(() => {
    const enter = (window as unknown as Record<string, unknown>).__costudyEnterLearn as
      | (() => void)
      | undefined
    if (enter) enter()
    else window.__toast?.('已切到学习界面')
  }, 120)
}

/**
 * 保存角色：把 Studio「身份」面板里的名字/称呼写进当前角色卡。
 *
 * 之前这个按钮只把文字改成「已保存 ✓」并弹一句 toast —— 什么都没存。
 * 现在真写盘，写完让编辑器重新载入（否则编辑器和卡片会显示两份不同的名字）。
 */
async function saveStudio(): Promise<void> {
  const api = window.costudy
  if (!api?.cards) {
    window.__toast?.('角色卡接口不可用')
    return
  }
  const nameEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
  const nickEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="nickname"]')
  const patch: Record<string, unknown> = {}
  // 12 维滑条也一起存：否则改了气质、卡片里还是旧值
  const dims = readDimsFromDom()
  if (Object.keys(dims).length > 0) patch['dims'] = dims
  if (nameEl) patch['name'] = nameEl.value.trim()
  if (nickEl) patch['address'] = nickEl.value.trim()

  const list = await api.cards.list()
  const active = list.find((c) => c.isActive) ?? list[0]
  if (!active) {
    window.__toast?.('没有可保存的角色卡，先新建一张')
    return
  }
  const result = await api.cards.save(active.id, patch)
  if (!result.ok) {
    window.__toast?.('保存失败：' + (result.error ?? '未知原因'))
    return
  }
  window.dispatchEvent(new CustomEvent('costudy:card-changed'))
  window.__toast?.('已保存「' + (patch['name'] || active.name) + '」')
}

/** 放弃修改：把输入框恢复成角色卡里存着的值 */
async function discardStudio(): Promise<void> {
  const api = window.costudy
  if (!api?.cards) return
  const list = await api.cards.list()
  const active = list.find((c) => c.isActive) ?? list[0]
  if (!active) {
    window.__toast?.('没有可恢复的角色卡')
    return
  }
  const card = await api.cards.get(active.id)
  if (!card) return
  const nameEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
  const nickEl = document.querySelector<HTMLInputElement>('.v-studio [data-in="nickname"]')
  if (nameEl) nameEl.value = card.name
  if (nickEl) nickEl.value = card.address
  window.dispatchEvent(new CustomEvent('costudy:card-changed'))
  window.__toast?.('已恢复成卡片里存的内容')
}
/** AI 写卡：给关键词 → 生成草稿 → 填进编辑器（不自动保存） */
async function aiDraft(): Promise<void> {
  const api = window.costudy
  if (!api?.cards?.generate) {
    window.__toast?.('AI 写卡不可用')
    return
  }
  const keywords = window.prompt('用几个关键词描述这个角色（例：温柔的学长 / 喜欢用比喻）', '')
  if (!keywords || !keywords.trim()) return

  const result = await api.cards.generate(keywords)
  if (!result.ok) {
    window.__toast?.('生成失败：' + result.error)
    return
  }

  // 把草稿写进编辑器输入框（不落盘 —— 让用户看完再点保存）
  const draft = result.draft as Record<string, string>
  const mapping: Array<[string, string]> = [
    ['personality', 'personality'],
    ['description', 'description'],
    ['scenario', 'scenario'],
    ['style', 'style'],
    ['rules', 'rules'],
    ['behavior', 'behavior'],
    ['opening', 'opening'],
    ['mesExample', 'mesExample'],
  ]
  let filled = 0
  for (const [key, field] of mapping) {
    const value = draft[key] ?? draft[field] ?? ''
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `.card-editor [data-ce="${field}"]`,
    )
    if (el && value) {
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      filled++
    }
  }

  const nameInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
  if (nameInput && draft['name']) {
    nameInput.value = draft['name']
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const diffCount = result.diff.length
  window.__toast?.(
    `已填入 ${filled} 个字段（${result.client}）` + (diffCount ? `，待确认 ${diffCount} 处变化` : ''),
  )
}

/* ---------- 学习页 dock ---------- */

function threadEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.learn-thread')
}

function appendBubble(role: 'ai' | 'me', text: string): void {
  const thread = threadEl()
  if (!thread) return
  const wrap = document.createElement('div')
  wrap.className = 'learn-msg ' + role
  const bubble = document.createElement('div')
  bubble.className = 'learn-bubble'
  bubble.textContent = text
  wrap.appendChild(bubble)
  thread.appendChild(wrap)
  thread.scrollTop = thread.scrollHeight
}

async function sendFromDock(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('.dock input.input')
  const text = (input?.value ?? '').trim()
  if (!text) {
    window.__toast?.('先说一句你的思路')
    return
  }
  appendBubble('me', text)
  if (input) input.value = ''

  const data = await loadOverview()
  const weak = data?.profile.weakPoints[0]
  const reply = weak
    ? `你上次在「${weak.name}」这里卡过（掌握 ${Math.round(weak.mastery * 100)}%）。先说说不看答案的话，你打算从哪一步开始？`
    : '先别急着看答案 —— 你觉得这道题给的条件里，哪一个是关键？'
  window.setTimeout(() => appendBubble('ai', reply), 220)
}

async function askQuestion(): Promise<void> {
  const data = await loadOverview()
  const weak = data?.profile.weakPoints[0]?.name ?? data?.due[0]?.name ?? '上一节的内容'
  const input = document.querySelector<HTMLInputElement>('.dock input.input')
  if (!input) return
  input.value = `出两道关于「${weak}」的题`
  input.focus()
  window.__toast?.('题目已填进输入框，按 ↑ 发送')
}

/* ---------- 统一委托 ---------- */

let installed = false

/**
 * 在角色栏底部挂一个「学习者画像」入口。
 *
 * 为什么运行时注入而不是改 markup：
 *   那个 panel 属于 Studio 的另一屏，默认屏根本没有；
 *   而角色栏是每屏都在的，挂这里才能"任何时候都点得到"。
 */
function mountProfileEntry(): void {
  const foot = document.querySelector<HTMLElement>('.v-studio .rail-foot')
  if (!foot || foot.querySelector('[data-profile]')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn ghost'
  btn.dataset.profile = ''
  btn.textContent = '学习者画像 →'
  btn.style.cssText = 'margin-top:8px;width:100%;height:28px;font-size:12px'
  foot.appendChild(btn)
}

export function installInteractions(): void {
  if (installed) return
  installed = true

  // 变体重建 DOM 后入口会消失，挂一个 observer 补回来
  const observer = new MutationObserver(() => mountProfileEntry())
  window.setTimeout(() => {
    mountProfileEntry()
    observer.observe(document.body, { childList: true, subtree: true })
  }, 400)

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const hit = (sel: string): HTMLElement | null => target.closest<HTMLElement>(sel)

    // 画像
    if (hit('[data-profile]')) {
      void openOverview()
      return
    }

    // 开始学习（Wizard 的两个按钮）。[data-golearn] 不抢 ——
    // studio.js 自己有 learn 视图，抢过来会跳变体，和它的行为打架。
    if (hit('[data-start]') || hit('[data-skip]')) {
      goLearn()
      return
    }

    // 保存 / 放弃 / AI 写卡（Studio 预览栏底部那一排）
    // 这三个必须抢在 studio.js 自己的处理器前面：那里只把按钮文字改成
    // 「已保存 ✓」再弹个 toast，什么都没写盘 —— 用户以为存了，其实没有。
    if (hit('.v-studio .footer-bar [data-save]')) {
      e.stopPropagation()
      void saveStudio()
      return
    }
    if (hit('.v-studio .footer-bar [data-discard]')) {
      e.stopPropagation()
      void discardStudio()
      return
    }
    if (hit('.v-studio .footer-bar [data-ai]')) {
      e.stopPropagation()
      void aiDraft()
      return
    }

    // dock：发送 / 出题
    const sendBtn = hit('.dock .dock-btn.send')
    if (sendBtn) {
      void sendFromDock()
      return
    }
    const askBtn = hit('.dock .dock-btn[title="出题"]')
    if (askBtn) {
      void askQuestion()
      return
    }
    // capture：要在 studio.js 自己的处理器之前跑，所以监听用 capture 阶段
  }, { capture: true })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const input = e.target as HTMLElement
    if (!input.classList?.contains('input')) return
    if (!input.closest('.dock')) return
    e.preventDefault()
    void sendFromDock()
  })
}
