/**
 * 记忆的重要性评分（阶段 5.1 + 5.2 第一层）。
 *
 * 【为什么需要评分】
 *   扁平日志式记忆的问题不是"记不住"，是"记得太多"。
 *   聊一周就攒几百条，每次全塞进提示词 —— 模型的注意力被稀释，
 *   真正重要的事反而被淹没。
 *
 *   评分的作用是回答一个问题：**这条记忆现在还有多少价值？**
 *   答不上来的，就该被压缩或归档。
 *
 * 【四因素（书里 3.1.7 的原话，缺一不可）】
 *   1. 访问频率   —— 老被想起的事更重要（对数抑制，避免高频项压倒一切）
 *   2. 时间衰减   —— 指数衰减 e^(-λ·天数)：久不提的事自然变淡
 *   3. 情感强度   —— 有情绪的事记得牢（用户自己说的"特别"、"崩溃"、"开心"）
 *   4. 信息独特性 —— 人人都知道的事没必要记（"他喜欢数学"vs"他做几何题必须画图")
 *
 * 【为什么时间衰减单独拎出来说】
 *   之前的设计只算了频率，结果是一条三周前的高频记忆永远压着今天的记忆。
 *   没有衰减，评分就不是"当前价值"，而是"历史总量"。
 */
import fs from 'node:fs'
import path from 'node:path'

export type MemoryKind = 'facts' | 'experiences' | 'notes'
export type MemoryStatus = 'active' | 'compressed' | 'archived'

/** 四因素权重。调这里就能改整体倾向，不用动公式。 */
export const WEIGHTS = {
  frequency: 0.3,
  recency: 0.4,
  emotion: 0.2,
  uniqueness: 0.1,
} as const

/** 时间衰减速度：半衰期约 30 天（e^(-0.0231·30) ≈ 0.5） */
export const DECAY_LAMBDA = 0.0231

export interface MemoryMeta {
  /** 0-1，综合重要性 */
  importance: number
  /** 被检索/注入的次数 */
  accessCount: number
  /** 上次访问时间（ISO） */
  lastAccess: string
  /** 情感强度 0-1 */
  emotion: number
  /** 独特性 0-1 */
  uniqueness: number
  /** 为谁记的：本人 / 家人 / 同学 / 老师 */
  about: string
  /** 为什么存 */
  reason: string
  /** 关联的知识点 / 会话 id */
  relations: string[]
  status: MemoryStatus
}

export interface MemoryRecord {
  id: string
  kind: MemoryKind
  content: string
  createdAt: string
  source: string
  meta: MemoryMeta
}

interface RawStored {
  id?: string
  编号?: string
  时间?: string
  内容?: string
  来源?: string
  meta?: Partial<MemoryMeta>
}

const FILE_NAME: Record<MemoryKind, string> = {
  facts: '事实.json',
  experiences: '经历.json',
  notes: '小本子.json',
}

export function memoryDir(dataDir: string): string {
  return path.join(dataDir, '记忆')
}

export function memoryFile(dataDir: string, kind: MemoryKind): string {
  return path.join(memoryDir(dataDir), FILE_NAME[kind])
}

/* ---------- 评分 ---------- */

export interface ScoreInput {
  accessCount: number
  /** 距上次访问 / 创建的天数 */
  ageDays: number
  emotion: number
  uniqueness: number
}

/**
 * 四因素加权。
 * 频率取对数：1 次和 2 次的差别远大于 20 次和 21 次。
 */
export function scoreImportance(input: ScoreInput): number {
  const freq = Math.log1p(Math.max(0, input.accessCount)) / Math.log(10) // log10(1+n)，10 次访问 ≈ 1
  const freqNorm = Math.min(1, freq)
  const recency = Math.exp(-DECAY_LAMBDA * Math.max(0, input.ageDays))
  const emotion = Math.max(0, Math.min(1, input.emotion))
  const uniqueness = Math.max(0, Math.min(1, input.uniqueness))

  const score =
    WEIGHTS.frequency * freqNorm +
    WEIGHTS.recency * recency +
    WEIGHTS.emotion * emotion +
    WEIGHTS.uniqueness * uniqueness

  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000
}

/** 天数差（正数表示过去） */
export function ageInDays(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, (now.getTime() - t) / 86400000)
}

/** 重算一条记忆的重要性，并据此更新状态 */
export function rescore(record: MemoryRecord, now: Date = new Date()): MemoryRecord {
  const ageDays = ageInDays(record.meta.lastAccess || record.createdAt, now)
  const importance = scoreImportance({
    accessCount: record.meta.accessCount,
    ageDays,
    emotion: record.meta.emotion,
    uniqueness: record.meta.uniqueness,
  })

  let status: MemoryStatus = record.meta.status
  if (status !== 'archived') {
    // 低于 0.35 视为可压缩；压缩过又被访问到的会被 access() 拉回 active
    if (importance < 0.35) status = 'compressed'
    else if (status === 'compressed') status = 'active'
  }

  return { ...record, meta: { ...record.meta, importance, status } }
}

/* ---------- 读写 ---------- */

/** 默认元数据：新记忆先给中性值，第一次评分会把它调到合理区间 */
export function defaultMeta(now: Date = new Date()): MemoryMeta {
  return {
    importance: 0,
    accessCount: 0,
    lastAccess: now.toISOString(),
    emotion: 0.3,
    uniqueness: 0.5,
    about: '本人',
    reason: '',
    relations: [],
    status: 'active',
  }
}

