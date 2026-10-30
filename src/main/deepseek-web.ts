/**
 * DeepSeek 官方 Search / Fetch API 接入。
 *
 * 文档：https://api-docs.deepseek.com/guides/search/
 *   POST {baseUrl}/v1/tools/search   { query, count, ori_question?, need_content? }
 *        → { results: [{ title, url, snippet, summary, content, site_name, date, authority, rerank_score }] }
 *   POST {baseUrl}/v1/tools/fetch    { url } → { title, content }（Markdown）
 *
 * 和模型接口用同一把 Key、同一个 baseUrl（resolveLlmConfig 解出来的）。
 * 计费按"成功请求次数"算（$0.75 / 千次），与结果条数、token 都无关 ——
 * 所以空结果和报错不计费，重试要克制。
 *
 * 为什么不用本地抓取（web-fetch.ts）：那个只能拿 HTML 再自己剥标签，
 * 遇到 JS 渲染页、反爬页基本抓不到；官方 Fetch 直接返回 Markdown，质量高得多。
 * 本地那套保留做兜底（没配 Key 时仍然能用）。
 */
export interface WebSearchItem {
  title: string
  url: string
  snippet: string
  summary: string
  content: string
  siteName: string | null
  date: string | null
  /** 0–4，3 以上是高权威来源 */
  authority: number
  /** 0–3，1.5 以上算高质量 */
  score: number
}

export type WebSearchResult = { ok: true; results: WebSearchItem[] } | { ok: false; error: string }

export type WebFetchResult =
  | { ok: true; title: string; content: string; url: string }
  | { ok: false; error: string }

export interface WebClientConfig {
  apiKey: string
  baseUrl: string
  timeoutMs: number
}

function api(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

/** 把接口返回的 error 对象翻译成一句人话 */
async function describeFailure(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    detail = body?.error?.message ?? ''
  } catch {
    /* 响应不是 JSON，忽略 */
  }
  const hint: Record<number, string> = {
    400: '请求不合法',
    401: 'API Key 无效',
    402: '账户余额不足',
    403: '被安全策略拒绝',
    404: '抓不到可用内容',
    408: '请求超时',
    413: '请求体过大',
    429: '请求太频繁（QPS 超限）',
    500: '服务端错误',
    504: '下游超时',
  }
  const base = hint[res.status] ?? `HTTP ${res.status}`
  return detail ? `${base}：${detail}` : base
}

async function post(
  cfg: WebClientConfig,
  path: string,
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!cfg.apiKey) {
    return { ok: false, error: '还没配 API Key，先在「API Key」里填一个（联网搜索走同一个 Key）' }
  }
  const controller = new AbortController()
  const timeout = Math.max(8000, cfg.timeoutMs)
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(api(cfg.baseUrl, path), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, error: await describeFailure(res) }
    return { ok: true, data: (await res.json()) as unknown }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message.includes('abort') ? '请求超时了' : '网络错误：' + message }
  } finally {
    clearTimeout(timer)
  }
}

export async function searchWeb(
  cfg: WebClientConfig,
  query: string,
  count = 8,
): Promise<WebSearchResult> {
  const q = query.trim()
  if (!q) return { ok: false, error: '搜索词不能为空' }

  const res = await post(cfg, '/v1/tools/search', {
    query: q.slice(0, 128),
    count: Math.min(50, Math.max(1, Math.trunc(count) || 8)),
    need_content: false,
  })
  if (!res.ok) return res

  const raw = res.data as { results?: unknown }
  const list = Array.isArray(raw?.results) ? (raw.results as Array<Record<string, unknown>>) : []
  const results: WebSearchItem[] = list.map((r) => ({
    title: typeof r.title === 'string' ? r.title : '',
    url: typeof r.url === 'string' ? r.url : '',
    snippet: typeof r.snippet === 'string' ? r.snippet : '',
    summary: typeof r.summary === 'string' ? r.summary : '',
    content: typeof r.content === 'string' ? r.content : '',
    siteName: typeof r.site_name === 'string' ? r.site_name : null,
    date: typeof r.date === 'string' ? r.date : null,
    authority: typeof r.authority === 'number' ? r.authority : -1,
    score: typeof r.rerank_score === 'number' ? r.rerank_score : 0,
  }))
  return { ok: true, results }
}

export async function fetchWebPage(cfg: WebClientConfig, rawUrl: string): Promise<WebFetchResult> {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: '只支持 http / https 链接' }

  const res = await post(cfg, '/v1/tools/fetch', { url: url.slice(0, 8192) })
  if (!res.ok) return res

  const data = res.data as { title?: unknown; content?: unknown }
  const content = typeof data?.content === 'string' ? data.content : ''
  if (!content.trim()) return { ok: false, error: '这个页面没取到正文' }
  return {
    ok: true,
    title: typeof data?.title === 'string' ? data.title : '',
    content,
    url,
  }
}
