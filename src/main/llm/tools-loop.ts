/**
 * 带工具调用的对话（P1）。
 *
 * 【为什么不改现有的 complete()】
 *   现在有 4 个调用方（learn:reply / cards:generate / polish / judgeAnswer）都只想要纯文本。
 *   改它的签名等于一次动四条链路的风险。所以这里另开一个函数，
 *   内部自己发请求、自己跑工具循环，只在需要工具的链路上用。
 *
 * 【循环怎么走】
 *   1. 带上 tools 发一轮
 *   2. 模型回 tool_calls → 逐个执行 → 把结果作为 role:'tool' 追加 → 再发一轮
 *   3. 模型回正文 → 结束
 *   最多 3 轮，防止模型反复调同一个工具把额度烧掉。
 *
 * 【失败怎么办】
 *   任何一步出错（这家模型不支持 tools / 参数格式不对 / 网络挂）都把 error 返回给调用方，
 *   由调用方决定退回普通 complete()。这里不吞异常、也不假装成功。
 */
import type { ChatMessage } from './client'
import { runTool, toolNames, toolSchemas, type ToolPermission } from '../tools'

export interface ToolsConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

export interface ToolsResult {
  ok: boolean
  reply: string
  /** 这一轮实际调用了哪些工具（给界面显示"正在查时间…"用） */
  used: Array<{ name: string; args: string; result: string }>
  error?: string
}

interface RawToolCall {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

interface RawChoice {
  message?: {
    content?: string | null
    reasoning_content?: string
    tool_calls?: RawToolCall[]
  }
  finish_reason?: string
}

interface StreamChoice {
  delta?: {
    content?: string | null
    tool_calls?: Array<RawToolCall & { index?: number }>
  }
  finish_reason?: string
}

async function readToolStream(response: Response, onText: (text: string) => void): Promise<{ choices: RawChoice[] }> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('模型没有返回流式正文')
  const decoder = new TextDecoder()
  const calls = new Map<number, RawToolCall>()
  let content = ''
  let buffer = ''
  let finished = false
  let lastUpdate = 0
  let preview = ''

  const readLine = (line: string): void => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data) return
    if (data === '[DONE]') { finished = true; return }

    const chunk = JSON.parse(data) as { choices?: StreamChoice[]; error?: unknown }
    if (chunk.error) throw new Error('模型流式请求失败')
    const choice = chunk.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) finished = true
    for (const part of choice.delta?.tool_calls ?? []) {
      const index = part.index ?? 0
      const call = calls.get(index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } }
      if (part.id) call.id = part.id
      if (part.type) call.type = part.type
      if (part.function && call.function) {
        call.function.name += part.function.name ?? ''
        call.function.arguments += part.function.arguments ?? ''
      }
      calls.set(index, call)
    }
    if (typeof choice.delta?.content !== 'string') return
    content += choice.delta.content
    if (calls.size || Date.now() - lastUpdate < 65) return
    // 控制标记、工具文本和代码由最终正文统一解析。
    // 流式预览只展示首个协议或代码起始符之前的普通正文。
    const cut = content.search(/[\[<｛{\x60【〔]/u)
    const next = content.slice(0, Math.min(cut < 0 ? content.length : cut, 8000)).trim()
    if (next && next !== preview) {
      lastUpdate = Date.now()
      preview = next
      onText(next)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) readLine(line)
      if (done) {
        readLine(buffer)
        break
      }
      if (finished) break
    }
    if (!finished) throw new Error('模型流式连接提前结束')
    const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call)
    return { choices: [{ message: { content, tool_calls: toolCalls } }] }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

const MAX_ROUNDS = 3

/**
 * 模型把工具调用**写成正文文本**的情况。
 *
 * 起因（真实发生）：有的模型/中转不支持结构化 tool_calls，
 * 会照着它训练里见过的格式吐 `<tool_call>draw_diagram</tool_call>`，
 * 结果这段协议文本原样出现在聊天里 —— 图没画，用户还看到一串尖括号。
 * 所以这里两条兜底：
 *   1. 正文里的 `<tool_call>…</tool_call>` 解析出来**替它执行**
 *   2. 无论走哪条路，返回给用户的正文都把这些块**剥干净**
 */
