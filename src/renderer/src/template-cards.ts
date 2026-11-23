/**
 * 模板 → 角色卡的桥（网页端与桌面端通用）。
 *
 * 背景：工坊左侧「模板起步」是原型里的视觉列表，点它只会改本地 UI 状态
 * （名字 / 滑块 / 预览），**不会写进角色卡**。于是用户选了「严格教练」，
 * 顶部和伴学页仍然显示磁盘上那张「温柔学姐」。
 *
 * 这里做一件事：点到模板时，把模板落成一张真卡并设为当前卡，
 * 然后调用既有的同步函数，让角色栏、身份输入框、滑块、预览一起刷新。
 *
 * 幂等：已有同名卡就切过去，不再重复创建。
 */

interface TemplateSeed {
  /** 与 app/data.js 的模板 id 一致（studio.js 用 data-card / data-template 挂着它） */
  id: string
  name: string
  emoji: string
  line: string
}

/** 与 src/renderer/src/app/data.js 的 TEMPLATES 保持一致（名字/emoji/一句话） */
const TEMPLATES: TemplateSeed[] = [
  { id: 'senior', name: '温柔学姐', emoji: '🌸', line: '耐心、会换着说法讲，直到你真的懂' },
  { id: 'coach', name: '严格教练', emoji: '🎯', line: '盯练习、不当好人，但绝不糊弄你' },
  { id: 'quiet', name: '话少学霸', emoji: '📘', line: '不寒暄，直接给结构和干货' },
  { id: 'neighbor', name: '邻家哥哥', emoji: '🌿', line: '满脑子生活例子，把抽象讲成具体' },
  { id: 'peer', name: '好奇同桌', emoji: '💬', line: '什么都想问你一句，一起把题聊明白' },
  { id: 'prof', name: '沉稳老教授', emoji: '🕯', line: '重推导、重来源，慢但一次讲透' },
  { id: 'rival', name: '竞争型搭档', emoji: '⚡', line: '跟你比着做题，错了会直接指出来' },
  { id: 'librarian', name: '安静图书管理员', emoji: '📚', line: '话不多，但总能翻到你需要的那页' },
]

function findTemplate(key: string, name: string): TemplateSeed | null {
  return TEMPLATES.find((t) => t.id === key) ?? TEMPLATES.find((t) => t.name === name) ?? null
}

async function applyTemplate(tpl: TemplateSeed): Promise<void> {
  const api = window.costudy
  if (!api?.cards) return

  const list = await api.cards.list()
  const existing = list.find((c) => c.name === tpl.name)
  let id = existing?.id ?? ''

  if (!id) {
    const created = await api.cards.create(tpl.name)
    if (!created?.id) {
      window.__toast?.('模板没有建成角色卡')
      return
    }
    id = created.id
  }

  await api.cards.save(id, {
    name: tpl.name,
    emoji: tpl.emoji,
    // 一句话人设先写进性格，用户还能继续改
    personality: tpl.line,
  })
  await api.cards.setActive(id)

  // 让界面跟上：角色栏 / 身份输入框 / 滑块 / 预览
  const mod = await import('./cards-ui')
  await mod.syncCardsToRail()
  await mod.syncIdentityInputs()
  await mod.syncDimsFromCard()
  await mod.syncPreviewReplyName()

  window.__toast?.('已切换到「' + tpl.name + '」')
}

export function installTemplateCards(): void {
  // 捕获阶段拦截：先让原型的 applyTemplate 跑（改滑块和预览），再落库
  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      const item = target.closest('.v-studio .card-item')
      if (!item) return
      // studio.js 前 3 个模板用 data-card（值也是模板 id），其余用 data-template；
      // 真实卡片的 data-card 是 role-xxx，按 id 区分，别误伤
      const key = (item.getAttribute('data-template') || item.getAttribute('data-card') || '').trim()
      const name = (item.querySelector('.card-name')?.textContent ?? '').trim()
      const tpl = findTemplate(key, name)
      if (!tpl) return
      // 等原型把 state 改完，再写卡（避免它随后覆盖滑块）
      window.setTimeout(() => {
        void applyTemplate(tpl).catch((err) => {
          console.warn('[template-cards] 应用模板失败', err)
        })
      }, 60)
    },
    true,
  )
}
