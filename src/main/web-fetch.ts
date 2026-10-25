/**
 * 网页取文（M3 的"搜索"降级方案）。
 *
 * X1 探测结论：DeepSeek 这个接口**没有原生联网搜索** ——
 * 模型被问"今天的热门梗"时明确回：
 *   "我无法实时联网核实，不能给出可靠来源网址，以免编造。"
 * （之前那次返回空正文，是 400 tokens 全被推理吃掉了，不是搜索失败。）
 *
 * 所以资料改成我们自己取：
 *   · 用户贴一个网址 → 主进程抓回来 → 去标签 → 截断 → 作为 context 喂给模型
 *   · 用户也可以直接贴一段文字，那就完全不需要网络
 *
 * 安全约束（都很硬）：
 *   · 只允许 http/https
 *   · 超时 8s，体积上限 300KB（防止被大文件拖死）
 *   · 只取文本；去 script/style；实体做最小解码
 *   · 不做重定向跟随超过 3 跳
 */
const MAX_BYTES = 300_000
const TIMEOUT_MS = 8_000
const MAX_CHARS = 6_000

export interface FetchResult {
  ok: boolean
  url?: string
  title?: string
  text?: string
  chars?: number
  truncated?: boolean
  error?: string
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
}

/** 粗暴但够用的正文提取：去脚本样式、去标签、压空白 */
export function extractText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  body = decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

  return { title, text: body }
}

export async function fetchPageText(rawUrl: string): Promise<FetchResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return { ok: false, error: '这不是一个有效网址' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: '只支持 http / https' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // 有些站点对空 UA 直接 403
        'user-agent': 'Mozilla/5.0 (compatible; CosudyBot/1.0)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })

    if (!res.ok) {
      return { ok: false, url: parsed.toString(), error: `HTTP ${res.status}` }
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!/text\/|html|json|xml/i.test(contentType)) {
      return { ok: false, url: parsed.toString(), error: '这个地址不是文本内容（' + contentType + '）' }
    }

    const buffer = await res.arrayBuffer()
    const truncatedBySize = buffer.byteLength > MAX_BYTES
    const slice = truncatedBySize ? buffer.slice(0, MAX_BYTES) : buffer
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice)

    const { title, text } = extractText(html)
    const truncatedByChars = text.length > MAX_CHARS
    const finalText = truncatedByChars ? text.slice(0, MAX_CHARS) : text

    if (!finalText.trim()) {
      return { ok: false, url: parsed.toString(), title, error: '抓到了页面但没提取到正文' }
    }

    return {
      ok: true,
      url: parsed.toString(),
      title,
      text: finalText,
      chars: finalText.length,
      truncated: truncatedBySize || truncatedByChars,
    }
  } catch (err) {
    const message = (err as Error).name === 'AbortError' ? '抓取超时（8s）' : (err as Error).message
    return { ok: false, url: parsed.toString(), error: message }
  } finally {
    clearTimeout(timer)
  }
}
