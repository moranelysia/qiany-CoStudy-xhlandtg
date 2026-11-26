/**
 * Markdown 渲染（气泡正文用）。
 *
 * 为什么需要：
 *   模型默认按 Markdown 说话 —— 表格、代码块、`##` 标题、`- ` 列表、`$公式$`。
 *   以前气泡只做「转义 + 换行 + 加粗 + 行内代码 + 代码块 + 公式」，
 *   表格和列表会原样露出一堆 `|` 和 `-`，模型精心排的表看起来像乱码。
 *
 * 设计：
 *   · 行内标记（粗体、行内代码、删除线、链接）和公式交给 math-ui —— 那里已经
 *     处理了 KaTeX 与「1/2、√3、x^2」这类纯文本兜底，不重复造。
 *   · 这里只负责**块级**：标题、列表、表格、引用、分割线、段落。
 *   · 先切出围栏代码块（内部不做任何排版魔法），其余按行解析。
 *   · 全程 HTML 转义 —— 模型输出当数据，不当 HTML。
 */
import { renderInlineMarkdown } from './math-ui'

const FENCE = /```[ \t]*([A-Za-z0-9+#.-]*)[ \t]*\r?\n([\s\S]*?)```/
const STYLE_ID = 'costudy-markdown-style'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function codeBlock(lang: string, body: string): string {
  const cls = lang ? ' class="md-code lang-' + escapeHtml(lang) + '"' : ' class="md-code"'
  return '<pre' + cls + '><code>' + escapeHtml(body.replace(/\s+$/, '')) + '</code></pre>'
}

/** 表格：表头 | 分隔行 | 数据行 */
function isTableStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length) return false
  const head = lines[i].trim()
  const sep = lines[i + 1].trim()
  if (!head.includes('|')) return false
  if (!/^\|?[\s:|-]+\|?$/.test(sep) || !sep.includes('-')) return false
  return true
}

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

function renderTable(lines: string[], i: number): { html: string; next: number } {
  const head = splitRow(lines[i])
  const align = splitRow(lines[i + 1]).map((c) => {
    const l = c.startsWith(':')
    const r = c.endsWith(':')
    return l && r ? 'center' : r ? 'right' : l ? 'left' : ''
  })
  const rows: string[][] = []
  let j = i + 2
  while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
    rows.push(splitRow(lines[j]))
    j += 1
  }
  const th = head
    .map((c, k) => '<th' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + renderInlineMarkdown(c) + '</th>')
    .join('')
  const tb = rows
    .map(
      (r) =>
        '<tr>' +
        head
          .map(
            (_h, k) =>
              '<td' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' +
              renderInlineMarkdown(r[k] ?? '') +
              '</td>',
          )
          .join('') +
        '</tr>',
    )
    .join('')
  return {
    html: '<div class="md-table-wrap"><table class="md-table"><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></div>',
    next: j,
  }
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const DISPLAY_MATH = /^\s*(\$\$|\\\[)/

function displayMathEnd(lines: string[], start: number, opener: RegExpMatchArray): number {
  const closing = opener[1] === '$$' ? '$$' : '\\]'
  if (lines[start].slice(opener[0].length).trimEnd().endsWith(closing)) return start
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (line === closing) return i
    if (DISPLAY_MATH.test(line)) break
    if (line.endsWith(closing)) return i
  }
  return -1
}

function renderBlocks(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 空行
    if (!line.trim()) {
      i += 1
      continue
    }

    const opener = line.match(DISPLAY_MATH)
    if (opener) {
      const end = displayMathEnd(lines, i, opener)
      if (end >= 0) {
        out.push(renderInlineMarkdown(lines.slice(i, end + 1).join('\n').trim()))
        i = end + 1
        continue
      }
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = Math.min(6, Math.max(1, h[1].length))
      out.push('<h' + level + ' class="md-h">' + renderInlineMarkdown(h[2].trim()) + '</h' + level + '>')
      i += 1
      continue
    }

    // 分割线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr class="md-hr" />')
      i += 1
      continue
    }

    // 表格
    if (isTableStart(lines, i)) {
      const r = renderTable(lines, i)
      out.push(r.html)
      i = r.next
      continue
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push('<blockquote class="md-quote">' + renderBlocks(buf.join('\n')) + '</blockquote>')
      continue
    }

    // 列表（支持一层嵌套）
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: Array<{ depth: number; text: string }> = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
        if (!m) break
        const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2)
        items.push({ depth: Math.min(depth, 1), text: m[3] })
        i += 1
      }
      const tag = ordered ? 'ol' : 'ul'
      let html = '<' + tag + ' class="md-list">'
      let depth = 0
      for (const it of items) {
        if (it.depth > depth) {
          html += '<' + tag + ' class="md-list">'
          depth = it.depth
        } else if (it.depth < depth) {
          html += '</' + tag + '>'
          depth = it.depth
        }
        html += '<li>' + renderInlineMarkdown(it.text) + '</li>'
      }
      while (depth > 0) {
        html += '</' + tag + '>'
        depth -= 1
      }
      html += '</' + tag + '>'
      out.push(html)
      continue
    }

    // 段落：连续非空、非块级起始的行
    const para: string[] = []
    while (i < lines.length) {
      const l = lines[i]
      if (!l.trim() || (para.length > 0 && DISPLAY_MATH.test(l))) break
      if (/^(#{1,6})\s+/.test(l) || /^\s*>/.test(l) || LIST_RE.test(l)) break
      if (/^\s*([-*_])\1{2,}\s*$/.test(l)) break
      if (isTableStart(lines, i)) break
      para.push(l.trim())
      i += 1
    }
    if (para.length) {
      out.push('<p class="md-p">' + para.map((l) => renderInlineMarkdown(l)).join('<br />') + '</p>')
    }
  }

  return out.join('')
}

