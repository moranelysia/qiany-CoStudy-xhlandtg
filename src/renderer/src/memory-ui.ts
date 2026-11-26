/**
 * 记忆库界面（输入框旁边「忆」打开的那个）。
 *
 * 【为什么重做】
 *   原来点「忆」弹的是 dock 旁边一个小浮层：一个搜索框 + 平铺 40 条，
 *   而且主进程压根没注册 `memory:library` 这个通道，所以永远显示"记忆库读不到"。
 *   这里做成一个真正的面板：统计 / 检索 / 学科·类型筛选 / 逐条归档。
 *
 * 【数据从哪来】
 *   · 列表：window.costudy.memoryLibrary() → 主进程 viewLibrary()
 *   · 检索：memoryLibrarySearch(q, k) → 带命中词和分数
 *   · 归档：memoryLibraryArchive(id) → 归档后不再出现在列表里（文件里留着）
 */
const STYLE_ID = 'memory-ui-style'

const CSS = `
.mem-panel {
  /* 不用全屏遮罩层：实测（2026-11-02）position fixed + inset 0 的遮罩在这个环境里
     整层不渲染 —— DOM 在、getComputedStyle 全对、elementFromPoint 也能命中，
     但截出来是空的；把面板从遮罩里提出来单独 fixed 就正常。
     所以改成面板自己 fixed 居中，暗底用超大的 box-shadow 铺满屏幕（同一个绘制层，不会丢）。
     注意：CSS 注释里不能写反引号，这个文件是模板字符串。 */
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 96;
  display: flex; flex-direction: column;
  width: min(760px, calc(100vw - 56px));
  height: min(660px, calc(100vh - 88px));
  padding: 22px 24px 16px;
  border-radius: 26px;
  color: var(--label-1, #10151c);
  background: #fff;
  border: .5px solid rgba(120, 148, 178, .22);
  box-shadow: 0 0 0 100vmax rgba(18, 26, 38, .28), 0 24px 70px rgba(30, 44, 62, .24);
  -webkit-app-region: no-drag;
}

.mem-head { display: flex; align-items: flex-start; gap: 12px; }
.mem-head-main { flex: 1; min-width: 0; }
.mem-title { font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.mem-sub { margin-top: 4px; font-size: 12px; color: var(--label-2); line-height: 1.6; }
.mem-close {
  flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%;
  cursor: pointer; font-size: 14px; color: var(--label-2); background: rgba(120, 148, 178, .12);
}
.mem-close:hover { background: rgba(120, 148, 178, .2); }

.mem-stats { display: flex; gap: 18px; margin: 14px 0 12px; }
.mem-stat { font-size: 12px; color: var(--label-2); }
.mem-stat b { font-size: 15px; font-weight: 700; color: var(--label-1, #10151c); margin-right: 3px; }

.mem-toolbar { display: flex; gap: 8px; }
.mem-add { display: flex; gap: 8px; margin-top: 8px; }
.mem-add input { min-width: 0; }
.mem-q {
  flex: 1; height: 36px; padding: 0 12px; font: inherit; font-size: 13px;
  border: .5px solid rgba(120, 148, 178, .34); border-radius: 10px;
  background: rgba(255, 255, 255, .8); color: inherit; outline: none;
}
.mem-q:focus { border-color: rgba(10, 132, 255, .5); }
.mem-op {
  flex: none; height: 36px; padding: 0 14px; border: 0; border-radius: 10px;
  cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, .12);
}
.mem-op:hover { background: rgba(10, 132, 255, .2); }

.mem-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; }
.mem-chip {
  border: .5px solid rgba(120, 148, 178, .3); background: rgba(120, 148, 178, .08);
  color: var(--label-2); border-radius: 999px; padding: 3px 10px;
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.mem-chip[data-on] { color: #0a5cc4; background: rgba(10, 132, 255, .14); border-color: rgba(10, 132, 255, .4); }
.mem-chip:disabled { opacity: .38; cursor: default; }

.mem-hits-line { margin: 8px 0 0; font-size: 11.5px; color: var(--label-2); }

.mem-list { flex: 1; min-height: 0; overflow-y: auto; margin-top: 10px; padding-right: 4px; }
.mem-card {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 0; border-top: .5px solid rgba(120, 148, 178, .2);
}
.mem-card:first-child { border-top: 0; }
.mem-card-main { flex: 1; min-width: 0; }
.mem-card-text { font-size: 13.5px; line-height: 1.7; word-break: break-word; }
.mem-card-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.mem-tag {
  font-size: 10.5px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
  color: #0a5cc4; background: rgba(10, 132, 255, .1);
}
.mem-tag.kind { color: #8a5a00; background: rgba(214, 158, 46, .16); }
.mem-card-ev { margin-top: 6px; font-size: 11.5px; color: var(--label-2); line-height: 1.5; }
.mem-card-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.mem-hits { font-size: 11px; color: var(--label-2); }
.mem-arch {
  border: 0; border-radius: 8px; padding: 3px 9px; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600;
  color: #6b7a8a; background: rgba(120, 148, 178, .14);
}
.mem-arch:hover { color: #b42318; background: rgba(180, 35, 24, .12); }
/* 删除：物理删除、不可恢复，和归档（可恢复）必须一眼分开，所以常驻一档淡红 */
.mem-del {
  border: 0; border-radius: 8px; padding: 3px 9px; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600;
  color: #b42318; background: rgba(180, 35, 24, .10);
}
.mem-del:hover { color: #fff; background: #d92d20; }

.mem-empty { padding: 40px 12px; text-align: center; font-size: 12.5px; color: var(--label-2); line-height: 1.8; }
`

