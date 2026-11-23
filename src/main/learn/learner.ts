/**
 * 学习者画像 → 教学决策的桥（第四阶段）。
 *
 * 两件事：
 *   1. `learnerBrief()` —— 把长期数据（知识点掌握度 + 错题分布）压成一小段文本，
 *      塞进「探测 / 拆解」两步的提示词里。以前这两步是数据盲的：模型只能临场猜学生会不会。
 *   2. `recordSessionOutcome()` —— 一节课收尾时把本次结果写回长期档案：
 *      讲过的点更新掌握度，探测出的薄弱点落成低分知识点，下次拆课直接看得到。
 *
 * 为什么单独成文件：它是"读画像 + 写画像"的唯一边界，能脱机单测，
 * 也避免 index.ts 里再散落第三、第四处掌握度写入逻辑。
 */
import { listMistakes } from './mistakes'
import { listPoints, upsertPoint } from './points'
import type { SessionState } from './session'

export interface LearnerBrief {
  /** 已经比较稳的点（掌握度 ≥ 0.6） */
  known: Array<{ name: string; mastery: number }>
  /** 薄弱点（掌握度 < 0.45） */
  weak: Array<{ name: string; mastery: number }>
  /** 出现最多的错因 */
  topErrors: Array<{ type: string; count: number }>
  /** 直接拼进提示词的一段话；没数据时是空串 */
  text: string
}

function fmt(list: Array<{ name: string; mastery: number }>): string {
  return list.map((p) => `${p.name}(${p.mastery.toFixed(2)})`).join('、')
}

/**
 * 生成画像摘要。
 *
 * 只取最强的 3 个和 weakest 的 3 个：教学决策需要的是"从哪开始讲"，
 * 不是一张完整的成绩单。全塞进去只会稀释注意力。
 */
export function learnerBrief(dataDir: string, limit = 3): LearnerBrief {
  const points = listPoints(dataDir).filter((p) => p.name)
  const known = points
    .filter((p) => p.mastery >= 0.6)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, limit)
    .map((p) => ({ name: p.name, mastery: p.mastery }))
  const weak = points
    .filter((p) => p.mastery < 0.45)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, limit)
    .map((p) => ({ name: p.name, mastery: p.mastery }))

  // 错因分布：同一个错法反复出现，比单次答错更值得在课上提
  const counts = new Map<string, number>()
  for (const m of listMistakes(dataDir)) {
    if (!m.errorType) continue
    counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1 + (m.recurrences ?? 0))
  }
  const topErrors = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)

  const lines: string[] = []
  if (known.length) lines.push('已掌握：' + fmt(known))
  if (weak.length) lines.push('薄弱：' + fmt(weak))
  if (topErrors.length) lines.push('常见错因：' + topErrors.map((e) => `${e.type}×${e.count}`).join('、'))

  return { known, weak, topErrors, text: lines.join('\n') }
}

/**
 * 一节课结束时的回写。
 *
 * 只做两件事，且都不覆盖已有更高分：
 *   · 讲过的点：用本节记录的掌握度更新长期档案（会话内的判断更贴近"刚讲过"）
 *   · 探测出的薄弱点：落成 0.2 分的知识点，下次拆课会被 learnerBrief 挑出来
 */
export function recordSessionOutcome(
  dataDir: string,
  state: SessionState,
): { pointsUpdated: number; weakAdded: number } {
  let pointsUpdated = 0
  let weakAdded = 0
  const known = new Set(listPoints(dataDir).map((p) => p.name))

  for (const p of state.points) {
    if (!p.taught || !p.name) continue
    upsertPoint(dataDir, { name: p.name, mastery: p.mastery, source: 'session:' + state.id })
    pointsUpdated += 1
    known.add(p.name)
  }

  for (const w of state.weaknesses) {
    const name = String(w).trim().slice(0, 40)
    if (!name || known.has(name)) continue
    upsertPoint(dataDir, { name, mastery: 0.2, source: 'weak:' + state.id })
    weakAdded += 1
    known.add(name)
  }

  return { pointsUpdated, weakAdded }
}
