/**
 * 真实学习时长（分钟级计数，不是靠消息间隔猜）。
 *
 * 之前的「今日学习」是**推算**的：把今天的消息时间戳按段落合并。
 * 问题是：你在想、在打草稿、在纸上算的时候都不算 —— 人会觉得自己学了半小时，界面显示 6 分。
 *
 * 这里改成**真的计时**：渲染端在伴学页里每 20 秒探一次，窗口在前台才累计。
 * 落盘 `记忆/学习时长.json`：{ "2026-11-01": 1234 }（秒）。
 * 老数据没有就用回推算法 —— 两个来源都保留，界面取大的那个，不丢历史。
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = '学习时长.json'
const MAX_DAYS = 400

export function dayKeyOf(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function file(dataDir: string): string {
  return path.join(dataDir, FILE)
}

export function readSecondsByDay(dataDir: string): Record<string, number> {
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as { days?: Record<string, unknown> } | null
    const days = parsed?.days
    if (!days || typeof days !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(days)) {
      const n = Number(v)
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) out[k] = Math.round(n)
    }
    return out
  } catch {
    return {}
  }
}

/** 累加今天（或指定日）的秒数，返回累加后的当天秒数 */
export function addSeconds(dataDir: string, seconds: number, date = new Date()): number {
  const add = Math.max(0, Math.min(3600, Math.round(Number(seconds) || 0)))
  if (!add) return todaySeconds(dataDir, date)
  const all = readSecondsByDay(dataDir)
  const key = dayKeyOf(date)
  all[key] = (all[key] ?? 0) + add
  // 只留最近 MAX_DAYS 天
  const keys = Object.keys(all).sort()
  while (keys.length > MAX_DAYS) {
    const drop = keys.shift()
    if (drop) delete all[drop]
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify({ version: 1, days: all }, null, 2), 'utf8')
  } catch {
    /* 写不进去不影响学习 */
  }
  return all[key]
}

export function todaySeconds(dataDir: string, date = new Date()): number {
  return readSecondsByDay(dataDir)[dayKeyOf(date)] ?? 0
}

export function todayMinutes(dataDir: string, date = new Date()): number {
  return Math.round(todaySeconds(dataDir, date) / 60)
}

/** 最近 7 天的分钟数（顺序：最早→今天） */
export function lastWeekMinutes(dataDir: string, date = new Date()): number[] {
  const all = readSecondsByDay(dataDir)
  const out: number[] = []
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(date)
    d.setDate(d.getDate() - i)
    out.push(Math.round((all[dayKeyOf(d)] ?? 0) / 60))
  }
  return out
}
