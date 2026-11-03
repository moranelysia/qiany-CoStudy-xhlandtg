/**
 * 插件开关（教法开关 + 能力插件）。
 *
 * 为什么单独存一份：这些开关既影响界面（显示在哪、开没开），
 * 也影响主进程拼提示词（教法）和工具可用性（能力插件）。
 * 存 `记忆/plugins.json`，渲染端通过 IPC 读写。
 *
 * 三类东西放在同一个注册表里，是为了让「插件」这一栏统一 ——
 * 教法开关本质上就是"换一种教法的插件"。
 */
import fs from 'node:fs'
import path from 'node:path'

export type PluginKind = 'teaching' | 'capability'

export interface PluginItem {
  id: string
  name: string
  desc: string
  kind: PluginKind
  /** 默认开启的一律 true；MCP 能力插件默认关闭（没装好之前不该亮） */
  enabled: boolean
  /** 权限：读 / 写 / 执行 —— 只给界面看，真正的门在主进程 */
  permission: 'read' | 'write' | 'exec'
  /** 状态说明，例如"未安装" */
  status?: string
  /** 能力插件对应的 MCP 服务文件是否真的在（不看这个开关，看文件在不在） */
  installed?: boolean
}

/** 能力插件 → 它依赖的 MCP 服务脚本 */
const SERVER_FILE: Record<string, string> = {
  'mcp-jsxgraph': 'mcp-jsxgraph-server.mjs',
  'mcp-yuancode': 'mcp-yuancode-server.mjs',
  'mcp-easy-english': 'mcp-easyenglish-server.mjs',
  'mcp-open-lab': 'mcp-lab-server.mjs',
}

/**
 * 「装没装」不再写死：以前四条能力插件全带 `status: '未安装'`，
 * 其中三条（作图/代码/英语）其实早就随应用发出去、`--mcptest` 还在端到端验它们 ——
 * 界面却一直显示未安装、开关还是禁用的。现在按脚本文件在不在来判断。
 */
let scriptsDir = path.join(process.cwd(), 'scripts')

export function setScriptsDir(dir: string): void {
  scriptsDir = dir
}

export function isInstalled(id: string): boolean {
  const file = SERVER_FILE[id]
  if (!file) return true // 不是 MCP 能力插件（教法开关）就算"装了"
  try {
    return fs.existsSync(path.join(scriptsDir, file))
  } catch {
    return false
  }
}

const FILE = 'plugins.json'

const DEFAULTS: PluginItem[] = [
  {
    id: 'socratic',
    name: '苏格拉底式提问',
    desc: '用反问推进，而不是直接给答案',
    kind: 'teaching',
    enabled: true,
    permission: 'read',
  },
  {
    id: 'diagnose-first',
    name: '先诊断再教',
    desc: '开始前先探测真实水平',
    kind: 'teaching',
    enabled: true,
    permission: 'read',
  },
  {
    id: 'review-prompt',
    name: '主动提复习',
    desc: '记得上次没弄懂的地方',
    kind: 'teaching',
    enabled: true,
    permission: 'read',
  },
  {
    id: 'mcp-jsxgraph',
    name: '数学作图',
    desc: '函数 / 几何画图，输出 SVG（MCP 服务）',
    kind: 'capability',
    enabled: true,
    permission: 'read',
  },
  {
    id: 'mcp-yuancode',
    name: '代码执行',
    desc: '跑一段代码看结果（沙箱，需确认）',
    kind: 'capability',
    enabled: true,
    permission: 'exec',
  },
  {
    id: 'mcp-easy-english',
    name: '英语练习',
    desc: '出题 / 改语法 / 朗读句子（会调用本机语音）',
    kind: 'capability',
    enabled: true,
    permission: 'read',
  },
  {
    id: 'mcp-open-lab',
    name: '实验演示',
    desc: '物化生示意图：电路引擎（校验接法）/ 光路 / 化学装置 / 细胞分裂 + 7 种预设 + 自由摆图元',
    kind: 'capability',
    enabled: true,
    permission: 'read',
  },
]

function file(dataDir: string): string {
  return path.join(dataDir, FILE)
}

export function readPlugins(dataDir: string): PluginItem[] {
  const base: PluginItem[] = JSON.parse(JSON.stringify(DEFAULTS)) as PluginItem[]
  let saved: Record<string, boolean> | null = null
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Record<string, boolean> | null
    if (parsed && typeof parsed === 'object') saved = parsed
  } catch {
    /* 没有存档就用默认值 */
  }
  return base.map((p) => {
    const want = saved && typeof saved[p.id] === 'boolean' ? saved[p.id] : p.enabled
    if (p.kind !== 'capability') return { ...p, enabled: want }
    const installed = isInstalled(p.id)
    return {
      ...p,
      installed,
      // 没装的能力插件不允许是"开"的状态
      enabled: installed && want,
      status: installed ? '已就绪' : '未安装',
    }
  })
}

export function setPlugin(dataDir: string, id: string, enabled: boolean): PluginItem[] {
  // 没装的插件不允许被打开：否则界面显示"已开启"，实际调用时又是报错
  if (enabled && !isInstalled(id)) return readPlugins(dataDir)
  const list = readPlugins(dataDir)
  const next = list.map((p) => (p.id === id ? { ...p, enabled } : p))
  const map: Record<string, boolean> = {}
  for (const p of next) map[p.id] = p.enabled
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify(map, null, 2), 'utf8')
  } catch {
    /* 写不进去就用内存值 */
  }
  return next
}

/** 某个能力插件是否可用（开着 + 装了）—— 工具执行前用它做门 */
export function pluginUsable(dataDir: string, id: string): boolean {
  const item = readPlugins(dataDir).find((p) => p.id === id)
  return !!item && item.enabled && item.installed !== false
}

/** 拼提示词用：把开启的教法开关翻译成一句话 */
export function teachingPluginHints(dataDir: string): string {
  const on = readPlugins(dataDir)
    .filter((p) => p.kind === 'teaching' && p.enabled)
    .map((p) => p.name)
  if (!on.length) return ''
  return `【教法开关】本轮启用：${on.join('、')}。请按这些方式组织对话。`
}
