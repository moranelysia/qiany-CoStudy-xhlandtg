/**
 * 角色卡编辑器（阶段 3.2）。
 *
 * 【为什么不直接改变体的渲染函数】
 *   三个变体是原型阶段的产物，各自一整套夹具。把编辑器塞进 studio.js
 *   会让"原型代码"和"产品代码"越缠越紧，以后改编辑器得动变体。
 *   这里做成注入式：页面挂载后自己找位置插一块，卸载时随 innerHTML 一起消失。
 *
 * 【字段分组】按 chara_card_v2 规范：
 *   身份（emoji/称呼/适龄）· 人设（性格/来历/情境）· 对话（开场/示例）
 *   行为（系统约束/每轮提醒）· 学习（风格/守则/在场/开场白）
 *
 * 名字与称呼仍然用「身份」面板里原有的两个输入框（data-in="name"/"nickname"），
 * 避免同一个字段有两个真相。
 */
export interface CardDetailLike {
  id: string
  name: string
  emoji: string
  address: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  mesExample: string
  systemPrompt: string
  postHistoryInstructions: string
  style: string
  rules: string
  behavior: string
  opening: string
  ageRating: string
}

interface CardsApi {
  list: () => Promise<Array<{ id: string; name: string; isActive: boolean }>>
  get: (id: string) => Promise<CardDetailLike | null>
  create: (name?: string) => Promise<unknown>
  duplicate: (id: string) => Promise<unknown>
  remove: (id: string) => Promise<boolean>
  setActive: (id: string) => Promise<boolean>
  importJson: (text: string) => Promise<{ ok: boolean; error?: string }>
  exportJson: (id: string) => Promise<string | null>
  save: (id: string, patch: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
}

function api(): CardsApi | null {
  const w = window as unknown as { costudy?: { cards?: CardsApi } }
  return w.costudy?.cards ?? null
}

const STYLE_ID = 'card-editor-style'

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.ce-grid { display: grid; gap: 10px; margin-top: 10px; }
.ce-row { display: block; }
.ce-row > span { display: block; font-size: 12px; color: var(--label-2); margin-bottom: 4px; }
.ce-row textarea {
  width: 100%; min-height: 54px; resize: vertical; box-sizing: border-box;
  padding: 8px 10px; border-radius: 14px; font: inherit; font-size: 13px; line-height: 1.5;
  color: inherit; border: 0; background: rgba(255,255,255,.55);
  box-shadow: 0 1px 2px rgba(92,118,152,.10);
}
.ce-row textarea:focus { outline: none; background: rgba(255,255,255,.8); box-shadow: 0 0 0 3px rgba(10,132,255,.16); }
.ce-two { display: grid; grid-template-columns: 92px 1fr; gap: 10px; }
.ce-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ce-status { margin-top: 10px; font-size: 12px; color: var(--label-2); min-height: 16px; }
.ce-status[data-dirty] { color: #b45309; }
.card-editor details > summary { cursor: pointer; font-size: 12px; color: var(--label-2); margin-top: 8px; }
`
  document.head.appendChild(style)
}

function field(label: string, key: keyof CardDetailLike, value: string, hint?: string): string {
  const safe = value.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)
  return `
  <label class="ce-row">
    <span>${label}${hint ? ' · ' + hint : ''}</span>
    <textarea data-ce="${key}" rows="2">${safe}</textarea>
  </label>`
}

export async function mountCardEditor(): Promise<boolean> {
  const cards = api()
  const host = document.querySelector<HTMLElement>('.v-studio main')
  if (!cards || !host) return false
  if (host.querySelector('[data-ce-root]')) return true

  ensureStyle()

  /**
   * 当前卡 id 必须【按需解析】，不能在挂载时捕获一次。
   * 踩过的坑：编辑器挂载时记住 activeId，用户点了另一张卡再保存，
   * 内容写进了旧卡；读回 activeCard 却是新卡 → 显示"保存成功但内容没了"。
   */
  let activeId = ''
  const resolveActiveId = async (): Promise<string> => {
    const list = await cards.list()
    activeId = (list.find((c) => c.isActive) ?? list[0])?.id ?? ''
    return activeId
  }
  await resolveActiveId()
  const card = activeId ? await cards.get(activeId) : null

  const section = document.createElement('section')
  section.className = 'panel card card-editor'
  section.dataset.ceRoot = '1'
  section.innerHTML = `
    <div class="panel-head">
      <span class="panel-name">角色卡</span>
      <span class="ce-actions">
        <button class="btn sm" data-ce-act="new">新建</button>
        <button class="btn sm" data-ce-act="dup">复制</button>
        <button class="btn sm" data-ce-act="del">删除</button>
        <button class="btn sm" data-ce-act="import">导入</button>
        <button class="btn sm" data-ce-act="export">导出</button>
        <button class="btn sm primary" data-ce-act="save">保存</button>
      </span>
    </div>
    <div class="ce-grid">
      <div class="ce-two">
        <label class="ce-row"><span>头像 emoji</span><input class="input" data-ce="emoji" value="${(card?.emoji ?? '✧').replace(/"/g, '&quot;')}" /></label>
        <label class="ce-row"><span>适龄</span>
          <select class="input" data-ce="ageRating">
            <option value="all-ages">全年龄</option>
            <option value="teen">青少年</option>
            <option value="adult">成人</option>
          </select>
        </label>
      </div>
      ${field('性格特质', 'personality', card?.personality ?? '', '写行为倾向，别堆形容词')}
      ${field('来历 / 背景', 'description', card?.description ?? '')}
      ${field('情境', 'scenario', card?.scenario ?? '')}
      ${field('说话风格', 'style', card?.style ?? '')}
      ${field('伴学守则', 'rules', card?.rules ?? '')}
      ${field('在场的样子', 'behavior', card?.behavior ?? '')}
      ${field('开场白', 'opening', card?.opening ?? '')}
      <details>
        <summary>更多字段（示例对话 / 系统约束 / 每轮提醒）</summary>
        <div class="ce-grid">
          ${field('示例对话', 'mesExample', card?.mesExample ?? '', '{{user}}: … / {{char}}: …')}
          ${field('系统约束', 'systemPrompt', card?.systemPrompt ?? '')}
          ${field('每轮提醒', 'postHistoryInstructions', card?.postHistoryInstructions ?? '')}
        </div>
      </details>
    </div>
    <div class="ce-status" data-ce-status>${card ? '已载入「' + card.name + '」' : '还没有角色卡，点「新建」开始'}</div>
  `

  // 插到「身份」面板之后
  const identity = [...host.querySelectorAll('section.panel')].find((el) =>
    el.textContent?.includes('身份'),
  )
  if (identity?.parentElement === host) identity.after(section)
  else host.appendChild(section)

  const status = section.querySelector<HTMLElement>('[data-ce-status]')
  const setStatus = (text: string, dirty = false): void => {
    if (!status) return
    status.textContent = text
    status.toggleAttribute('data-dirty', dirty)
  }

  if (card) {
    const select = section.querySelector<HTMLSelectElement>('[data-ce="ageRating"]')
    if (select) select.value = card.ageRating
  }

  // 记录编辑值
  const values: Record<string, string> = {}
  section.querySelectorAll<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>('[data-ce]').forEach((el) => {
    const key = el.dataset.ce ?? ''
    values[key] = el.value
    el.addEventListener('input', () => {
      values[key] = el.value
      setStatus('有未保存的修改', true)
    })
  })

  const refresh = async (): Promise<void> => {
    const next = await cards.list()
    const active = (next.find((c) => c.isActive) ?? next[0])?.id ?? ''
    const fresh = active ? await cards.get(active) : null
    // 名字/称呼走「身份」面板原有的输入框，这里一并同步
    const nameInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
    const nickInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="nickname"]')
    if (fresh && nameInput) {
      nameInput.value = fresh.name
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (fresh && nickInput) {
      nickInput.value = fresh.address
      nickInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    // 重挂编辑器（字段要跟着换卡）
    section.remove()
    await mountCardEditor()
  }

  section.querySelector('[data-ce-act="save"]')?.addEventListener('click', () => {
    void (async () => {
      const nameInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="name"]')
      const nickInput = document.querySelector<HTMLInputElement>('.v-studio [data-in="nickname"]')
      const id = await resolveActiveId()
      if (!id) {
        setStatus('还没有角色卡，先点「新建」')
        return
      }
      const patch: Record<string, string> = { ...values }
      if (nameInput) patch.name = nameInput.value
      if (nickInput) patch.address = nickInput.value
      const result = await cards.save(id, patch)
      if (result.ok) {
        setStatus('已保存')
        await refresh()
      } else {
        setStatus('保存失败：' + (result.error ?? '未知原因'), true)
      }
    })()
  })

  section.querySelector('[data-ce-act="new"]')?.addEventListener('click', () => {
    void (async () => {
      await cards.create('新角色')
      const next = await cards.list()
      const created = next[next.length - 1]
      if (created) await cards.setActive(created.id)
      setStatus('已新建')
      await refresh()
    })()
  })

  section.querySelector('[data-ce-act="dup"]')?.addEventListener('click', () => {
    void (async () => {
      const id = await resolveActiveId()
      if (!id) return
      await cards.duplicate(id)
      setStatus('已复制')
      await refresh()
    })()
  })

  section.querySelector('[data-ce-act="del"]')?.addEventListener('click', () => {
    void (async () => {
      const id = await resolveActiveId()
      if (!id) return
      const ok = window.confirm('删除这张角色卡？这个操作不能撤销。')
      if (!ok) return
      await cards.remove(id)
      setStatus('已删除')
      await refresh()
    })()
  })

  section.querySelector('[data-ce-act="export"]')?.addEventListener('click', () => {
    void (async () => {
      const id = await resolveActiveId()
      if (!id) return
      const text = await cards.exportJson(id)
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        setStatus('已复制到剪贴板（chara_card_v2）')
      } catch {
        window.prompt('导出内容（手动复制）：', text)
      }
    })()
  })

  section.querySelector('[data-ce-act="import"]')?.addEventListener('click', () => {
    void (async () => {
      let text = ''
      try {
        text = await navigator.clipboard.readText()
      } catch {
        text = window.prompt('粘贴角色卡 JSON：', '') ?? ''
      }
      if (!text.trim()) {
        setStatus('剪贴板里没有内容')
        return
      }
      const result = await cards.importJson(text)
      if (result.ok) {
        setStatus('已导入')
        await refresh()
      } else {
        setStatus('导入失败：' + (result.error ?? '未知原因'), true)
      }
    })()
  })

  // 换卡后重挂一次：字段值、适龄下拉、当前 id 都要跟着换
  window.addEventListener('costudy:card-changed', () => {
    section.remove()
    void mountCardEditor()
  })

  return true
}