interface MemEntry {
  id: string
  text: string
  tags: string[]
  evidence: string
  hits: number
  matched?: string[]
}

interface LibApi {
  memoryLibrary?: () => Promise<{ entries: MemEntry[]; counts: { total: number; archived: number; tagged: number; bySubject?: Record<string, number> } }>
  memoryLibrarySearch?: (q: string, k?: number) => Promise<MemEntry[]>
  memoryLibraryArchive?: (id: string) => Promise<boolean>
  memoryLibraryAdd?: (text: string) => Promise<boolean>
  /** 物理删除（不可恢复） */
  memoryLibraryDelete?: (id: string) => Promise<boolean>
}

const SUBJECTS = ['数学', '物理', '化学', '生物', '英语']
const KINDS = ['知识点', '卡点', '习惯', '目标', '错因', '偏好']

let mask: HTMLElement | null = null

function esc(text: string): string {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

export function closeMemoryLibrary(): void {
  mask?.remove()
  mask = null
}

/** 打开记忆库。重复点不会叠出第二个面板。 */
export async function openMemoryLibrary(): Promise<void> {
  const api = window.costudy as unknown as LibApi | undefined
  if (!api?.memoryLibrary) {
    window.__toast?.('记忆库接口没接上')
    return
  }
  ensureStyle()
  closeMemoryLibrary()

  const wrap = document.createElement('div')
  wrap.className = 'mem-panel'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-label', '记忆库')
  wrap.innerHTML =
    '<div class="mem-head">' +
    '<div class="mem-head-main">' +
    '<div class="mem-title">记忆库</div>' +
    '<div class="mem-sub">' + (api.memoryLibraryAdd
      ? '记录想让搭子记住的学习目标或偏好。记录存在当前浏览器，未归档的记录可能会随问题发送给所选模型。'
      : '这些是我在对话里记下来的东西。检索命中会标明是哪个词对上的；不想要的可以归档。') + '</div>' +
    '</div>' +
    '<button class="mem-close" data-mem-close aria-label="关闭">✕</button>' +
    '</div>' +
    '<div class="mem-stats" data-mem-stats></div>' +
    '<div class="mem-toolbar">' +
    '<input class="mem-q" data-mem-q placeholder="检索记忆（如：电压表）" spellcheck="false" />' +
    '<button class="mem-op" data-mem-search>检索</button>' +
    '</div>' +
    (api.memoryLibraryAdd
      ? '<form class="mem-add" data-mem-add><input class="mem-q" aria-label="新学习记忆" placeholder="记下学习目标或偏好" maxlength="500" required /><button class="mem-op" type="submit">记录</button></form>'
      : '') +
    '<div class="mem-filters" data-mem-filters></div>' +
    '<div class="mem-hits-line" data-mem-hint></div>' +
    '<div class="mem-list" data-mem-list></div>'
  document.body.appendChild(wrap)
  mask = wrap

  const statsEl = wrap.querySelector<HTMLElement>('[data-mem-stats]')!
  const filtersEl = wrap.querySelector<HTMLElement>('[data-mem-filters]')!
  const listEl = wrap.querySelector<HTMLElement>('[data-mem-list]')!
  const hintEl = wrap.querySelector<HTMLElement>('[data-mem-hint]')!
  const qInput = wrap.querySelector<HTMLInputElement>('[data-mem-q]')!

  let all: MemEntry[] = []
  let counts = { total: 0, archived: 0, tagged: 0 }
  let subject = 'all'
  let kind = 'all'
  /** 非空表示当前是检索结果视图 */
  let query = ''

  const paintStats = (): void => {
    statsEl.innerHTML =
      '<span class="mem-stat"><b>' + counts.total + '</b>条记忆</span>' +
      '<span class="mem-stat"><b>' + counts.tagged + '</b>条带检索标记</span>' +
      '<span class="mem-stat"><b>' + counts.archived + '</b>条已归档</span>'
  }

  const countTag = (name: string): number => all.filter((e) => e.tags.includes(name)).length

  const paintFilters = (): void => {
    // 只渲染**有内容**的筛选项：一排 0 条的灰色 chip 只是噪音
    const subjChips = SUBJECTS.filter((n) => countTag(n) > 0)
    const kindChips = KINDS.filter((n) => countTag(n) > 0)
    const chip = (name: string, label: string, attr: string, on: boolean): string =>
      '<button class="mem-chip" ' + attr + '="' + esc(name) + '"' + (on ? ' data-on' : '') + '>' + esc(label) + '</button>'
    filtersEl.innerHTML =
      chip('all', '全部', 'data-mem-subj', subject === 'all' && kind === 'all') +
      subjChips.map((n) => chip(n, n + ' ' + countTag(n), 'data-mem-subj', subject === n)).join('') +
      // 类型这一排不放「全部」：再点一次已选中的 chip 就是取消
      kindChips.map((n) => chip(n, n + ' ' + countTag(n), 'data-mem-kind', kind === n)).join('')
  }

  const visible = (): MemEntry[] => {
    if (query) return all // 检索时 all 已经是搜索结果
    return all.filter((e) => {
      if (subject !== 'all' && !e.tags.includes(subject)) return false
      if (kind !== 'all' && !e.tags.includes(kind)) return false
      return true
    })
  }

  const paintSearchHint = (): void => {
    hintEl.textContent = query ? '检索「' + query + '」· 命中 ' + all.length + ' 条（按相关度排序）' : ''
  }

  const paintList = (): void => {
    paintSearchHint()
    const list = visible()
    if (!list.length) {
      listEl.innerHTML =
        '<div class="mem-empty">' +
        (query ? '没有找到匹配的记忆。'
          : all.length
          ? '这个筛选下没有记忆。<br>换一个学科或点「全部」。'
          : api.memoryLibraryAdd
            ? '还没有学习记忆，可以先记录一条。'
            : '还没有记忆。<br>学到东西时我会自己记下来，记的时候自动打检索标记。') +
        '</div>'
      return
    }
    listEl.innerHTML = list
      .map((e) => {
        const subjTags = e.tags.filter((t) => SUBJECTS.includes(t))
        const kindTags = e.tags.filter((t) => KINDS.includes(t))
        const rest = e.tags.filter((t) => !SUBJECTS.includes(t) && !KINDS.includes(t))
        const tags =
          subjTags.map((t) => '<span class="mem-tag">' + esc(t) + '</span>').join('') +
          kindTags.map((t) => '<span class="mem-tag kind">' + esc(t) + '</span>').join('') +
          rest.map((t) => '<span class="mem-tag">' + esc(t) + '</span>').join('')
        const matched = e.matched && e.matched.length ? '命中：' + esc(e.matched.join('、')) + ' · ' : ''
        return (
          '<div class="mem-card" data-mem-id="' + esc(e.id) + '">' +
          '<div class="mem-card-main">' +
          '<div class="mem-card-text">' + esc(e.text) + '</div>' +
          (tags ? '<div class="mem-card-tags">' + tags + '</div>' : '') +
          '<div class="mem-card-ev">' + matched + (e.evidence ? '依据：' + esc(e.evidence) : '') + '</div>' +
          '</div>' +
          '<div class="mem-card-side">' +
          '<span class="mem-hits">×' + e.hits + '</span>' +
          '<button class="mem-arch" data-mem-arch="' + esc(e.id) + '" title="归档后移出列表，不再参与检索">归档</button>' +
          '<button class="mem-del" data-mem-del="' + esc(e.id) + '" title="删除：从记忆库里彻底删掉，不能恢复">删除</button>' +
          '</div>' +
          '</div>'
        )
      })
      .join('')
  }

  const load = async (): Promise<void> => {
    try {
      const data = await api.memoryLibrary?.()
      all = data?.entries ?? []
      counts = data?.counts ?? { total: 0, archived: 0, tagged: 0 }
      query = ''
      paintStats()
      paintFilters()
      paintList()
    } catch (err) {
      listEl.innerHTML = '<div class="mem-empty">读不到记忆库：' + esc(err instanceof Error ? err.message : String(err)) + '</div>'
    }
  }

  const search = async (): Promise<void> => {
    const q = qInput.value.trim()
    if (!q) {
      await load()
      return
    }
    try {
      const hits = (await api.memoryLibrarySearch?.(q, 20)) ?? []
      all = hits
      query = q
      paintFilters()
      paintList()
    } catch (err) {
      hintEl.textContent = '检索失败：' + (err instanceof Error ? err.message : String(err))
    }
  }

  wrap.querySelector('[data-mem-close]')?.addEventListener('click', closeMemoryLibrary)
  // 点面板外面关掉。面板自己的「暗底」是 box-shadow，不接收点击，
  // 所以这里靠 document 监听判断点是否落在面板外。
  window.setTimeout(() => {
    document.addEventListener(
      'click',
      (e) => {
        if (!mask) return
        const el = e.target as Node | null
        if (el && mask.contains(el)) return
        closeMemoryLibrary()
      },
      { capture: true },
    )
  }, 0)
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void search()
    }
    if (e.key === 'Escape') closeMemoryLibrary()
  })
  wrap.querySelector('[data-mem-search]')?.addEventListener('click', () => void search())
  const form = wrap.querySelector<HTMLFormElement>('[data-mem-add]')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const input = form.querySelector<HTMLInputElement>('input')!
    if (!input.value.trim()) return
    const save = form.querySelector<HTMLButtonElement>('button')!
    save.disabled = true
    try {
      if (!(await api.memoryLibraryAdd?.(input.value))) throw new Error('无法保存记录')
      input.value = ''
      qInput.value = ''
      subject = kind = 'all'
      await load()
    } catch {
      window.__toast?.('记录失败，请重试。')
    } finally {
      save.disabled = false
    }
  })

  filtersEl.addEventListener('click', (e) => {
    const subj = (e.target as HTMLElement).closest<HTMLElement>('[data-mem-subj]')
    const knd = (e.target as HTMLElement).closest<HTMLElement>('[data-mem-kind]')
    const target = subj ?? knd
    if (!target) return
    if (subj) {
      const next = subj.dataset['memSubj'] ?? 'all'
      // 「全部」= 学科和类型都清空
      if (next === 'all') {
        subject = 'all'
        kind = 'all'
      } else {
        subject = subject === next ? 'all' : next
      }
    }
    if (knd) {
      const next = knd.dataset['memKind'] ?? 'all'
      // 再点一次已选中的类型就是取消
      kind = kind === next ? 'all' : next
    }
    // 一按筛选就退出检索视图，否则筛选作用在搜索结果上会很怪
    if (query) {
      query = ''
      hintEl.textContent = ''
      qInput.value = ''
      void load()
      return
    }
    paintFilters()
    paintList()
  })

  listEl.addEventListener('click', (e) => {
    const delBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-mem-del]')
    if (delBtn) {
      const id = delBtn.dataset['memDel'] ?? ''
      if (!id) return
      const entry = all.find((x) => x.id === id)
      // 物理删除不可恢复，必须二次确认，而且把要删的原文摆出来 —— 免得删错条目
      const ok = window.confirm(
        '从记忆库里永久删除这条记忆？\n\n' +
          (entry?.text ?? id) +
          '\n\n删除后不能恢复。只想让它不再被检索，用「归档」就够。',
      )
      if (!ok) return
      delBtn.setAttribute('disabled', '')
      void (async () => {
        try {
          const done = await api.memoryLibraryDelete?.(id)
          if (done) {
            const tagged = Boolean(all.find((x) => x.id === id)?.tags.length)
            all = all.filter((x) => x.id !== id)
            counts.total = Math.max(0, counts.total - 1)
            if (tagged) counts.tagged = Math.max(0, counts.tagged - 1)
            paintStats()
            paintFilters()
            paintList()
            window.__toast?.('已删除')
          } else {
            delBtn.removeAttribute('disabled')
            window.__toast?.('删除失败')
          }
        } catch {
          delBtn.removeAttribute('disabled')
          window.__toast?.('删除失败')
        }
      })()
      return
    }

    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mem-arch]')
    if (!btn) return
    const id = btn.dataset['memArch'] ?? ''
    if (!id) return
    btn.setAttribute('disabled', '')
    void (async () => {
      try {
        const ok = await api.memoryLibraryArchive?.(id)
        if (ok) {
          // 归档成功：从当前视图里拿掉，统计重算
          const tagged = Boolean(all.find((x) => x.id === id)?.tags.length)
          all = all.filter((x) => x.id !== id)
          counts.total = Math.max(0, counts.total - 1)
          counts.archived += 1
          if (tagged) counts.tagged = Math.max(0, counts.tagged - 1)
          paintStats()
          paintFilters()
          paintList()
          window.__toast?.('已归档，不再参与检索。')
        } else {
          btn.removeAttribute('disabled')
          window.__toast?.('归档失败')
        }
      } catch {
        btn.removeAttribute('disabled')
        window.__toast?.('归档失败')
      }
    })()
  })

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && mask) closeMemoryLibrary()
    },
    { once: true },
  )

  await load()
}
