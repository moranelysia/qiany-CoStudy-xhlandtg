/**
 * 工具注册表（P1 最小闭环）。
 *
 * 只放**不需要外部进程**的工具：查时间、算数这类。画图/代码执行会走 MCP（P2），
 * 不在这里，否则 P1 的调试会同时被权限、进程、协议三件事干扰。
 *
 * 权限按"副作用"分三档（见方案 P5），这里的工具都是 read：
 *   read  —— 只读，永远允许
 *   write —— 改工作区，需确认
 *   exec  —— 执行代码，仅 work 模式
 *
 * 图表：工具执行 → SVG 存文件 → 只回 `[chart:xxxx]` 标记（见 charts.ts）。
 * 写盘失败会抛，绝不返回一个打不开的 id。
 */
import type { McpClient } from './mcp-host/client'
import { createAppMcpClient } from './mcp-host/app-client'
import { saveChart, saveChartMeta } from './charts'
import { pluginUsable } from './plugins'
import { beginApprovalSession, endApprovalSession } from './workspace-approval'
import { ensureWorkspace } from './workspace'
import fs from 'node:fs'
import path from 'node:path'

export type ToolPermission = 'read' | 'write' | 'exec'

/** 图存不下来时的统一说法：明确告诉模型**不要**写 chart 标记 */
function chartSaveFailed(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return '图画出来了，但没存下来（' + msg + '）。**不要写 [chart:...] 标记**，直接跟对方说这次图没画成、可以再试一次。'
}

export interface ToolDef {
  name: string
  description: string
  /** OpenAI 兼容的 JSON Schema */
  parameters: Record<string, unknown>
  permission: ToolPermission
  /** 属于哪个能力插件（插件页关掉它，这个工具就不可用） */
  pluginId?: string
  run: (args: Record<string, unknown>) => Promise<string> | string
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 现在几点：模型自己不知道当前时间，这个问题必须有工具兜底 */
const getCurrentTime: ToolDef = {
  name: 'get_current_time',
  description: '获取用户所在设备的当前日期、星期和精确到分钟的本地时间。用户问"现在几点""今天几号"时必须调用它。',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '可选时区名，例如 Asia/Shanghai。不传就用设备本地时区。',
      },
    },
    required: [],
  },
  permission: 'read',
  run: (args) => {
    const now = new Date()
    const tz = typeof args.timezone === 'string' && args.timezone.trim() ? args.timezone.trim() : undefined
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
    const hour = pick('hour')
    const minute = pick('minute')
    const label = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '本地时区'
    return [
      `现在是 ${pick('year')}-${pick('month')}-${pick('day')} 星期${WEEK[now.getDay()]}`,
      `${hour}:${minute}`,
      `（时区 ${label}）`,
    ].join(' ')
  },
}

/**
 * 作图工具（走 MCP 服务）。
 *
 * 值的注意的两点：
 *   1. SVG 存盘，只把 `[chart:id]` 交给模型 —— 否则一次回复就是 20 KB token
 *   2. 客户端是单例、懒启动；服务没起来就报错，由调用方决定降级到本地 chart-ui
 */
let chartClient: McpClient | null = null
let chartDataDir = ''

function ensureChartClient(dataDir: string): McpClient {
  chartDataDir = dataDir
  if (chartClient && chartClient.running) return chartClient
  chartClient = createAppMcpClient('mcp-jsxgraph-server.mjs', { timeoutMs: 20000 })
  return chartClient
}

/** 供主进程初始化时指定 dataDir（工具执行时要用它存图） */
export function setChartDataDir(dataDir: string): void {
  chartDataDir = dataDir
}

/**
 * 本地降级作图：MCP 服务起不来时用它。
 *
 * 刻意做得简单（只画曲线 + 两条轴，不做 π 刻度）——
 * 它的职责是"图还在"，不是"图好看"。好看的那条路走 MCP。
 */
