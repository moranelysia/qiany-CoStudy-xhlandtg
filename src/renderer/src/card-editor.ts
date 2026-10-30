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
  dims: Record<string, number>
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
  save: (id: string, patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
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
/* 输入框不再有自己的滚动条：高度由内容撑开，超长时收成固定高度 + 展开按钮 */
.ce-row textarea {
  width: 100%; min-height: 54px; resize: none; overflow: hidden; box-sizing: border-box;
  padding: 8px 10px; border-radius: 14px; font: inherit; font-size: 13px; line-height: 1.5;
  color: inherit; border: 0; background: rgba(255,255,255,.55);
  box-shadow: 0 1px 2px rgba(92,118,152,.10);
}
.ce-row textarea:focus { outline: none; background: rgba(255,255,255,.8); box-shadow: 0 0 0 3px rgba(10,132,255,.16); }
.ce-box { position: relative; }
.ce-expand {
  margin: 6px 0 0 auto; display: block; height: 24px; padding: 0 10px;
  border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 600; color: #0a5cc4;
  background: rgba(10,132,255,.10);
}
.ce-expand:hover { background: rgba(10,132,255,.18); }
.ce-expand[hidden] { display: none; }
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
  // 用 div 而不是 label 包住：label 里放按钮，点按钮会把焦点抢到 textarea 上
  return `
  <div class="ce-row">
    <span>${label}${hint ? ' · ' + hint : ''}</span>
    <div class="ce-box">
      <textarea data-ce="${key}" rows="2">${safe}</textarea>
      <button type="button" class="ce-expand" data-ce-expand hidden>展开</button>
    </div>
  </div>`
}

/**
 * 让 textarea 跟着内容长高，而不是自己出滚动条。
 *
 * 收起时最高 5 行；内容超过才显示「展开」，展开后铺全高、按钮变「收起」。
 * overflow 在 CSS 里已经设成 hidden，所以任何状态下都不会出现内部滚动条。
 */
const CE_COLLAPSED_LINES = 5

function autoSizeTextarea(el: HTMLTextAreaElement): void {
  const expanded = el.dataset.ceExpanded === '1'
  el.style.height = 'auto'
  const full = el.scrollHeight
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20
  const cap = Math.round(line * CE_COLLAPSED_LINES)
  el.style.height = (expanded ? full : Math.min(full, cap)) + 'px'
  const btn = el.parentElement?.querySelector<HTMLElement>('[data-ce-expand]')
  if (!btn) return
  const overflows = full > cap + 2
  btn.hidden = !overflows && !expanded
  btn.textContent = expanded ? '收起' : '展开'
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

  /* ---------- 12 个性格维度：这里不再编辑 ----------
   * 原先「看卡」和「角色工坊」各有一套滑条，改了一处另一处不动，
   * 用户按了保存才发现只有一份生效。现在维度只在角色工坊那边调。
   *
   * 关键：这里不渲染也就不往 patch 里塞 dims —— 主进程按已知键逐个覆盖，
   * 没传的维度保持原值，不会被清空（见 cards:save 的 dims 处理）。
   */

  // 记录编辑值
  const values: Record<string, string> = {}
  section.querySelectorAll<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>('[data-ce]').forEach((el) => {
    const key = el.dataset.ce ?? ''
    values[key] = el.value
    el.addEventListener('input', () => {
      values[key] = el.value
      setStatus('有未保存的修改', true)
      if (el instanceof HTMLTextAreaElement) autoSizeTextarea(el)
    })
  })

  // 多行框：挂载时先量一次高度，再接上「展开 / 收起」
  section.querySelectorAll<HTMLTextAreaElement>('textarea[data-ce]').forEach((el) => {
    autoSizeTextarea(el)
    const btn = el.parentElement?.querySelector<HTMLElement>('[data-ce-expand]')
    btn?.addEventListener('click', (ev) => {
      ev.preventDefault()
      el.dataset.ceExpanded = el.dataset.ceExpanded === '1' ? '0' : '1'
      autoSizeTextarea(el)
    })
  })
  // 字体加载完行高会变，量出来的高度会偏；等一帧再补一次
  window.requestAnimationFrame(() => {
    section.querySelectorAll<HTMLTextAreaElement>('textarea[data-ce]').forEach(autoSizeTextarea)
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
      // 只提交这里真正渲染出来的字段；维度不在此编辑，就不带 dims
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
