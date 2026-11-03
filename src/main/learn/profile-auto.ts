/**
 * 自动画像分析（记忆第一层的自动化）。
 *
 * 【现在的画像怎么来的】
 *   全靠用户在「自己调参数」里手填。问题是：用户懒得填，画像就空着，
 *   "它在了解你"这件事就无从体现。
 *
 * 【这里做什么】
 *   攒够若干轮对话后，把最近的对话交给模型，让它产出一段**结构化画像补丁**，
 *   再和手填的画像合并：
 *     · 手填的字段优先级更高（用户说的算）
 *     · 模型只能补空缺、追加标签，不能删用户写的东西
 *     · 每次合并前存一份快照，能一键撤销
 *
 * 【为什么要有撤销】
 *   自动推断必然会有错的时候（"他可能喜欢几何"其实只是随口一提）。
 *   不能撤的自动推断，用户会直接关掉这个功能 —— 那还不如不做。
 *
 * 【什么时候触发】
 *   不在每条消息后都调模型（太贵）。攒到 8 条以上、且距上次分析超过 10 分钟才做一次。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface ProfilePatch {
  level?: string
  strengths?: string[]
  weaknesses?: string[]
  targetPoints?: string[]
  notes?: string
}
export interface ProfileSnapshot {
  at: string
  before: unknown
  patch: ProfilePatch
  /** 依据原文：这一版画像是从哪段对话推出来的（学 elysia 的「依据原文」，以后能核对） */
  evidence?: string
}
export interface ProfileSnapshot {
  at: string
  before: unknown
  patch: ProfilePatch
}

const PROFILE = '学情.json'
const HISTORY = '画像历史.jsonl'
const STATE = '自动画像.json'

export function analysisStateFile(dataDir: string): string {
  return path.join(dataDir, STATE)
}

interface AgentState {
  enabled: boolean
  lastAt: string
  /** 上次分析时的会话消息数（用来判断"又攒够了没有"） */
  lastCount: number
}

export function readAgentState(dataDir: string): AgentState {
  try {
    const raw = fs.readFileSync(analysisStateFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<AgentState> | null
    return {
      enabled: parsed?.enabled !== false,
      lastAt: typeof parsed?.lastAt === 'string' ? parsed.lastAt : '',
      lastCount: typeof parsed?.lastCount === 'number' ? parsed.lastCount : 0,
    }
  } catch {
    return { enabled: true, lastAt: '', lastCount: 0 }
  }
}

export function writeAgentState(dataDir: string, state: AgentState): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(analysisStateFile(dataDir), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    /* 写不进去只影响节流 */
  }
}

function profileFile(dataDir: string): string {
  return path.join(dataDir, PROFILE)
}

function readProfile(dataDir: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(profileFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 从模型返回里把 JSON 抠出来（它常在前后加解释文字或 ```json 围栏） */
export function parseAnalysis(text: string): ProfilePatch | null {
  const raw = String(text ?? '')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    const pickStrings = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 8) : undefined
    const patch: ProfilePatch = {}
    if (typeof obj.level === 'string' && obj.level.trim()) patch.level = obj.level.trim().slice(0, 40)
    const strengths = pickStrings(obj.strengths)
    if (strengths?.length) patch.strengths = strengths
    const weaknesses = pickStrings(obj.weaknesses)
    if (weaknesses?.length) patch.weaknesses = weaknesses
    const targetPoints = pickStrings(obj.targetPoints)
    if (targetPoints?.length) patch.targetPoints = targetPoints
    if (typeof obj.notes === 'string' && obj.notes.trim()) patch.notes = obj.notes.trim().slice(0, 300)
    return Object.keys(patch).length ? patch : null
  } catch {
    return null
  }
}

/**
 * 合并：手填优先。
 *   · 标量（level / notes）：只填空缺，不覆盖
 *   · 数组（标签）：取并集，保留用户已有顺序
 */
export function mergeProfile(
  dataDir: string,
  patch: ProfilePatch,
  now = new Date().toISOString(),
): { changed: boolean; profile: Record<string, unknown> } {
  const before = readProfile(dataDir)
  const next: Record<string, unknown> = { ...before }

  const fillScalar = (key: 'level' | 'notes'): void => {
    const incoming = patch[key]
    if (!incoming) return
    const current = typeof next[key] === 'string' ? (next[key] as string).trim() : ''
    if (!current) next[key] = incoming
  }
  fillScalar('level')
  fillScalar('notes')

  const unionArray = (key: 'strengths' | 'weaknesses' | 'targetPoints'): void => {
    const incoming = patch[key]
    if (!incoming?.length) return
    const current = Array.isArray(next[key]) ? (next[key] as unknown[]).filter((x): x is string => typeof x === 'string') : []
    const merged = [...current]
    for (const item of incoming) {
      if (!merged.some((m) => m.trim() === item.trim())) merged.push(item)
    }
    if (merged.length !== current.length) next[key] = merged.slice(0, 20)
  }
  unionArray('strengths')
  unionArray('weaknesses')
  unionArray('targetPoints')

  const changed = JSON.stringify(before) !== JSON.stringify(next)
  if (!changed) return { changed: false, profile: before }

  // 存快照（撤销用）
  try {
    const ev = String((patch as { evidence?: string }).evidence ?? '').slice(0, 300)
    const snapshot: ProfileSnapshot = { at: now, before, patch, evidence: ev }
    fs.appendFileSync(path.join(dataDir, HISTORY), JSON.stringify(snapshot) + '\n', 'utf8')
    fs.writeFileSync(profileFile(dataDir), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* 写不进去就当没改 */
  }
  return { changed: true, profile: next }
}

/** 撤销最近一次自动合并 */
export function undoLastMerge(dataDir: string): { ok: boolean; at?: string; error?: string } {
  const file = path.join(dataDir, HISTORY)
  let lines: string[] = []
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
  } catch {
    return { ok: false, error: '还没有自动分析记录' }
  }
  if (!lines.length) return { ok: false, error: '还没有自动分析记录' }
  const last = lines[lines.length - 1]
  try {
    const snap = JSON.parse(last) as ProfileSnapshot
    fs.writeFileSync(profileFile(dataDir), JSON.stringify(snap.before ?? {}, null, 2), 'utf8')
    lines.pop()
    fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '', 'utf8')
    return { ok: true, at: snap.at }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 历史条数（界面上显示"已自动分析 N 次"） */
export function historyCount(dataDir: string): number {
  try {
    return fs.readFileSync(path.join(dataDir, HISTORY), 'utf8').split('\n').filter((l) => l.trim()).length
  } catch {
    return 0
  }
}

/** 给模型的分析指令（单独拿出来，方便测试时不用真调模型） */
export function buildAnalysisPrompt(recentChat: string): { system: string; user: string } {
  return {
    system: [
      '你是一个学习画像分析器。根据对话记录，推断学生的水平、强项、弱项、目标知识点。',
      '只输出 JSON，不要解释，不要围栏。字段：',
      '  level: 一句话描述当前水平（如"初三，基础知识扎实，压轴题不稳"）',
      '  strengths: 字符串数组，最多 5 条，有证据才写',
      '  weaknesses: 字符串数组，最多 5 条，有证据才写',
      '  targetPoints: 字符串数组，用户明确想学的知识点',
      '  notes: 一句话补充观察',
      '没有把握的字段直接省略，不要编。',
    ].join('\n'),
    user: '最近的对话记录：\n' + recentChat,
  }
}