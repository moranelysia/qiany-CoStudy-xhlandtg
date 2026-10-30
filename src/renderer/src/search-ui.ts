/**
 * 联网搜索面板（DeepSeek 官方 Search API）。
 *
 * 接口：POST {baseUrl}/v1/tools/search，主进程里封装成 `web:search`。
 * 计费按"成功请求次数"（$0.75/千次），跟结果条数无关 —— 所以面板上一次搜索只发一次请求，
 * 点开某条结果才另外走 /v1/tools/fetch 取正文（那也是单独计费的，所以要点才取）。
 */
const STYLE_ID = 'search-ui-style'

const CSS = `
.sr-mask {
  position: fixed; inset: 0; z-index: 122; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.34);
  -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px);
}
.sr-panel {
  display: flex; flex-direction: column;
  width: min(720px, calc(100vw - 56px)); max-height: calc(100vh - 96px);
  border-radius: 24px; color: #10151c;
  background: rgba(255, 255, 255, 0.96);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%);
  box-shadow: 0 30px 80px rgba(30, 44, 62, 0.32);
  -webkit-app-region: no-drag;
  overflow: hidden;
}
.sr-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px 12px; }
.sr-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.sr-badge {
  padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, 0.12);
}
.sr-close {
  margin-left: auto; width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: rgba(120, 148, 178, 0.14); color: #5a6a7a; cursor: pointer; font-size: 13px;
}
.sr-close:hover { background: rgba(120, 148, 178, 0.24); }
.sr-search { display: flex; gap: 8px; padding: 0 20px 12px; }
.sr-input {
  flex: 1; height: 38px; padding: 0 13px; box-sizing: border-box;
  border: 0; border-radius: 12px; font: inherit; font-size: 13px; color: inherit;
  background: rgba(196, 219, 242, 0.28);
  box-shadow: inset 0 0 0 1px rgba(92, 118, 152, 0.12);
}
.sr-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.16); }
.sr-go {
  height: 38px; padding: 0 18px; border: 0; border-radius: 12px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 600; color: #fff; background: #0a84ff;
}
.sr-go:hover { background: #0a74e0; }
.sr-go[disabled] { opacity: 0.55; cursor: default; }
.sr-body { overflow-y: auto; padding: 4px 20px 20px; overscroll-behavior: contain; }
.sr-status { padding: 14px 2px; font-size: 12.5px; color: #5a6a7a; }
.sr-status.err { color: #b42318; }
.sr-item {
  display: block; width: 100%; text-align: left; border: 0; cursor: pointer;
  padding: 12px 14px; margin-bottom: 8px; border-radius: 14px; font: inherit;
  background: rgba(196, 219, 242, 0.18); color: inherit;
}
.sr-item:hover { background: rgba(196, 219, 242, 0.34); }
.sr-item-top { display: flex; align-items: baseline; gap: 8px; }
.sr-item-title { flex: 1; font-size: 13.5px; font-weight: 600; line-height: 1.45; }
.sr-score { flex: none; font-size: 11px; color: #0a5cc4; }
.sr-meta { margin-top: 4px; font-size: 11.5px; color: #8a97a8; }
.sr-snip { margin-top: 6px; font-size: 12.5px; line-height: 1.6; color: #41505f; }
.sr-detail {
  margin-top: 8px; padding: 10px 12px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.8); font-size: 12.5px; line-height: 1.68;
  color: #33404d; white-space: pre-wrap; max-height: 260px; overflow-y: auto;
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface Item {
  title: string
  url: string
  snippet: string
  summary: string
  content: string
  siteName: string | null
  date: string | null
  authority: number
  score: number
}

function escText(text: string): string {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

let current: HTMLElement | null = null

/** 打开搜索面板。initialQuery 可以带当前学习主题进去 */
export function openSearchPanel(initialQuery = ''): void {
  ensureStyle()
  if (current) current.remove()

  const mask = document.createElement('div')
  mask.className = 'sr-mask'
  mask.innerHTML =
    '<div class="sr-panel" role="dialog" aria-label="联网搜索">' +
    '<div class="sr-head"><span class="sr-title">联网查一下</span>' +
    '<span class="sr-badge">DeepSeek 搜索</span>' +
    '<button class="sr-close" data-sr-close aria-label="关闭">✕</button></div>' +
    '<div class="sr-search">' +
    '<input class="sr-input" data-sr-q placeholder="搜什么？例如：一元二次方程 判别式 讲解" />' +
    '<button class="sr-go" data-sr-go>搜索</button></div>' +
    '<div class="sr-body" data-sr-body><div class="sr-status">输入关键词，结果来自 DeepSeek 自建搜索引擎。</div></div>' +
    '</div>'
  document.body.appendChild(mask)
  current = mask

  const input = mask.querySelector<HTMLInputElement>('[data-sr-q]')
  const goBtn = mask.querySelector<HTMLButtonElement>('[data-sr-go]')
  const body = mask.querySelector<HTMLElement>('[data-sr-body]')
  if (input) input.value = initialQuery
  if (!body) return

  const close = (): void => {
    mask.remove()
    if (current === mask) current = null
  }
  mask.querySelector('[data-sr-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  }, { once: true })

  const setStatus = (text: string, isError = false): void => {
    body.innerHTML = '<div class="sr-status' + (isError ? ' err' : '') + '">' + escText(text) + '</div>'
  }

  const render = (items: Item[]): void => {
    if (!items.length) {
      setStatus('没有搜到结果。换个说法，或者用 site: / lang: / after: 这些检索语法收窄范围。')
      return
    }
    body.innerHTML = ''
    for (const item of items) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'sr-item'
      const meta = [
        item.siteName ?? '',
        shortDate(item.date),
        item.authority >= 3 ? '权威来源' : '',
        item.score ? '相关度 ' + item.score.toFixed(1) : '',
      ].filter(Boolean).join(' · ')
      row.innerHTML =
        '<span class="sr-item-top"><span class="sr-item-title">' + escText(item.title || item.url) + '</span>' +
        (item.score >= 1.5 ? '<span class="sr-score">高质量</span>' : '') + '</span>' +
        (meta ? '<span class="sr-meta">' + escText(meta) + '</span>' : '') +
        '<span class="sr-snip">' + escText(item.snippet || item.summary) + '</span>'
      let detail: HTMLElement | null = null
      row.addEventListener('click', () => {
        // 已经展开就收起；没展开就用 summary 先给出内容（官方搜索自带 600–800 字摘要）
        if (detail) {
          detail.remove()
          detail = null
          return
        }
        detail = document.createElement('span')
        detail.className = 'sr-detail'
        detail.textContent = item.summary || item.snippet || '（这一条没带摘要）'
        row.appendChild(detail)
      })
      body.appendChild(row)
    }
  }

  const run = (): void => {
    const query = (input?.value ?? '').trim()
    if (!query) {
      if (input) input.focus()
      return
    }
    if (goBtn) goBtn.disabled = true
    setStatus('正在搜索…')
    void (async () => {
      const api = window.costudy
      if (!api?.webSearch) {
        setStatus('搜索接口不可用（preload 没暴露 webSearch）', true)
        if (goBtn) goBtn.disabled = false
        return
      }
      const res = await api.webSearch(query, 8)
      if (goBtn) goBtn.disabled = false
      if (!res.ok) {
        setStatus('搜索失败：' + (res.error ?? '未知原因'), true)
        return
      }
      render(res.results ?? [])
    })()
  }

  goBtn?.addEventListener('click', run)
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run()
  })
  window.setTimeout(() => input?.focus(), 40)
}