/** 把 Markdown 变成 HTML 字符串（块级 + 行内，含公式） */
export function renderMarkdown(text: string): string {
  const parts: string[] = []
  let rest = text
  // 先切围栏代码块：代码里不解析任何 Markdown
  for (;;) {
    const m = FENCE.exec(rest)
    if (!m) {
      parts.push(renderBlocks(rest))
      break
    }
    parts.push(renderBlocks(rest.slice(0, m.index)))
    parts.push(codeBlock(m[1] ?? '', m[2] ?? ''))
    rest = rest.slice(m.index + m[0].length)
  }
  return parts.join('')
}

const STYLE = `
.md-body { line-height: 1.7; word-break: break-word; }
.md-body .md-p { margin: 0 0 10px; }
.md-body .md-p:last-child { margin-bottom: 0; }
.md-body .md-h {
  margin: 14px 0 8px; line-height: 1.35; font-weight: 700; color: inherit;
  background: none; -webkit-background-clip: initial; -webkit-text-fill-color: currentColor;
}
.md-body h1.md-h { font-size: 1.34em; }
.md-body h2.md-h { font-size: 1.22em; }
.md-body h3.md-h { font-size: 1.1em; }
.md-body h4.md-h, .md-body h5.md-h, .md-body h6.md-h { font-size: 1em; }
.md-body .md-list { margin: 4px 0 10px; padding-left: 1.35em; }
.md-body .md-list .md-list { margin: 2px 0 2px; }
.md-body .md-list li { margin: 3px 0; }
.md-body .md-list li::marker { color: #86868b; }
.md-body .md-quote {
  margin: 8px 0; padding: 6px 12px; border-left: 3px solid rgba(10,132,255,.55);
  background: rgba(10,132,255,.06); border-radius: 6px; color: inherit;
}
.md-body .md-hr { border: 0; border-top: 1px solid rgba(0,0,0,.12); margin: 14px 0; }
.md-body .md-table-wrap { overflow-x: auto; margin: 10px 0; border-radius: 10px; border: 1px solid rgba(0,0,0,.1); }
.md-body .md-table { width: 100%; border-collapse: collapse; font-size: .95em; }
.md-body .md-table th, .md-body .md-table td {
  padding: 7px 10px; border-bottom: 1px solid rgba(0,0,0,.08); text-align: left; vertical-align: top;
}
.md-body .md-table thead th { background: rgba(0,0,0,.035); font-weight: 600; }
.md-body .md-table tbody tr:last-child td { border-bottom: 0; }
.md-body .md-code {
  margin: 10px 0; padding: 12px 14px; border-radius: 10px; overflow-x: auto;
  background: #0f1726; color: #e8eefc; font-size: .9em; line-height: 1.6;
  font-family: "SF Mono", "Cascadia Mono", Consolas, "Menlo", monospace;
}
.md-body .md-code code { background: none; color: inherit; padding: 0; }
.md-body code {
  background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 5px;
  font-family: "SF Mono", "Cascadia Mono", Consolas, "Menlo", monospace; font-size: .92em;
}
.md-body a { color: #0a84ff; text-decoration: none; border-bottom: 1px solid rgba(10,132,255,.35); }
.md-body del { opacity: .6; }
.md-body .katex-display { margin: 10px 0; overflow-x: auto; overflow-y: hidden; }
`

function ensureStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = STYLE
  document.head.appendChild(el)
}

/** 显示用：把气泡内容按 Markdown 渲染（含公式、表格、代码块） */
export function setMarkdownContent(el: HTMLElement, text: string): void {
  ensureStyle()
  el.innerHTML = renderMarkdown(text)
  el.classList.add('md-body', 'katex-host')
}
