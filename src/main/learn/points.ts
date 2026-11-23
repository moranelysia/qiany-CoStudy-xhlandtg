/**
 * 知识点与间隔重复（阶段 4.3）。
 *
 * 【要解决的问题】
 *   错题本记录了"哪里错过"，但没有回答"什么时候该再看一遍"。
 *   人脑的遗忘是**指数衰减**的：今天学会的东西，明天忘一半，一周后忘八成。
 *   同一个知识点，复习间隔应该越拉越长（1 → 3 → 7 → 15 → 30 天），
 *   而不是每天从头看一遍 —— 后者是浪费时间，也会让人很快放弃。
 *
 * 【为什么用固定阶梯而不是完整 SM-2】
 *   完整 SM-2 有难度系数、质量评分 0-5、易度因子，参数多到没法向用户解释。
 *   这里用五档固定阶梯 + 掌握度调节：
 *     · 掌握度 >= 0.8 → 跳一档（学得快就别拖着）
 *     · 掌握度 < 0.5  → 退两档（没懂就快点回来）
 *   可解释、可预测，用户看一眼就懂"下次什么时候复习"。
 *
 * 【为什么时间要能注入】
 *   "今天该复习什么"依赖当前时间。把 now 作为参数传进来，
 *   测试才能确定性地验"过期 / 到期 / 未到期"三种情况，
 *   而不是靠 sleep 或改系统时间。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 复习阶梯（天）。最后一个之后就一直按 30 天滚。 */
export const INTERVALS_DAYS = [1, 3, 7, 15, 30] as const

export interface PointRecord {
  id: string
  /** 科目（自由文本，可空） */
  subject: string
  name: string
  stage: string
  /** 掌握度 0-1 */
  mastery: number
  /** 当前处在阶梯的第几档（0 开始） */
  step: number
  firstLearned: string
  lastReviewed: string
  /** 下次复习日期（ISO 的日期部分，便于按天比较） */
  nextReview: string
  reviewCount: number
  /** 来源：会话 id / 错题 id */
  sources: string[]
}

interface Store {
  version: 1
  points: PointRecord[]
}


/** 只保留日期部分 —— 复习是"哪一天"，不是"哪一秒" */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function newId(): string {
  return 'kp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
}

export function pointsFile(dataDir: string): string {
  return path.join(dataDir, '知识点.json')
}

function readStore(dataDir: string): Store {
  try {
    const raw = fs.readFileSync(pointsFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Store).points)) {
      return parsed as Store
    }
    return { version: 1, points: [] }
  } catch {
    return { version: 1, points: [] }
  }
}

function writeStore(dataDir: string, store: Store): void {
  const file = pointsFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

/**
 * 按掌握度决定档位移动。
 * 跳档而不是逐档走：教得太慢对已经会的人是一种惩罚。
 */
function nextStep(current: number, mastery: number): number {
  const max = INTERVALS_DAYS.length - 1
  if (mastery >= 0.8) return Math.min(max, current + 2)
  if (mastery >= 0.5) return Math.min(max, current + 1)
  return Math.max(0, current - 2)
}

/**
 * 掌握度怎么变：答对小幅上推，答错明显回落。
 *
 * 旧实现是"答对写死 0.75、答错写死 0.35"两个常数 —— 一次失误能把 0.9 打到 0.35，
 * 一次蒙对又能让 0.1 跳到 0.75，画像会被单次表现带跑。
 * 这里用「向两端收敛」的增量：越高越难再涨，越低也越难再跌，更接近真实遗忘/习得曲线。
 */
export function nextMastery(prev: number, correct: boolean): number {
  const base = Number.isFinite(prev) ? Math.max(0, Math.min(1, prev)) : 0
  const next = correct ? base + (1 - base) * 0.35 : base * 0.55
  return Math.round(next * 100) / 100
}

export interface UpsertPoint {
  name: string
  subject?: string
  stage?: string
  mastery?: number
  /** 来源标记：会话 id / 错题 id */
  source?: string
  /** 可注入的当前时间（测试用） */
  now?: Date
}

/** 新建或更新一个知识点：同名视为同一个 */
export function upsertPoint(dataDir: string, input: UpsertPoint): PointRecord {
  const store = readStore(dataDir)
  const now = input.now ?? new Date()
  const name = input.name.trim()
  const mastery = clamp01(input.mastery ?? 0)

  const existing = store.points.find((p) => p.name === name)
  if (existing) {
    existing.mastery = mastery
    existing.lastReviewed = now.toISOString()
    existing.reviewCount += 1
    existing.step = nextStep(existing.step, mastery)
    existing.nextReview = dayKey(addDays(now, INTERVALS_DAYS[existing.step]))
    if (input.source && !existing.sources.includes(input.source)) {
      existing.sources.push(input.source)
    }
    writeStore(dataDir, store)
    return existing
  }

  const record: PointRecord = {
    id: newId(),
    subject: (input.subject ?? '').trim(),
    name,
    stage: input.stage ?? '',
    mastery,
    step: 0,
    firstLearned: now.toISOString(),
    lastReviewed: now.toISOString(),
    // 第一次学完，按第一档排（默认明后天见）
    nextReview: dayKey(addDays(now, INTERVALS_DAYS[0])),
    reviewCount: 1,
    sources: input.source ? [input.source] : [],
  }
  store.points.push(record)
  writeStore(dataDir, store)
  return record
}

export function listPoints(dataDir: string): PointRecord[] {
  return readStore(dataDir).points
}

/**
 * 今天该复习的：nextReview <= 今天。
 * 用字符串比较就够 —— dayKey() 产出的格式是 YYYY-MM-DD，字典序等于时间序。
 */
export function duePoints(dataDir: string, now: Date = new Date()): PointRecord[] {
  const today = dayKey(now)
  return listPoints(dataDir)
    .filter((p) => p.nextReview <= today)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
}

/** 掌握度最低的几个（还不熟，可以顺便多问一句） */
export function weakPoints(dataDir: string, limit = 3): PointRecord[] {
  return listPoints(dataDir)
    .slice()
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, limit)
}

/**
 * 注入提示词的复习清单。
 * 只列"今天到期"的，最多 5 条 —— 一次塞十条，模型会平均分配注意力，
 * 结果哪条都没讲透。
 */
export function formatForPrompt(dataDir: string, now: Date = new Date(), limit = 5): string {
  const due = duePoints(dataDir, now).slice(0, limit)
  if (!due.length) return ''
  const lines = due.map((p) => {
    const days = Math.max(0, daysBetween(p.nextReview, dayKey(now)))
    const when = days > 0 ? `（已过期 ${days} 天）` : '（今天到期）'
    return `· ${p.name}${p.subject ? '（' + p.subject + '）' : ''} · 掌握度 ${Math.round(
      p.mastery * 100,
    )}%${when}`
  })
  lines.push('对方还没主动提的话，你先问一句要不要复习这几条。')
  return lines.join('\n')
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00')
  const b = Date.parse(to + 'T00:00:00')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

export interface PointsOverview {
  total: number
  due: number
  avgMastery: number
}

export function pointsOverview(dataDir: string, now: Date = new Date()): PointsOverview {
  const all = listPoints(dataDir)
  const avg = all.length ? all.reduce((s, p) => s + p.mastery, 0) / all.length : 0
  return {
    total: all.length,
    due: duePoints(dataDir, now).length,
    avgMastery: Math.round(avg * 100) / 100,
  }
}
