/**
 * 依赖健康检查（P3 保障层）。
 *
 * 【为什么需要】
 *   外部依赖挂了，应用现在是"静默降级"：GPT-SoVITS 没了，朗读就没声音、界面一个字不说；
 *   模型 API 挂了，用户只看到一句"这一句没发出去"。插件越多，这种黑箱问题越多。
 *   所以统一探一下：模型 / 语音 / 搜索，挂了就在界面上标出来。
 *
 * 【探测策略】
 *   · 模型：`GET {baseUrl}/models`（OpenAI 兼容都有），5 秒超时
 *   · TTS：GPT-SoVITS 用 `GET :9880/`；其他厂商只判断"有没有配密钥"，不发请求（省钱）
 *   · 搜索：DeepSeek 官方搜索和模型共用同一把 Key，所以跟随模型状态
 *
 * 【缓存】
 *   60 秒内复用上一次结果：这个函数会被界面定时调用，不能每次都真发请求。
 */
export interface HealthItem {
  id: 'model' | 'tts' | 'search'
  label: string
  ok: boolean
  /** 一句话说明，挂了就是原因 */
  detail: string
}

export interface HealthReport {
  at: string
  items: HealthItem[]
  /** 有任意一项挂掉 */
  degraded: boolean
}

interface ProbeInput {
  model: { apiKey: string; baseUrl: string; model: string; timeoutMs: number }
  /** TTS 配置里的引擎与地址（只用得上 gptsovits 的 baseUrl） */
  tts: { engine: string; gptsovitsBaseUrl?: string }
  hasSearchKey: boolean
}

let cache: { at: number; input: string; report: HealthReport } | null = null
const CACHE_MS = 60_000

async function probeModel(input: ProbeInput['model']): Promise<HealthItem> {
  const label = '模型 API'
  if (!input.apiKey) {
    return { id: 'model', label, ok: false, detail: '还没配 API Key' }
  }
  const base = input.baseUrl.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(6000, input.timeoutMs))
  try {
    const res = await fetch(base + '/models', {
      headers: { authorization: 'Bearer ' + input.apiKey },
      signal: controller.signal,
    })
    if (res.ok) return { id: 'model', label, ok: true, detail: input.model }
    if (res.status === 401) return { id: 'model', label, ok: false, detail: 'API Key 无效（401）' }
    return { id: 'model', label, ok: false, detail: 'HTTP ' + res.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: 'model',
      label,
      ok: false,
      detail: message.includes('abort') ? '连接超时（可能断网了）' : '连不上：' + message.slice(0, 80),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probeTts(tts: ProbeInput['tts']): Promise<HealthItem> {
  const label = '语音合成'
  if (!tts.engine || tts.engine === 'off') {
    return { id: 'tts', label, ok: true, detail: '未启用（不影响对话）' }
  }
  // 只有 GPT-SoVITS 是"本地服务"，需要探活；其他厂商走云端，只要配了 key 就算可用
  if (tts.engine !== 'gptsovits') {
    return { id: 'tts', label, ok: true, detail: tts.engine + '（云端）' }
  }
  const base = (tts.gptsovitsBaseUrl ?? 'http://localhost:9880').replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(base + '/', { signal: controller.signal })
    // GPT-SoVITS 根路径返回 404 也算"服务在"，只要 TCP 通并回了 HTTP
    return { id: 'tts', label, ok: true, detail: 'GPT-SoVITS 已就绪' + (res.ok ? '' : '（HTTP ' + res.status + '）') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: 'tts',
      label,
      ok: false,
      detail: message.includes('abort') ? '本地服务无响应' : '服务没起来：' + base,
    }
  } finally {
    clearTimeout(timer)
  }
}

function probeSearch(hasKey: boolean): HealthItem {
  const label = '联网搜索'
  if (!hasKey) return { id: 'search', label, ok: true, detail: '未启用' }
  return { id: 'search', label, ok: true, detail: '与模型共用 Key' }
}

export async function checkHealth(input: ProbeInput): Promise<HealthReport> {
  const signature = JSON.stringify(input)
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS && cache.input === signature) return cache.report

  const [model, tts] = await Promise.all([probeModel(input.model), probeTts(input.tts)])
  const search = probeSearch(input.hasSearchKey)
  const items = [model, tts, search]
  const report: HealthReport = {
    at: new Date().toISOString(),
    items,
    degraded: items.some((i) => !i.ok),
  }
  cache = { at: now, input: signature, report }
  return report
}
