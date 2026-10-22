/**
 * 学习者画像（阶段 5.3）。
 *
 * 【为什么画像不能靠模型"每轮凭印象写"】
 *   模型写的画像不可复现、不可审计，也改不动 —— 用户看到"你比较擅长几何"
 *   但没法查这个结论是怎么来的，也没法纠正。
 *
 *   这里的做法：**用统计量说话**。
 *   学科分布来自知识点表、错法分布来自错题本、复习压力来自间隔重复队列。
 *   每个数字都能点开看到原始记录。
 *
 *   模型归纳留到第二阶段（需要在统计量之上做总结），
 *   但即使没有模型，这份画像也已经是准确且可解释的。
 */
import fs from 'node:fs'
import path from 'node:path'
import { listPoints } from './learn/points'
import { errorTypeStats, listMistakes, openMistakes } from './learn/mistakes'

export interface SubjectStat {
  subject: string
  /** 该科目下的知识点数 */
  points: number
  /** 平均掌握度 0-1 */
  avgMastery: number
}

export interface WeakPoint {
  name: string
  mastery: number
}

export interface Profile {
  updatedAt: string
  stage: string
  subjects: SubjectStat[]
  weakPoints: WeakPoint[]
  errorTypes: Array<{ type: string; count: number }>
  counts: {
    points: number
    dueToday: number
    mistakes: number
    openMistakes: number
  }
}

export function profileFile(dataDir: string): string {
  return path.join(dataDir, '画像.json')
}

export interface BuildOptions {
  dataDir: string
  stage: string
  now?: Date
  /** 今天到期的知识点数（由调用方算好传进来，避免这里重复依赖时间逻辑） */
  dueToday?: number
}

export function buildProfile(options: BuildOptions): Profile {
  const now = options.now ?? new Date()
  const points = listPoints(options.dataDir)
  const mistakes = listMistakes(options.dataDir)

  // 按科目聚合
  const bySubject = new Map<string, { points: number; sum: number }>()
  for (const p of points) {
    const key = p.subject.trim() || '未分类'
    const bucket = bySubject.get(key) ?? { points: 0, sum: 0 }
    bucket.points += 1
    bucket.sum += p.mastery
    bySubject.set(key, bucket)
  }

  const subjects: SubjectStat[] = [...bySubject.entries()]
    .map(([subject, b]) => ({
      subject,
      points: b.points,
      avgMastery: Math.round((b.sum / b.points) * 100) / 100,
    }))
    .sort((a, b) => b.points - a.points)

  const weakPoints: WeakPoint[] = points
    .slice()
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5)
    .map((p) => ({ name: p.name, mastery: p.mastery }))

  return {
    updatedAt: now.toISOString(),
    stage: options.stage,
    subjects,
    weakPoints,
    errorTypes: errorTypeStats(options.dataDir).slice(0, 3),
    counts: {
      points: points.length,
      dueToday: options.dueToday ?? 0,
      mistakes: mistakes.length,
      openMistakes: openMistakes(options.dataDir, 999).length,
    },
  }
}

/** 存到数据目录 */
export function writeProfile(dataDir: string, profile: Profile): void {
  const file = profileFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(profile, null, 2) + '\n', 'utf8')
}

export function readProfile(dataDir: string): Profile | null {
  try {
    return JSON.parse(fs.readFileSync(profileFile(dataDir), 'utf8').replace(/^\uFEFF/g, '')) as Profile
  } catch {
    return null
  }
}

/**
 * 渲染成提示词里的一段。
 *
 * 原则：**只写对教学有用的**。
 * "共 37 个知识点" 对讲课没有帮助；"几何类平均掌握 40%，比函数低 30 个百分点"
 * 才能改变讲法。
 */
export function formatForPrompt(profile: Profile): string {
  const lines: string[] = ['===== 这个人的学习画像（程序统计，不是你的印象）=====', '']

  if (profile.stage && profile.stage !== '不限') {
    lines.push(`· 学段：${profile.stage}`)
  }

  if (profile.subjects.length) {
    const list = profile.subjects
      .slice(0, 3)
      .map((s) => `${s.subject} ${Math.round(s.avgMastery * 100)}%`)
      .join(' / ')
    lines.push(`· 各科掌握度：${list}`)
  }

  if (profile.weakPoints.length) {
    const weak = profile.weakPoints
      .slice(0, 3)
      .map((p) => `${p.name}（${Math.round(p.mastery * 100)}%）`)
      .join('、')
    lines.push(`· 最薄弱：${weak}`)
  }

  if (profile.errorTypes.length) {
    const types = profile.errorTypes.map((e) => `${e.type} ${e.count} 次`).join('、')
    lines.push(`· 常见错法：${types}`)
  }

  if (profile.counts.dueToday > 0) {
    lines.push(`· 今天有 ${profile.counts.dueToday} 条待复习`)
  }

  if (lines.length <= 2) return ''

  lines.push('', '（用这些调整讲法：薄弱的地方多给一步台阶，常见错法提前提醒一句。不要把这些数字念出来。）', '')
  return lines.join('\n')
}

/** 画像里的"最薄弱"拿来当提示词里的一个提醒（没有知识点时为空） */
export function weakestHint(profile: Profile): string {
  const weak = profile.weakPoints[0]
  if (!weak) return ''
  return `对方在「${weak.name}」上最不稳（掌握 ${Math.round(weak.mastery * 100)}%），讲到相关的地方多停一下。`
}