function localPlotSvg(expr: string): string {
  const W = 640
  const H = 400
  const PAD = 36
  const xmin = -7.2
  const xmax = 7.2
  const ymin = -3.2
  const ymax = 3.2
  // eslint-disable-next-line no-new-func
  const fn = new Function('x', 'return ' + expr) as (x: number) => number
  const sx = (x: number): number => PAD + ((x - xmin) / (xmax - xmin)) * (W - PAD * 2)
  const sy = (y: number): number => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - PAD * 2)
  let path = ''
  let started = false
  const steps = 1200
  for (let i = 0; i <= steps; i++) {
    const x = xmin + ((xmax - xmin) * i) / steps
    let y = NaN
    try {
      y = fn(x)
    } catch {
      y = NaN
    }
    if (!Number.isFinite(y) || y < ymin - 5 || y > ymax + 5) {
      started = false
      continue
    }
    path += (started ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1) + ' '
    started = true
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.72)"/>' +
    '<line x1="' + PAD + '" y1="' + sy(0) + '" x2="' + (W - PAD) + '" y2="' + sy(0) + '" stroke="#9aa8b6"/>' +
    '<line x1="' + sx(0) + '" y1="' + PAD + '" x2="' + sx(0) + '" y2="' + (H - PAD) + '" stroke="#9aa8b6"/>' +
    '<path d="' + path.trim() + '" fill="none" stroke="#0a84ff" stroke-width="2.2"/>' +
    '</svg>'
  )
}
const plotFunction: ToolDef = {
  name: 'plot_function',
  pluginId: 'mcp-jsxgraph',
  description:
    '把一条函数曲线画成图片并显示给用户。表达式用 JS 写法、自变量 x，例如 Math.sin(2*x)、x*x-2。画完把返回的 [chart:...] 标记原样写在回复里，图就会出现在聊天里。',
  parameters: {
    type: 'object',
    properties: {
      expr: { type: 'string', description: '函数表达式，例如 Math.sin(2*x)' },
    },
    required: ['expr'],
  },
  permission: 'read',
  run: async (args) => {
    const expr = typeof args.expr === 'string' ? args.expr.trim() : ''
    if (!expr) return '缺少函数表达式'
    // 第一优先：MCP 服务。禁用开关（COSTUDY_MCP_OFF=1）用于演示降级 / 排查协议层
    if (!process.env['COSTUDY_MCP_OFF']) {
      try {
        const client = ensureChartClient(chartDataDir)
        if (!client.running) await client.start()
        const res = await client.callTool('plot_function', { expr })
        if (res.ok && res.text.includes('<svg')) {
          try {
            const id = saveChart(chartDataDir, res.text)
            return '图像已生成，请在回复里原样带上这个标记： [chart:' + id + ']'
          } catch (err) {
            return chartSaveFailed(err)
          }
        }
        console.log('[TOOLS] mcp plot failed: ' + String(res.error ?? 'no svg'))
      } catch (err) {
        console.log('[TOOLS] mcp plot threw: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    // 降级：本地画一张简单的（不依赖子进程）
    try {
      const id = saveChart(chartDataDir, localPlotSvg(expr))
      return '图像已生成（走的是本地降级绘制），请在回复里原样带上这个标记： [chart:' + id + ']'
    } catch (err) {
      return '作图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 几何作图（走同一个 MCP 服务）。
 *
 * 坐标直接用普通直角坐标（A(-2,0) 就是 x:-2,y:0），视野由服务端按图元包围盒自动算 ——
 * 让模型自己算视窗范围容易出错，这一步不该交给它。
 */
const plotGeometry: ToolDef = {
  name: 'plot_geometry',
  pluginId: 'mcp-jsxgraph',
  description:
    '画几何图形：点、线段、直线、圆、多边形（三角形/四边形）、垂线、平行线。objects 里每项用 kind 区分：point{x,y,label} / segment{x1,y1,x2,y2} / line 同上 / circle{cx,cy,r} / polygon{points:[[x,y],…]} / perpendicular{x1,y1,x2,y2,px,py} / parallel 同上。画三角形 = 三个 point + 一个 polygon。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '图下方的一句话说明，可选' },
      objects: {
        type: 'array',
        description: '图元列表，每项 {kind, …}',
        items: { type: 'object' },
      },
    },
    required: ['objects'],
  },
  permission: 'read',
  run: async (args) => {
    const objects = Array.isArray(args.objects) ? args.objects : []
    if (!objects.length) return '缺少 objects（要画哪些图元）'
    if (process.env['COSTUDY_MCP_OFF']) return '几何作图需要 MCP 服务（当前被禁用）'
    try {
      const client = ensureChartClient(chartDataDir)
      if (!client.running) await client.start()
      const res = await client.callTool('plot_geometry', { objects, title: args.title })
      if (!res.ok || !res.text.includes('<svg')) {
        return '几何作图失败：' + (res.error ?? res.text?.slice(0, 80) ?? '服务没返回图')
      }
      const id = saveChart(chartDataDir, res.text)
      return '图像已生成，请在回复里原样带上这个标记： [chart:' + id + ']'
    } catch (err) {
      return '几何作图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 记笔记（第一个 write 工具，用来把"分权限"变成真的）。
 *
 * 只有 work 模式才看得见它：chat 模式下模型连这个工具的存在都不知道，
 * 所以它不会"尝试调用后被拒绝"，而是压根没得调 —— 这比报错体验好。
 */
let noteDataDir = ''

export function setNoteDataDir(dataDir: string): void {
  noteDataDir = dataDir
}

const saveNote: ToolDef = {
  name: 'save_note',
  description:
    '把一段学习笔记写进工作区（记忆/笔记/ 下的 markdown 文件）。用户说"记下来""帮我整理成笔记"时用。标题会成为文件名。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '笔记标题，会作为文件名' },
      content: { type: 'string', description: '笔记正文，markdown 格式' },
    },
    required: ['title', 'content'],
  },
  permission: 'write',
  run: (args) => {
    const title = typeof args.title === 'string' ? args.title.trim() : ''
    const content = typeof args.content === 'string' ? args.content : ''
    if (!title) return '缺少笔记标题'
    if (!content.trim()) return '笔记正文是空的'
    // 文件名安全化：去掉路径分隔符和 Windows 非法字符
    const safe = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    const dir = path.join(noteDataDir, '笔记')
    const file = path.join(dir, safe + '.md')
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, content, 'utf8')
      return '已写入笔记：笔记/' + safe + '.md（' + content.length + ' 字）'
    } catch (err) {
      return '写笔记失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 跑代码（yuancode，走独立 MCP 服务）。
 *
 * 权限 exec —— 只有 work 模式可见。这是"分模式"最有价值的一条：
 * chat 里模型连这个工具的存在都不知道。
 */
let codeClient: McpClient | null = null
let codeClientKey = ''
/** 代码工作区：index.ts 启动时 / 用户改设置时灌进来 */
let codeWorkspace = ''

/** 改工作区：env 只在子进程启动时给一次，所以必须重启 MCP 客户端 */
export function setCodeWorkspace(root: string): void {
  const next = String(root ?? '').trim()
  if (next === codeWorkspace) return
  codeWorkspace = next
  codeClient?.stop()
  codeClient = null
  codeClientKey = ''
}

export function currentCodeWorkspace(): string {
  return codeWorkspace
}

function ensureCodeClient(approval: string): McpClient {
  const key = codeWorkspace + '|' + approval
  if (codeClient && codeClient.running && codeClientKey === key) return codeClient
  codeClient?.stop()
  codeClient = createAppMcpClient('mcp-yuancode-server.mjs', {
    timeoutMs: 20000,
    env: {
      COSTUDY_DATA_DIR: chartDataDir,
      // 工作区 + 审批目录：守卫靠这两个变量决定"哪些写要问人"
      COSTUDY_WORKSPACE: codeWorkspace,
      COSTUDY_APPROVAL_DIR: approval,
    },
  })
  codeClientKey = key
  return codeClient
}

const runCode: ToolDef = {
  name: 'run_code',
  pluginId: 'mcp-yuancode',
  description:
    '运行一段 JavaScript（Node）并返回输出，适合验证算法或算数值。限制：3 秒超时、128MB 内存、不支持 Python。',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: '要运行的 JS 代码，用 console.log 输出结果' },
      timeoutMs: { type: 'number', description: '超时毫秒，默认 3000' },
    },
    required: ['code'],
  },
  permission: 'exec',
  run: async (args) => {
    const code = typeof args.code === 'string' ? args.code : ''
    if (!code.trim()) return '缺少要运行的代码'
    try {
      const workspace = ensureWorkspace(codeWorkspace)
      // 每轮开一次审批会话：清场、开始轮询子进程的写入请求
      const approval = beginApprovalSession(workspace)
      try {
        const client = ensureCodeClient(approval)
        if (!client.running) await client.start()
        // 超时给到 2 分钟：等人在弹窗上点头的时间也算在里面（子进程那边等审批时不计时）
        const res = await client.callTool('run_code', { code, timeoutMs: args.timeoutMs }, { timeoutMs: 120000 })
        return res.ok ? res.text : '运行结束（有错误）：\n' + res.text
      } finally {
        endApprovalSession()
      }
    } catch (err) {
      return '跑代码失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 英语练习（Easy English，走独立 MCP 服务）。
 *
 * 只暴露两个模型容易做错的：判分（大小写/标点/缩写等价）、不规则动词查表。
 * 出题内容还是模型写 —— 本地服务凑语法题只会输出课本腔的烂题。
 */
let englishClient: McpClient | null = null

function ensureEnglishClient(): McpClient {
  if (englishClient && englishClient.running) return englishClient
  englishClient = createAppMcpClient('mcp-easyenglish-server.mjs', { timeoutMs: 15000 })
  return englishClient
}

const checkEnglishAnswer: ToolDef = {
  name: 'check_english_answer',
  pluginId: 'mcp-easy-english',
  description:
    '判英语题对错。大小写、标点、缩写差异（do not 与 dont）都算对，并指出第几个词不一致。学生答完英语题时用它判分，别自己逐字符比。',
  parameters: {
    type: 'object',
    properties: {
      expected: { type: 'string', description: '标准答案' },
      answer: { type: 'string', description: '学生写的答案' },
    },
    required: ['expected', 'answer'],
  },
  permission: 'read',
  run: async (args) => {
    const expected = typeof args.expected === 'string' ? args.expected : ''
    const answer = typeof args.answer === 'string' ? args.answer : ''
    if (!expected || !answer) return '需要标准答案和学生作答两段文本'
    try {
      const client = ensureEnglishClient()
      if (!client.running) await client.start()
      const res = await client.callTool('check_answer', { expected, answer })
      return res.text
    } catch (err) {
      return '判分失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const englishIrregularVerb: ToolDef = {
  name: 'english_irregular_verb',
  pluginId: 'mcp-easy-english',
  description: '查英语不规则动词的三态（原型—过去式—过去分词）。涉及过去式/完成时的时候查它，别凭记忆。',
  parameters: {
    type: 'object',
    properties: { verb: { type: 'string', description: '动词原型，例如 go' } },
    required: ['verb'],
  },
  permission: 'read',
  run: async (args) => {
    const verb = typeof args.verb === 'string' ? args.verb : ''
    if (!verb.trim()) return '需要动词原型'
    try {
      const client = ensureEnglishClient()
      if (!client.running) await client.start()
      const res = await client.callTool('irregular_verb', { verb })
      return res.text
    } catch (err) {
      return '查表失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 实验演示（物理 / 化学 / 生物，走独立 MCP 服务）。
 *
 * 三条路径：
 *   · render_experiment —— 预设实验（单摆/斜面/电路/滴定/感应/光合/谱系），数值按公式算好
 *   · draw_diagram      —— **通用图元自由画**：导轨、光路、受力图、细胞器、谱系、流程图都能摆
 *   · diagram_spec      —— 图元说明书，模型不确定怎么摆图时先读它
 * 图和数都由服务端产出，这里只负责把 SVG 存成图表、把 [chart:id] 交给模型。
 */
let labClient: McpClient | null = null

function ensureLabClient(): McpClient {
  if (labClient && labClient.running) return labClient
  labClient = createAppMcpClient('mcp-lab-server.mjs', { timeoutMs: 20000 })
  return labClient
}

/** 调一次实验服务；失败时把错误整理成一句人话 */
/**
 * 这一轮真正存下来的图。
 * 模型偶尔会把不存在的编号写进回复（[chart:c-xxxxxxxxxxxx]），界面上就是一个空白方块。
 * 回复落地前用它把假编号换成真编号 —— 比"让用户看空白"诚实。
 */
const turnCharts: string[] = []

export function beginTurnCharts(): void {
  turnCharts.length = 0
}

export function turnChartIds(): string[] {
  return turnCharts.slice()
}

/** 把假编号换成这一轮真存下来的图；一个都没有就删掉标记 */
export function fixChartMarkers(text: string, exists: (id: string) => boolean, fallbackIds: string[]): string {
  const fake: string[] = []
  let out = text.replace(/\[chart:(c-[a-f0-9]{12})\]/g, (all, id: string) => {
    if (exists(id)) return all
    fake.push(id)
    const fallback = fallbackIds[fake.length - 1] ?? fallbackIds[0]
    return fallback ? '[chart:' + fallback + ']' : ''
  })
  if (fake.length && !fallbackIds.length) {
    out = out.trimEnd() + '\n\n（刚才那张图没生成成功，要我重画吗？）'
  }
  return out
}

/**
 * 模型有时不调用工具，而是把 `[画图:{...}]` 当正文写出来（这次真发生了：斜面上传送带那张）。
 * 这里把它**救回来**：按花括号配对切出 JSON → 交给 draw_diagram 真画 → 换成 [chart:id]。
 * 切不出完整 JSON（被截断）就整段删掉，绝不让协议文本出现在聊天里。
 */
export async function renderLeakedDiagram(raw: string): Promise<string> {
  let out = String(raw ?? '')
  for (let guard = 0; guard < 3; guard += 1) {
    const start = out.indexOf('[画图:')
    if (start < 0) break
    const sub = out.slice(start + 4)
    let depth = 0
    let end = -1
    let inStr = false
    let esc = false
    for (let i = 0; i < sub.length; i += 1) {
      const c = sub[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{' || c === '[') depth += 1
      else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    if (end < 0) {
      out = out.slice(0, start).trimEnd()
      break
    }
    // 模型写的是 [画图:{...}]，JSON 后面还有一个 ] 要一起吃掉，否则会留个孤零零的方括号
    let tail = end
    while (tail < sub.length && /[\s\]]/.test(sub[tail])) {
      if (sub[tail] === ']') { tail += 1; break }
      tail += 1
    }
    const jsonText = sub.slice(0, end)
    let replacement = ''
    try {
      const spec = JSON.parse(jsonText) as Record<string, unknown>
      // 模型常把 elements 放在最外层，而引擎要求 scene.elements —— 两种都收
      const scene = spec['scene'] as Record<string, unknown> | undefined
      if (scene && !Array.isArray(scene['elements']) && Array.isArray(spec['elements'])) {
        scene['elements'] = spec['elements']
      }
      const res = await callLab('draw_diagram', spec)
      console.log('[diagram-rescue] ok=' + res.ok + ' text=' + String(res.text).slice(0, 200))
      const m = /\[chart:(c-[a-f0-9]{12})\]/.exec(res.text)
      if (res.ok && m) {
        turnCharts.push(m[1])
        replacement = '[chart:' + m[1] + ']'
      } else if (res.ok && res.text.includes('<svg')) {
        // draw_diagram 只回 SVG 原文，不像电路工具那样带标记 —— 这里自己落盘再给标记
        const svgStart = res.text.indexOf('<svg')
        const svgEnd = res.text.lastIndexOf('</svg>')
        if (svgStart >= 0 && svgEnd > svgStart) {
          const id = saveChart(chartDataDir, res.text.slice(svgStart, svgEnd + 6))
          turnCharts.push(id)
          replacement = '[chart:' + id + ']'
        }
      }
    } catch {
      replacement = ''
    }
    out = (out.slice(0, start) + ' ' + replacement + ' ' + out.slice(start + 4 + tail)).replace(/[ \t]{2,}/g, ' ').trim()
  }
  return out
}

async function callLab(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const client = ensureLabClient()
  if (!client.running) await client.start()
  const res = await client.callTool(name, args)
  if (!res.ok) return { ok: false, text: '实验服务报错：' + (res.error ?? '未知原因') }
  return { ok: true, text: res.text }
}

const renderExperiment: ToolDef = {
  name: 'render_experiment',
  pluginId: 'mcp-open-lab',
  description:
    '画一个**预设**的物理/化学/生物图，并给出按公式算好的关键数值。kind 取：pendulum（单摆，L/m、theta0/°）、incline（斜面，theta/°、mu、m/kg）、circuit（串联电路，emf/V、r1、r2/Ω）、titration（酸碱滴定，acid、v0/mL、base mol/L）、induction（导体棒切割磁感线，B/T、L/m、v/(m/s)、R/Ω）、photosynthesis（光合作用，detail: both/light/dark）、pedigree（家族谱系图，pattern: AR/AD/XR/mito 或 members 自定义）。**预设里没有的图，用 draw_diagram 自己摆。**画完把返回的 [chart:...] 标记原样写在回复里。',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: 'pendulum | incline | circuit | titration | induction | photosynthesis | pedigree',
      },
      params: { type: 'object', description: '该实验的参数对象，例如单摆 {L: 1.5, theta0: 25}' },
    },
    required: ['kind'],
  },
  permission: 'read',
  run: async (args) => {
    const kind = typeof args.kind === 'string' ? args.kind.trim() : ''
    if (!kind) return '缺少实验类型（kind）'
    try {
      const res = await callLab('render_experiment', { kind, params: args.params ?? {} })
      if (!res.ok) return res.text
      if (!res.text.includes('<svg')) return '服务没返回图'
      try {
        const id = saveChart(chartDataDir, res.text)
        // 把"实际画了什么"回给模型：它才能发现"我要的是暗反应、画出来的是全图"
        const drawn = [kind]
        const p = (args.params ?? {}) as Record<string, unknown>
        const detail = Object.entries(p)
          .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
          .map(([k, v]) => k + '=' + String(v))
        if (detail.length) drawn.push('（' + detail.join('，') + '）')
        return '实验图已生成：' + drawn.join('') + '。请在回复里原样带上这个标记： [chart:' + id + ']'
      } catch (err) {
        return chartSaveFailed(err)
      }
    } catch (err) {
      return '画实验图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 通用绘图：给模型一套图元，任何示意图都能摆。
 *
 * 这一步是为了把"能画这几种图"变成"能画这种图"——
 * 学生明天问的东西不在预设里时，模型不用举手说"我只会方框、点、线"。
 */
const drawDiagram: ToolDef = {
  name: 'draw_diagram',
  pluginId: 'mcp-open-lab',
  description:
    '用通用图元**自由画**任意示意图（导轨/电路/受力分析/光路/细胞结构/谱系/流程图…）。' +
    'scene = { width, height, title, caption, elements: [...] }；' +
    '图元见 diagram_spec：rect/circle/ellipse/line/arrow/polygon/path/text + field（磁场）/resistor/battery/coil/spring/grana（基粒）/dimension（尺寸标注）。' +
    '按公式算好的数值直接写进 text/label。画完把返回的 [chart:...] 标记原样写在回复里。',
  parameters: {
    type: 'object',
    properties: {
      scene: {
        type: 'object',
        description: '{ width?, height?, title?, caption?, elements: [ { type, ...字段 } ] }',
      },
    },
    required: ['scene'],
  },
  permission: 'read',
  run: async (args) => {
    /* 形状容错：模型有四种写法，全都要能画。
     *   1. { scene: { elements: [...] } }        —— 文档写法
     *   2. { elements: [...] }                   —— 摊在最外层
     *   3. { scene: [ {...}, {...} ] }           —— scene 直接是**数组**
     *      （2026-11-02 真实发生：DSML 里 `parameter name="scene"` 装的就是元素数组，
     *        原来数组也是 object，被原样透传下去，lab 服务报 "scene.elements 不能为空"）
     *   4. 参数本身就是图元数组 */
    const raw = args.scene && typeof args.scene === 'object' ? args.scene : args
    let scene: Record<string, unknown>
    if (Array.isArray(raw)) {
      scene = { elements: raw }
    } else {
      scene = raw as Record<string, unknown>
      if (!Array.isArray(scene['elements']) && Array.isArray(args.elements)) {
        scene['elements'] = args.elements
      }
    }
    try {
      const res = await callLab('draw_diagram', { scene })
      if (!res.ok) return res.text
      if (!res.text.includes('<svg')) return '服务没返回图（检查 elements 里各图元的类型与坐标）'
      try {
        const id = saveChart(chartDataDir, res.text)
        return '图已生成，请在回复里原样带上这个标记： [chart:' + id + ']'
      } catch (err) {
        return chartSaveFailed(err)
      }
    } catch (err) {
      return '画图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/** 图元说明书：模型不确定怎么摆时先读它（不进图表，直接回文本） */
const diagramSpec: ToolDef = {
  name: 'diagram_spec',
  pluginId: 'mcp-open-lab',
  description: '返回 draw_diagram 的图元清单与示例。不确定有哪些图元、字段怎么填时先调它，再调 draw_diagram。',
  parameters: { type: 'object', properties: {}, required: [] },
  permission: 'read',
  run: async () => {
    try {
      const res = await callLab('diagram_spec', {})
      return res.text
    } catch (err) {
      return '取图元说明失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 电路图：**声明式网表 → 规范电路图 + 结构校验**。
 *
 * 与 draw_diagram 的分工：任意示意图走 draw_diagram；**实验电路**走这里 ——
 * 坐标由引擎算，电压表并联/电流表串联/回路闭合会被校验，错了就在图上标红并回报。
 */
const drawCircuit: ToolDef = {
  name: 'draw_circuit',
  pluginId: 'mcp-open-lab',
  description:
    '画规范的实验电路图（伏安法测电阻、测小灯泡电功率、串并联电路…）并做结构校验。' +
    'net = { title, series: [{id,type,label}], parallel: [{across,id,type,label}] }。' +
    'type 只能是 battery/resistor/lamp/switch/ammeter/voltmeter/rheostat；' +
    '电压表必须放在 parallel 里并在被测元件两端，电流表必须在 series 里。' +
    '不懂格式先调 circuit_spec。校验不过时会返回原因，你要照原因改，**不能**把错图说成对的。',
  parameters: {
    type: 'object',
    properties: {
      net: { type: 'object', description: '{ title?, series: [...], parallel?: [...] }' },
      principle: { type: 'string', description: '一句话实验原理（会显示在图卡片的「原理」里）' },
      steps: { type: 'array', items: { type: 'string' }, description: '实验步骤，逐条' },
    },
    required: ['net'],
  },
  permission: 'read',
  run: async (args) => {
    // 模型有时把网表直接摊在最外层（没有 net 包一层）——两种都收，别因此画不出来
    const net =
      args.net && typeof args.net === 'object'
        ? args.net
        : Array.isArray((args as { series?: unknown }).series)
          ? args
          : {}
    try {
      const res = await callLab('draw_circuit', { net })
      if (!res.ok) return res.text
      // 服务端把校验结果作为第二条 content 拼在末尾：<svg>\nVALIDATION:{...}
      const mark = '\nVALIDATION:'
      const at = res.text.indexOf(mark)
      const svg = at >= 0 ? res.text.slice(0, at) : res.text
      let validation: { ok: boolean; issues: string[] } = { ok: true, issues: [] }
      if (at >= 0) {
        try {
          const parsed = JSON.parse(res.text.slice(at + mark.length)) as { ok?: boolean; issues?: string[] }
          validation = { ok: parsed.ok !== false, issues: Array.isArray(parsed.issues) ? parsed.issues : [] }
        } catch {
          /* 解析失败就按"没校验结果"处理，不假装通过 */
          validation = { ok: false, issues: ['校验结果解析失败'] }
        }
      }
      if (!svg.includes('<svg')) return '服务没返回图'
      let id: string
      try {
        id = saveChart(chartDataDir, svg)
    turnCharts.push(id)
      } catch (err) {
        return chartSaveFailed(err)
      }
      // 图与"原理 / 步骤 / 校验结果"存在一起：卡片上要能查这几样
      try {
        saveChartMeta(chartDataDir, id, {
          title: String((net as { title?: string }).title ?? '实验电路图'),
          kind: 'circuit',
          principle: typeof args.principle === 'string' ? args.principle : '',
          steps: Array.isArray(args.steps) ? args.steps.filter((s): s is string => typeof s === 'string').slice(0, 12) : [],
          issues: validation.issues,
          net,
        })
      } catch {
        /* 元数据存不下来不影响出图 */
      }
      const marker = '请在回复里原样带上这个标记： [chart:' + id + ']'
      if (validation.ok) return '电路图已生成并通过结构校验（电压表并联、电流表串联、回路闭合）。' + marker
      // 没通过就**如实说**，并要求模型改 —— 不许把错图当正确答案
      return (
        '电路图已生成，但**结构校验没通过**：' +
        validation.issues.slice(0, 4).join('；') +
        '。图上已经把问题标红了。请按原因改正 net 后**重画一次**，并在回复里告诉对方哪里有问题；' +
        '不要把这张图当成正确答案。' +
        marker
      )
    } catch (err) {
      return '画电路图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/** 光学 / 化学装置 / 细胞分裂：和电路同一套"引擎画 + 校验"套路 */
function labPayload(kind: string, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }
  delete out.principle
  delete out.steps
  out.kind = typeof out.kind === 'string' ? out.kind : kind
  return out
}

/** 把引擎结果落盘 + 附带原理/步骤/校验结果，返回给模型的说明 */
function finishLabChart(res: { ok: boolean; text: string }, args: Record<string, unknown>, metaKind: string): string {
  const mark = '\nVALIDATION:'
  const at = res.text.indexOf(mark)
  const svg = at >= 0 ? res.text.slice(0, at) : res.text
  let validation: { ok: boolean; issues: string[]; summary?: string } = { ok: true, issues: [] }
  if (at >= 0) {
    try {
      const parsed = JSON.parse(res.text.slice(at + mark.length)) as { ok?: boolean; issues?: string[]; summary?: string }
      validation = { ok: parsed.ok !== false, issues: Array.isArray(parsed.issues) ? parsed.issues : [], summary: parsed.summary }
    } catch {
      validation = { ok: false, issues: ['校验结果解析失败'] }
    }
  }
  if (!svg.includes('<svg')) return '服务没返回图'
  let id: string
  try {
    id = saveChart(chartDataDir, svg)
    turnCharts.push(id)
  } catch (err) {
    return chartSaveFailed(err)
  }
  try {
    saveChartMeta(chartDataDir, id, {
      title: String((args as { title?: string }).title ?? validation.summary ?? '示意图'),
      kind: metaKind,
      principle: typeof args.principle === 'string' ? args.principle : '',
      steps: Array.isArray(args.steps) ? args.steps.filter((s): s is string => typeof s === 'string').slice(0, 12) : [],
      issues: validation.issues,
    })
  } catch {
    /* 元数据失败不影响出图 */
  }
  const marker = '请在回复里原样带上这个标记： [chart:' + id + ']'
  if (validation.ok) {
    return '图已生成并通过结构校验' + (validation.summary ? '（' + validation.summary + '）' : '') + '。' + marker
  }
  return (
    '图已生成，但**结构校验没通过**：' +
    validation.issues.slice(0, 4).join('；') +
    '。请改正参数后重画，并把问题告诉对方；不要把这张图当成正确答案。' +
    marker
  )
}

const drawOptics: ToolDef = {
  name: 'draw_optics',
  pluginId: 'mcp-open-lab',
  description:
    '凸透镜成像光路图：给物距 u、焦距 f、物高 h，引擎按 1/v=1/f−1/u 算像距、放大率与像的性质，画出平行主轴光线和过光心光线。' +
    'u=f 时会明确告诉你"不成像"。kind 只有 lens。可带 principle/steps（显示在卡片上）。',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      u: { type: 'number', description: '物距（cm）' },
      f: { type: 'number', description: '焦距（cm）' },
      h: { type: 'number', description: '物高（cm）' },
      title: { type: 'string' },
      principle: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['u', 'f'],
  },
  permission: 'read',
  run: async (args) => {
    try {
      const res = await callLab('draw_optics', labPayload('lens', args))
      return res.ok ? finishLabChart(res, args, 'optics') : res.text
    } catch (err) {
      return '画光路图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const drawApparatus: ToolDef = {
  name: 'draw_apparatus',
  pluginId: 'mcp-open-lab',
  description:
    '化学实验装置图（SVG）。kind：o2-heat（加热固体制氧气 + 排水法）/ o2-h2o2（过氧化氢 + 二氧化锰）。' +
    'parts 可传器材清单（stand/burner/testTube/plug/delivery/trough/jar 等），缺件或多余会被判错。',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      parts: { type: 'array', items: { type: 'string' } },
      title: { type: 'string' },
      principle: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['kind'],
  },
  permission: 'read',
  run: async (args) => {
    try {
      const res = await callLab('draw_apparatus', labPayload('o2-heat', args))
      return res.ok ? finishLabChart(res, args, 'apparatus') : res.text
    } catch (err) {
      return '画装置图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const drawMitosis: ToolDef = {
  name: 'draw_mitosis',
  pluginId: 'mcp-open-lab',
  description:
    '植物细胞有丝分裂过程图：五期为 interphase/prophase/metaphase/anaphase/telophase（不传就按顺序画全）。' +
    '阶段名写错或顺序颠倒会被判错。',
  parameters: {
    type: 'object',
    properties: {
      stages: { type: 'array', items: { type: 'string' } },
      title: { type: 'string' },
      principle: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: [],
  },
  permission: 'read',
  run: async (args) => {
    try {
      const res = await callLab('draw_mitosis', labPayload('mitosis', args))
      return res.ok ? finishLabChart(res, args, 'mitosis') : res.text
    } catch (err) {
      return '画分裂过程图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

/**
 * 图卡片「调参数」：用新参数重画同一张图，返回新图的 id。
 * 只开放参数化引擎（光学/受力/电磁）—— 电路是网表、装置是配方，不适合滑杆。
 */
export async function rerenderLabChart(kind: string, args: Record<string, unknown>): Promise<{ ok: boolean; id?: string; text?: string }> {
  const tool = kind === 'optics' ? 'draw_optics' : kind === 'forces' ? 'draw_forces' : kind === 'em' ? 'draw_em' : ''
  if (!tool) return { ok: false, text: '这张图不支持调参数' }
  const out = await callLab(tool, args)
  if (!out.ok) return { ok: false, text: out.text }
  const mark = '\nVALIDATION:'
  const at = out.text.indexOf(mark)
  const svg = at >= 0 ? out.text.slice(0, at) : out.text
  if (!svg.includes('<svg')) return { ok: false, text: '服务没返回图' }
  let issues: string[] = []
  if (at >= 0) {
    try {
      const v = JSON.parse(out.text.slice(at + mark.length)) as { issues?: string[] }
      issues = Array.isArray(v.issues) ? v.issues : []
    } catch {
      issues = []
    }
  }
  const id = saveChart(chartDataDir, svg)
  turnCharts.push(id)
  try {
    saveChartMeta(chartDataDir, id, { title: String((args as { title?: string }).title ?? '示意图'), kind, issues, args })
  } catch {
    /* 元数据失败不影响图 */
  }
  return { ok: true, id }
}

const drawForces: ToolDef = {
  name: 'draw_forces',
  pluginId: 'mcp-open-lab',
  description:
    '斜面上的受力分析图：给质量 m、倾角 theta、摩擦系数 mu（可选沿斜面拉力 F），' +
    '引擎算 G=mg、N=mgcosθ、f≤μN 并判断"静止还是滑动"、求加速度，画四个力的箭头。',
  parameters: {
    type: 'object',
    properties: {
      m: { type: 'number' },
      theta: { type: 'number' },
      mu: { type: 'number' },
      F: { type: 'number' },
      title: { type: 'string' },
      principle: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['m', 'theta', 'mu'],
  },
  permission: 'read',
  run: async (args) => {
    try {
      const res = await callLab('draw_forces', labPayload('forces', args))
      return res.ok ? finishLabChart(res, args, 'forces') : res.text
    } catch (err) {
      return '画受力图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const drawEM: ToolDef = {
  name: 'draw_em',
  pluginId: 'mcp-open-lab',
  description:
    '电磁学模型图。kind=charge-circular：带电粒子垂直进匀强磁场，算 r=mv/(qB)、T=2πm/(qB)；' +
    'kind=double-slit：双缝干涉，算相邻亮纹间距 Δy=Lλ/d。',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      m: { type: 'number' },
      q: { type: 'number' },
      v: { type: 'number' },
      B: { type: 'number' },
      lambda: { type: 'number' },
      d: { type: 'number' },
      L: { type: 'number' },
      title: { type: 'string' },
      principle: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: [],
  },
  permission: 'read',
  run: async (args) => {
    try {
      const res = await callLab('draw_em', labPayload('charge-circular', args))
      return res.ok ? finishLabChart(res, args, 'em') : res.text
    } catch (err) {
      return '画电磁图失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const experimentCatalogTool: ToolDef = {
  name: 'experiment_catalog',
  pluginId: 'mcp-open-lab',
  description: '列出当前真的能画的所有实验与图像（数学/物理/化学/生物），每行带工具与参数。不确定用什么工具时先读它，别猜。',
  parameters: { type: 'object', properties: {}, required: [] },
  permission: 'read',
  run: async () => {
    try {
      const res = await callLab('experiment_catalog', {})
      return res.text
    } catch (err) {
      return '取实验清单失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const scienceSpecTool: ToolDef = {
  name: 'science_spec',
  pluginId: 'mcp-open-lab',
  description: '返回光学 / 化学装置 / 细胞分裂三个引擎的参数与校验规则。不确定怎么传参数时先调它。',
  parameters: { type: 'object', properties: {}, required: [] },
  permission: 'read',
  run: async () => {
    try {
      const res = await callLab('science_spec', {})
      return res.text
    } catch (err) {
      return '取说明失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

const circuitSpecTool: ToolDef = {
  name: 'circuit_spec',
  pluginId: 'mcp-open-lab',
  description: '返回 draw_circuit 的网表格式与硬规则（电压表并联、电流表串联…）。不确定怎么写时先调它。',
  parameters: { type: 'object', properties: {}, required: [] },
  permission: 'read',
  run: async () => {
    try {
      const res = await callLab('circuit_spec', {})
      return res.text
    } catch (err) {
      return '取电路说明失败：' + (err instanceof Error ? err.message : String(err))
    }
  },
}

export const TOOLS: ToolDef[] = [
  getCurrentTime,
  plotFunction,
  plotGeometry,
  renderExperiment,
  drawDiagram,
  diagramSpec,
  drawCircuit,
  circuitSpecTool,
  drawOptics,
  drawApparatus,
  drawMitosis,
  drawForces,
  drawEM,
  scienceSpecTool,
  experimentCatalogTool,
  saveNote,
  runCode,
  checkEnglishAnswer,
  englishIrregularVerb,
]

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

/** 转成 OpenAI 兼容的 tools 数组 */
/** 所有工具名（给"文本式调用"解析用：只有认识的名字才当调用，避免误伤正文） */
export function toolNames(): string[] {
  return TOOLS.map((t) => t.name)
}

export function toolSchemas(allow: ToolPermission[] = ['read']): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return TOOLS.filter((t) => allow.includes(t.permission))
    // 插件关掉的能力工具不要发给模型：让它看得见却调不动，只会多绕几轮
    .filter((t) => !t.pluginId || !chartDataDir || pluginUsable(chartDataDir, t.pluginId))
    .map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
}

/**
 * 执行一个工具调用；返回给模型看的字符串结果。
 *
 * 【2026-11-02 修】`allow` 必须由调用方按当前模式传进来。
 * 这里原来写的是 `if (tool.permission !== 'read') return 拒绝` ——
 * 不看模式、也没有模式可看，结果 write/exec 一律被拒：
 * 模型在「工作模式」下看得见 run_code（schema 层是按模式过滤的），
 * 调下来却永远拿到「这个工具需要更高权限」—— 权限是假的。
 * 现在 schema 层和执行层用同一份 `allow`，两处口径不会再分叉。
 */
export async function runTool(
  name: string,
  rawArgs: string,
  allow: ToolPermission[] = ['read'],
): Promise<{ ok: boolean; content: string }> {
  const tool = findTool(name)
  if (!tool) return { ok: false, content: '没有这个工具：' + name }
  if (!allow.includes(tool.permission)) {
    return {
      ok: false,
      content:
        '当前是聊天模式（只读），' +
        (tool.permission === 'write' ? '写笔记' : tool.permission === 'exec' ? '跑代码' : '这个工具') +
        '需要先切到工作模式',
    }
  }
  // 能力插件的开关是真的：插件页关掉它，这里就拒绝执行
  if (tool.pluginId && chartDataDir && !pluginUsable(chartDataDir, tool.pluginId)) {
    return { ok: false, content: '这个能力插件被关掉了（在插件页可以重新打开）' }
  }
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return { ok: false, content: '参数不是合法 JSON' }
  }
  try {
    const content = await tool.run(args)
    return { ok: true, content: String(content) }
  } catch (err) {
    return { ok: false, content: '工具执行失败：' + (err instanceof Error ? err.message : String(err)) }
  }
}
