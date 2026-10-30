/**
 * 数学公式渲染（KaTeX）：把 `$...$` / `$$...$$` / `\(...\)` / `\[...\]`
 * 变成课本那样的排版 —— 分数是上下堆叠的、指数是上标、根号有顶线。
 *
 * 为什么必须做：
 *   模型现在会写 `1/2`、`x^2`、`√3`、`sin 2x` 这类纯文本，
 *   在气泡里就是一串符号，和学生课本上的样子差很远。
 *
 * 安全：非公式部分一律 HTML 转义；公式只交给 KaTeX，出错就退回原文。
 */
import katex from 'katex'
import 'katex/dist/katex.min.css'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderOne(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: 'html',
    })
  } catch {
    return escapeHtml(display ? '$$' + tex + '$$' : '$' + tex + '$')
  }
}

/**
 * 把一段文本转成 HTML：公式用 KaTeX，其余转义。
 * 支持 `$$…$$`（独立一行居中）、`$…$`（行内）、`\(…\)`、`\[…\]`。
 */
export function renderMathToHtml(text: string): string {
  let out = ''
  let i = 0

  // PLAIN-MATH：模型常常不照提示词写 LaTeX（实测会写 1/2、√3、x^2）。
  // 这里兜底：纯文本里的这类写法也转成课本排版，不依赖模型自觉。
  const PLAIN_PATTERNS: Array<{ re: RegExp; tex: (m: RegExpExecArray) => string }> = [
    // 1/2、3/4（只处理纯数字，避免把日期、链接里的斜杠吃掉）
    { re: /(?<![\w/])(\d{1,4})\s*\/\s*(\d{1,4})(?![\w/])/g, tex: (m) => '\\frac{' + m[1] + '}{' + m[2] + '}' },
    // √3、√x
    { re: /√\s*(\d{1,3}|[a-zA-Z])(?![\w])/g, tex: (m) => '\\sqrt{' + m[1] + '}' },
    // x^2、a^3
    { re: /(?<![\w\\])([a-zA-Z])\^(\d{1,2})(?![\w])/g, tex: (m) => m[1] + '^{' + m[2] + '}' },
    // 单独的 π
    { re: /(^|[^\w])(π)(?![\w])/g, tex: (m) => m[1] + '\\pi ' },
  ]

  const push = (s: string): void => {
    if (!s) return
    // 找出所有匹配点，逐段输出：文字段转义、匹配段交给 KaTeX
    type Hit = { start: number; end: number; tex: string }
    const hits: Hit[] = []
    for (const rule of PLAIN_PATTERNS) {
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(s)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length, tex: rule.tex(m) })
        if (m[0].length === 0) rule.re.lastIndex += 1
      }
    }
    if (!hits.length) {
      out += escapeHtml(s).replace(/\n/g, '<br>')
      return
    }
    hits.sort((a, b) => a.start - b.start)
    let cursor = 0
    for (const hit of hits) {
      if (hit.start < cursor) continue
      if (hit.start > cursor) out += escapeHtml(s.slice(cursor, hit.start)).replace(/\n/g, '<br>')
      out += renderOne(hit.tex, false)
      cursor = hit.end
    }
    if (cursor < s.length) out += escapeHtml(s.slice(cursor)).replace(/\n/g, '<br>')
  }

  while (i < text.length) {
    // $$ … $$
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2)
      if (end > 0) {
        out += renderOne(text.slice(i + 2, end), true)
        i = end + 2
        continue
      }
    }
    // \[ … \]
    if (text.startsWith('\\[', i)) {
      const end = text.indexOf('\\]', i + 2)
      if (end > 0) {
        out += renderOne(text.slice(i + 2, end), true)
        i = end + 2
        continue
      }
    }
    // \( … \)
    if (text.startsWith('\\(', i)) {
      const end = text.indexOf('\\)', i + 2)
      if (end > 0) {
        out += renderOne(text.slice(i + 2, end), false)
        i = end + 2
        continue
      }
    }
    // $ … $（单美元：不跨行，避免把价格之类吞掉）
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      const newline = text.indexOf('\n', i + 1)
      if (end > 0 && (newline < 0 || end < newline)) {
        out += renderOne(text.slice(i + 1, end), false)
        i = end + 1
        continue
      }
    }
    // 普通字符：攒到下一个特殊点
    let next = i + 1
    while (next < text.length && text[next] !== '$' && !text.startsWith('\\[', next) && !text.startsWith('\\(', next)) {
      next += 1
    }
    push(text.slice(i, next))
    i = next
  }

  return out
}

/** 显示用：把气泡内容设置成"课本式"排版 */
export function setMathContent(el: HTMLElement, text: string): void {
  el.innerHTML = renderMathToHtml(text)
  el.classList.add('katex-host')
}
