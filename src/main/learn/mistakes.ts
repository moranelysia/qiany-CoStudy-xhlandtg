/**
 * 错题本与疑难追踪（阶段 4.4）。
 *
 * 【为什么不能只记「这题错了」】
 *   "错了"是不可复用的信息。下次遇到同类题，Agent 只知道"你错过"，不知道
 *   **错在哪一步**，于是只能泛泛地说"注意审题" —— 这种提醒没有价值。
 *
 *   真正可复用的是两件东西：
 *     · errorType —— 错误类型（符号 / 概念 / 计算 / 审题 / 方法）
 *     · wrongStep —— 具体拐错的那一步（「移项时没变号」）
 *   有了这两样，下次才能说"上次你在移项符号上栽过，这次先看符号"。
 *
 * 【为什么按知识点归档，而不是按题】
 *   题会换，知识点不会。同一个知识点错五次，比五道不同的题各错一次更值得提醒。
 *
 * 【为什么用单个 JSON 而不是每错一条一个文件】
 *   条目量级几百，单文件够用；用户可以直接打开看、直接编辑、直接备份。
 *   一个知识点下的历史错误聚在一起，也更好读。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 错误类型。这五类覆盖了初高中到大学自学的大部分实际错法。 */
export const ERROR_TYPES = ['符号错误', '概念混淆', '计算失误', '审题偏差', '方法不当', '其他'] as const
export type ErrorType = (typeof ERROR_TYPES)[number]

export interface MistakeRecord {
  id: string
  /** 关联的知识点（名字，不强制对应知识点表 —— 自由输入更实用） */
  point: string
  /** 题目原文（可空：有时只记得错法不记得题） */
  question: string
  /** 用户当时的做法 */
  approach: string
  errorType: ErrorType
  /** 具体拐错的那一步 —— 这是最有价值的一栏 */
  wrongStep: string
  /** 是否已经纠正过 */
  corrected: boolean
  /** 纠正次数 */
  corrections: number
  /** 复发次数（纠正后又错） */
  recurrences: number
  createdAt: string
  lastSeenAt: string
  /** 来自哪次会话 */
  sessionId: string
}

interface Store {
  version: 1
  records: MistakeRecord[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return 'err-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
}

export function mistakesFile(dataDir: string): string {
  return path.join(dataDir, '错题本.json')
}

function readStore(dataDir: string): Store {
  try {
    const raw = fs.readFileSync(mistakesFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Store).records)) {
      return parsed as Store
    }
    return { version: 1, records: [] }
  } catch {
    return { version: 1, records: [] }
  }
}

function writeStore(dataDir: string, store: Store): void {
  const file = mistakesFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

export interface NewMistake {
  point: string
  question?: string
  approach?: string
  errorType?: ErrorType
  wrongStep?: string
  sessionId?: string
}

/**
 * 记一条错题。
 * 同一个「知识点 + 错误类型 + 拐错的那一步」重复出现时**合并**，
 * 只把 recurrences +1 —— 否则同一个毛病会堆成一屏重复条目。
 */
export function addMistake(dataDir: string, input: NewMistake): MistakeRecord {
  const store = readStore(dataDir)
  const point = input.point.trim()
  const wrongStep = (input.wrongStep ?? '').trim()
  const errorType: ErrorType = (ERROR_TYPES as readonly string[]).includes(input.errorType ?? '')
    ? (input.errorType as ErrorType)
    : '其他'

  const existing = store.records.find(
    (r) => r.point === point && r.errorType === errorType && r.wrongStep === wrongStep,
  )
  if (existing) {
    existing.recurrences += 1
    existing.lastSeenAt = nowIso()
    if (input.question) existing.question = existing.question || input.question
    writeStore(dataDir, store)
    return existing
  }

  const record: MistakeRecord = {
    id: newId(),
    point,
    question: (input.question ?? '').trim(),
    approach: (input.approach ?? '').trim(),
    errorType,
    wrongStep,
    corrected: false,
    corrections: 0,
    recurrences: 0,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    sessionId: input.sessionId ?? '',
  }
  store.records.push(record)
  writeStore(dataDir, store)
  return record
}

export function listMistakes(dataDir: string): MistakeRecord[] {
  return readStore(dataDir).records
}

/** 标记已纠正（复发计数保留 —— 那个数字本身就是画像的一部分） */
export function correctMistake(dataDir: string, id: string): MistakeRecord | null {
  const store = readStore(dataDir)
  const record = store.records.find((r) => r.id === id)
  if (!record) return null
  record.corrected = true
  record.corrections += 1
  record.lastSeenAt = nowIso()
  writeStore(dataDir, store)
  return record
}

/** 统计：哪种错法最常见 */
export function errorTypeStats(dataDir: string): Array<{ type: ErrorType; count: number }> {
  const counts = new Map<ErrorType, number>()
  for (const record of listMistakes(dataDir)) {
    counts.set(record.errorType, (counts.get(record.errorType) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

/** 还没纠正的（这些才需要主动提醒） */
export function openMistakes(dataDir: string, limit = 5): MistakeRecord[] {
  return listMistakes(dataDir)
    .filter((r) => !r.corrected)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, limit)
}

/**
 * 注入提示词的"还没弄明白的地方"。
 *
 * 只放两样：未纠正的具体毛病 + 最常见的错误类型。
 * 不放全部历史 —— 堆满了一屏，模型反而抓不住重点。
 */
export function formatForPrompt(dataDir: string, limit = 5): string {
  const open = openMistakes(dataDir, limit)
  if (!open.length) return ''

  const lines = open.map((r) => {
    const step = r.wrongStep ? '，卡在「' + r.wrongStep + '」' : ''
    const times = r.recurrences > 0 ? '（复发 ' + r.recurrences + ' 次）' : ''
    return `· ${r.point}：${r.errorType}${step}${times}`
  })

  const top = errorTypeStats(dataDir)[0]
  if (top && top.count >= 3) {
    lines.push(`· 总体倾向：${top.type}出现最多（${top.count} 次），讲题时优先留意这一点`)
  }

  return lines.join('\n')
}

/** 概览，界面显示用 */
export function mistakeOverview(dataDir: string): { total: number; open: number; topType: string } {
  const all = listMistakes(dataDir)
  const top = errorTypeStats(dataDir)[0]
  return {
    total: all.length,
    open: all.filter((r) => !r.corrected).length,
    topType: top?.type ?? '',
  }
}