const TEXT_CALL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/gi

/**
 * 第三种漏出来的写法：DeepSeek 的 **DSML 协议块**。
 *
 * 真实样本（2026-11-02，会话 s-mvnt9k7v-k8b.jsonl，用户截图看到的就是这一段）：
 *
 *   <｜｜DSML｜｜ calls>
 *   <｜｜DSML｜｜ invoke name="draw_diagram">
 *   <｜｜DSML｜｜ parameter name="scene" string="false">[{…}]</｜｜DSML｜｜ parameter>
 *   </｜｜DSML｜｜ invoke>
 *   </｜｜DSML｜｜ calls>
 *
 * 分隔符是**全角竖线 ｜（U+FF5C）**，不是半角 |，所以界面上看着像 `<||DSML||>`。
 * 中转/模型把本该校构化返回的 tool_calls 写进了正文，于是用户拿到一整段协议：
 * 图没画出来，聊天里还多了一堆尖括号 —— 用户的原话是"还是不行"。
 */
const MARK = '[|｜]{2}DSML[|｜]{2}'

const DSML_CALLS_RE = new RegExp('<(' + MARK + ')\\s*calls\\s*>([\\s\\S]*?)<\\/' + MARK + '\\s*calls\\s*>', 'gi')
const DSML_OPEN_ONLY_RE = new RegExp('<' + MARK + '\\s*calls\\s*>[\\s\\S]*$', 'i')
const DSML_LEFTOVER_RE = new RegExp('<\\/?' + MARK, 'gi')

/** 把一个 `<｜｜DSML｜｜ calls>` 的**内部**解析成工具调用 */
function parseDsmlCalls(body: string): Array<{ name: string; args: string }> {
  const out: Array<{ name: string; args: string }> = []
  const invokeRe = new RegExp(
    '<' + MARK + '\\s*invoke\\s+name="([^"]*)"\\s*>([\\s\\S]*?)<\\/' + MARK + '\\s*invoke\\s*>',
    'gi',
  )
  const paramRe = new RegExp(
    '<' + MARK + '\\s*parameter\\s+name="([^"]*)"(?:\\s+string="(true|false)")?\\s*>([\\s\\S]*?)<\\/' + MARK + '\\s*parameter\\s*>',
    'gi',
  )
  let m: RegExpExecArray | null
  while ((m = invokeRe.exec(body)) !== null) {
    const name = (m[1] ?? '').trim()
    const inner = m[2] ?? ''
    const args: Record<string, unknown> = {}
    paramRe.lastIndex = 0
    let p: RegExpExecArray | null
    while ((p = paramRe.exec(inner)) !== null) {
      const key = (p[1] ?? '').trim()
      if (!key) continue
      const raw = (p[3] ?? '').trim()
      if (p[2] === 'true') {
        args[key] = raw
        continue
      }
      // string="false" 时正文是 JSON；解析不了就当字符串（宁可传错也别整条丢掉）
      try {
        args[key] = JSON.parse(raw)
      } catch {
        args[key] = raw
      }
    }
    if (name) out.push({ name, args: JSON.stringify(args) })
  }
  return out
}

/**
 * 第二种漏出来的写法：**裸的工具名加方括号**（`[diagram_spec]`、`【draw_diagram】`）。
 *
 * 只在"这一行只有这个名字"时才算调用 —— 正文里写 `[注意]`、`[1]` 这些绝不能当调用。
 * 名字还要在已知工具表里（`knownNames`），否则 `[备注]` 也会被吃掉。
 */
function bracketCallRe(knownNames: string[]): RegExp {
  const names = knownNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // 整行只有一个 [name] / 【name】
  return new RegExp('^[ \\t]*(?:\\[|【)[ \\t]*(' + names + ')[ \\t]*(?:\\]|】)[ \\t]*$', 'gm')
}

