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

/**
 * 行内标记：`**粗体**` 和 `` `行内代码` ``。
 *
 * 为什么补（2026-11-02，用户截图）：气泡正文只做转义 + 换行，`**` 没人管，
 * 于是模型写的 `**同一套逻辑**` 原样显示成星号 —— 用户直接问"什么情况"。
 * 加粗渲染在上一轮 UI 大回滚时被一起撤掉了，这里补回来，只补这两种最安全的：
 * 必须在**同一行内闭合**（`[^*\n]` / `[^`\n]`），跨行、跨公式一律不认，避免误伤正文。
 */
function escapeInline(s: string): string {
  return escapeHtml(s)
    .replace(/\n/g, '<br>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
}

// SPEAK：把 LaTeX 变成中文读法，塞进 aria-label —— 读屏软件不会念 π、sin。
const SPEAK_MAP: Array<[RegExp, string]> = [
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1分之$2'],
  [/\\sqrt\{([^{}]+)\}/g, '根号$1'],
  [/\\pi\b/g, '派'],
  [/\\sin/g, '正弦'],
  [/\\cos/g, '余弦'],
  [/\\tan/g, '正切'],
  [/\\theta/g, '西塔'],
  [/\\alpha/g, '阿尔法'],
  [/\\beta/g, '贝塔'],
  [/\\times/g, '乘以'],
  [/\\cdot/g, '乘以'],
  [/\\pm/g, '正负'],
  [/\\le/g, '小于等于'],
  [/\\ge/g, '大于等于'],
  [/\\ne/g, '不等于'],
  [/\^\{([^{}]+)\}/g, '的$1次方'],
  [/\\/g, ''],
]

function speakable(tex: string): string {
  let out = tex
  for (const [re, to] of SPEAK_MAP) out = out.replace(re, to)
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

function renderOne(tex: string, display: boolean): string {
  try {
    const html = katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    })
    // 读屏用 aria-label，屏幕显示仍是课本排版
    const label = speakable(tex)
    return label
      ? '<span role="math" aria-label="' + escapeHtml(label) + '">' + html + '</span>'
      : html
  } catch {
    return escapeHtml(display ? '$$' + tex + '$$' : '$' + tex + '$')
  }
}

/**
 * 把一段文本转成 HTML：公式用 KaTeX，其余转义。
 * 支持 `$$…$$`（独立一行居中）、`$…$`（行内）、`\(…\)`、`\[…\]`。
 */
/**
 * 围栏代码块 ```lang … ```。
 *
 * 为什么非要单独处理（2026-11-02）：气泡正文以前只做转义 + 换行，
 * 三个反引号既没被当成代码块，又会被「行内代码」规则拆成一个个小碎片，
 * 于是聊天里满屏零散的反引号；更糟的是 HTML 会折叠空白，
 * 模型贴的 ASCII 图（Sierpinski 三角、柱状图）前导空格全没了，图形直接塌掉。
 * 用 <pre> 保住空白，并且**不**对它做公式/行内标记处理 —— 代码里不该有排版魔法。
 */
const FENCE_RE = /```[ \t]*([A-Za-z0-9+#.-]*)[ \t]*\r?\n([\s\S]*?)```/

function renderCodeBlock(lang: string, body: string): string {
  const cls = lang ? ' class="code-block lang-' + escapeHtml(lang) + '"' : ' class="code-block"'
  return '<pre' + cls + '><code>' + escapeHtml(body.replace(/\s+$/, '')) + '</code></pre>'
}

function renderInline(text: string): string {
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
      out += escapeInline(s)
      return
    }
    hits.sort((a, b) => a.start - b.start)
    let cursor = 0
    for (const hit of hits) {
      if (hit.start < cursor) continue
      if (hit.start > cursor) out += escapeInline(s.slice(cursor, hit.start))
      out += renderOne(hit.tex, false)
      cursor = hit.end
    }
    if (cursor < s.length) out += escapeInline(s.slice(cursor))
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

/**
 * 对外入口：先切出围栏代码块（保空白、不过公式），其余段落再走行内排版。
 */
export function renderMathToHtml(text: string): string {
  let out = ''
  let rest = text
  for (;;) {
    const m = FENCE_RE.exec(rest)
    if (!m) {
      out += renderInline(rest)
      break
    }
    out += renderInline(rest.slice(0, m.index))
    out += renderCodeBlock(m[1] ?? '', m[2] ?? '')
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

/** 显示用：把气泡内容设置成"课本式"排版 */
export function setMathContent(el: HTMLElement, text: string): void {
  el.innerHTML = renderMathToHtml(text)
  el.classList.add('katex-host')
}