function toRecord(raw: RawStored, kind: MemoryKind, now: Date): MemoryRecord | null {
  const content = raw.内容 ?? ''
  if (!content.trim()) return null
  const createdAt = raw.时间 ?? now.toISOString()
  const meta: MemoryMeta = { ...defaultMeta(now), ...(raw.meta ?? {}) }
  // 旧数据没有 meta：lastAccess 必须用它的创建时间，不能用"现在"。
  // 否则两个月前的记忆一读进来就被当成刚访问过，时间衰减直接失效 ——
  // 表现为"旧记忆永远新鲜，永远不会被压缩"。
  if (!raw.meta?.lastAccess) meta.lastAccess = createdAt
  const record: MemoryRecord = {
    id: raw.id ?? raw.编号 ?? '',
    kind,
    content,
    createdAt,
    source: raw.来源 ?? '',
    meta,
  }
  return rescore(record, now)
}

/** 读一份记忆。旧格式（只有 编号/时间/内容/来源）会自动补元数据。 */
export function readMemory(dataDir: string, kind: MemoryKind, now: Date = new Date()): MemoryRecord[] {
  const file = memoryFile(dataDir, kind)
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => toRecord(item as RawStored, kind, now))
      .filter((item): item is MemoryRecord => item !== null)
  } catch {
    return []
  }
}

function writeMemory(dataDir: string, kind: MemoryKind, records: MemoryRecord[]): void {
  const file = memoryFile(dataDir, kind)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const raw: RawStored[] = records.map((r) => ({
    编号: r.id,
    时间: r.createdAt,
    内容: r.content,
    来源: r.source,
    meta: r.meta,
  }))
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n', 'utf8')
}

export interface AppendInput {
  kind: MemoryKind
  content: string
  source?: string
  emotion?: number
  uniqueness?: number
  about?: string
  reason?: string
  relations?: string[]
  now?: Date
}

export function appendMemory(dataDir: string, input: AppendInput): MemoryRecord {
  const now = input.now ?? new Date()
  const record: MemoryRecord = {
    id: 'm-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    kind: input.kind,
    content: input.content.trim(),
    createdAt: now.toISOString(),
    source: input.source ?? '对话',
    meta: {
      ...defaultMeta(now),
      emotion: input.emotion ?? 0.3,
      uniqueness: input.uniqueness ?? 0.5,
      about: input.about ?? '本人',
      reason: input.reason ?? '',
      relations: input.relations ?? [],
    },
  }
  const scored = rescore(record, now)
  const all = readMemory(dataDir, input.kind, now)
  all.push(scored)
  writeMemory(dataDir, input.kind, all)
  return scored
}

/** 记一次访问：计数 +1、刷新时间，并重新评分（被想起的事会重新变重要） */
export function touchMemory(dataDir: string, kind: MemoryKind, id: string, now: Date = new Date()): MemoryRecord | null {
  const all = readMemory(dataDir, kind, now)
  const index = all.findIndex((r) => r.id === id)
  if (index < 0) return null
  const target = all[index]
  const bumped: MemoryRecord = {
    ...target,
    meta: {
      ...target.meta,
      accessCount: target.meta.accessCount + 1,
      lastAccess: now.toISOString(),
      status: target.meta.status === 'archived' ? 'archived' : 'active',
    },
  }
  const scored = rescore(bumped, now)
  all[index] = scored
  writeMemory(dataDir, kind, all)
  return scored
}

/** 所有三类记忆合在一起，按重要性降序 */
export function allMemories(dataDir: string, now: Date = new Date()): MemoryRecord[] {
  return (['facts', 'experiences', 'notes'] as MemoryKind[])
    .flatMap((kind) => readMemory(dataDir, kind, now))
    .sort((a, b) => b.meta.importance - a.meta.importance)
}

/**
 * 注入提示词时挑哪些。
 * 只取 active 且重要性达标的 —— 压缩过的就不该再占位置。
 */
export function selectForPrompt(
  dataDir: string,
  now: Date = new Date(),
  limit = 12,
  minImportance = 0.3,
): MemoryRecord[] {
  return allMemories(dataDir, now)
    .filter((r) => r.meta.status === 'active' && r.meta.importance >= minImportance)
    .slice(0, limit)
}

/** 把条目渲染成提示词里的几行 */
export function formatEntries(records: MemoryRecord[]): string {
  return records
    .map((r) => {
      const day = r.createdAt.slice(0, 10)
      return `· [${day}] ${r.content}`
    })
    .join('\n')
}

/** 统计概览（界面/画像用） */
export function memoryStats(
  dataDir: string,
  now: Date = new Date(),
): { total: number; active: number; compressed: number; avgImportance: number } {
  const all = allMemories(dataDir, now)
  const active = all.filter((r) => r.meta.status === 'active').length
  const compressed = all.filter((r) => r.meta.status === 'compressed').length
  const avg = all.length ? all.reduce((s, r) => s + r.meta.importance, 0) / all.length : 0
  return {
    total: all.length,
    active,
    compressed,
    avgImportance: Math.round(avg * 1000) / 1000,
  }
}