/** 从一段正文里剥掉工具调用块（用户永远不该看到） */
export function stripTextCalls(text: string, knownNames: string[] = []): string {
  // 模型还会写「[工具调用]」这种**占位符**（真的出现过：整段回复只剩这四个字和一张空白）
  const placeholder = /^[ \t]*(?:\[|【)[ \t]*(?:工具调用|调用工具|tool[ _]?call|tool)[ \t]*(?:\]|】)[ \t]*$/gim
  let out = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
  // DSML：完整的块先删，再删被截断的（开标签之后全删），最后扫掉零散标记
  out = out.replace(DSML_CALLS_RE, '')
  out = out.replace(DSML_OPEN_ONLY_RE, '')
  out = out.replace(DSML_LEFTOVER_RE, '')
  out = out.replace(placeholder, '')
  if (knownNames.length) out = out.replace(bracketCallRe(knownNames), '')
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** 解析正文里的工具调用块；支持「只有名字」「JSON 对象」「名字+括号参数」三种写法 */
export function parseTextCalls(text: string, knownNames: string[] = []): Array<{ name: string; args: string }> {
  const out: Array<{ name: string; args: string }> = []

  // DSML 块：模型把结构化 tool_calls 写成了正文（2026-11-02 真实发生）
  DSML_CALLS_RE.lastIndex = 0
  let dm: RegExpExecArray | null
  while ((dm = DSML_CALLS_RE.exec(text)) !== null) {
    for (const call of parseDsmlCalls(dm[2] ?? '')) out.push(call)
  }

  // 先看 [name] 这种（模型在学"函数调用"的另一种写法）
  if (knownNames.length) {
    const re = bracketCallRe(knownNames)
    let bm: RegExpExecArray | null
    while ((bm = re.exec(text)) !== null) {
      out.push({ name: bm[1] ?? '', args: '{}' })
    }
  }

  TEXT_CALL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TEXT_CALL_RE.exec(text)) !== null) {
    const body = (match[1] ?? '').trim()
    if (!body) continue
    // 1) 干净的工具名
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(body)) {
      out.push({ name: body, args: '{}' })
      continue
    }
    // 2) JSON：{"name":"…","arguments":{…}}（或 tool / args / params 等别名）
    if (body.startsWith('{')) {
      try {
        const obj = JSON.parse(body) as Record<string, unknown>
        const name = String(obj.name ?? obj.tool ?? '')
        const args = obj.arguments ?? obj.params ?? obj.args ?? {}
        if (name) {
          out.push({ name, args: typeof args === 'string' ? args : JSON.stringify(args) })
          continue
        }
      } catch {
        /* 落到第 3 种 */
      }
    }
    // 3) name({…}) / name {…} / name\n{…}
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|\n|\s)?\s*([\s\S]*?)\)?\s*$/.exec(body)
    if (m && m[1]) {
      const rest = (m[2] ?? '').trim()
      out.push({ name: m[1], args: rest && rest.startsWith('{') ? rest : '{}' })
    }
  }
  return out
}

/** 这些工具"产出图"，调用完回复里必须带 [chart:…]，否则界面上是"画了一张空图" */
const CHART_TOOLS = new Set([
  'plot_function', 'plot_geometry', 'render_experiment', 'draw_diagram',
  'draw_circuit', 'draw_optics', 'draw_apparatus', 'draw_mitosis', 'draw_forces', 'draw_em',
])

/**
 * 保险：模型调了画图工具、却忘了把 `[chart:…]` 写进回复。
 *
 * 用户看到的会是「我先摆出来」+ 一片空白（真实反馈："画空"）。
 * 这里把工具真的产出的 id 补在回复末尾 —— 图本来是它要画的，补上是修复，不是编造。
 */
export function ensureChartMarkers(
  reply: string,
  used: Array<{ name: string; args: string; result: string }>,
): string {
  if (/\[chart:c-[a-f0-9]{12}\]/.test(reply)) return reply
  const ids: string[] = []
  for (const item of used) {
    if (!CHART_TOOLS.has(item.name)) continue
    const m = /\[chart:(c-[a-f0-9]{12})\]/.exec(item.result)
    if (m && !ids.includes(m[1])) ids.push(m[1])
  }
  if (!ids.length) return reply
  return (reply.trim() + '\n\n' + ids.map((id) => '[chart:' + id + ']').join('\n\n')).trim()
}

export async function completeWithTools(
  cfg: ToolsConfig,
  messages: ChatMessage[],
  options: {
    maxTokens?: number
    temperature?: number
    allow?: ToolPermission[]
    onRound?: () => void
    onTool?: (name: string) => void
    onText?: (text: string) => void
  } = {},
): Promise<ToolsResult> {
  const used: Array<{ name: string; args: string; result: string }> = []
  if (!cfg.apiKey.trim()) return { ok: false, reply: '', used, error: '未配置 API Key' }
  const convo: Array<Record<string, unknown>> = messages.map((m) => ({ role: m.role, content: m.content }))
  // schema 层和执行层必须用同一份权限：否则模型看得见却调不动（2026-11-02 修）
  const allow = options.allow ?? ['read']
  const tools = toolSchemas(allow)
  if (!tools.length) {
    return { ok: false, reply: '', used, error: '没有可用工具' }
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    options.onRound?.()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(5000, cfg.timeoutMs))
    let data: { choices?: RawChoice[] }
    try {
      const requestRound = (stream: boolean) => fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          messages: convo,
          tools,
          tool_choice: 'auto',
          temperature: options.temperature ?? 0.6,
          max_tokens: options.maxTokens ?? 1200,
          ...(stream ? { stream: true } : {}),
        }),
        signal: controller.signal,
      })
      let res = await requestRound(Boolean(options.onText))
      if (options.onText && [400, 415, 422, 501].includes(res.status)) {
        await res.body?.cancel().catch(() => undefined)
        res = await requestRound(false)
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, reply: '', used, error: `模型返回 ${res.status}：${body.slice(0, 160)}` }
      }
      data = options.onText && res.headers.get('content-type')?.includes('text/event-stream')
        ? await readToolStream(res, options.onText)
        : (await res.json()) as { choices?: RawChoice[] }
    } catch (err) {
      return {
        ok: false,
        reply: '',
        used,
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      clearTimeout(timer)
    }

    const message = data.choices?.[0]?.message
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : []

    // 没有结构化工具调用
    if (!calls.length) {
      const content = typeof message?.content === 'string' ? message.content.trim() : ''

      // 但正文里可能有 `<tool_call>…</tool_call>` —— 有的模型只会这么调工具。
      // 替它执行完继续下一轮，别把这段协议文本丢给用户看。
      const textCalls = parseTextCalls(content, toolNames())
      if (textCalls.length) {
        convo.push({ role: 'assistant', content })
        for (const call of textCalls) {
          options.onTool?.(call.name)
          const result = await runTool(call.name, call.args, allow)
          used.push({ name: call.name, args: call.args, result: result.content })
          // 用 user 而不是 tool：这条链路本来就没有 tool_call_id，塞 role:'tool' 会被服务端拒
          convo.push({ role: 'user', content: '[工具结果] ' + call.name + '\n' + result.content })
        }
        continue
      }

      const cleaned = ensureChartMarkers(stripTextCalls(content, toolNames()), used)
      if (!cleaned) {
        return { ok: false, reply: '', used, error: '模型既没调工具也没给正文' }
      }
      return { ok: true, reply: cleaned, used }
    }

    // 有工具调用：先把这个 assistant 消息（含 tool_calls）原样放回对话
    convo.push({
      role: 'assistant',
      content: message?.content ?? '',
      tool_calls: calls,
    })

    for (const call of calls) {
      const name = call.function?.name ?? ''
      const args = call.function?.arguments ?? '{}'
      options.onTool?.(name)
      const result = await runTool(name, args, allow)
      used.push({ name, args, result: result.content })
      convo.push({
        role: 'tool',
        tool_call_id: call.id ?? name,
        content: result.content,
      })
    }
  }

  return { ok: false, reply: '', used, error: '工具调用超过 3 轮还没收敛' }
}
