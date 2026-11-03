/**
 * 每日对话条数 —— 首页「本周学习趋势」的数据源。
 *
 * 为什么要单独算一份，而不是继续从"当前会话文件"数：
 *   清空对话**不删文件**，而是把它挪进 `会话/已删除/`（还能捞回来）。
 *   首页如果只读 `会话/*.jsonl`，一次"清空"就会把整周曲线抹平 ——
 *   用户看到的不是"我清空了聊天"，而是"我这周没学习"。
 *
 * 口径：
 *   - 读 `会话/*.jsonl` + `会话/已删除/*.jsonl`
 *   - 按 `at|role|正文长度` 去重：清空是整份文件做备份，清三次就有三份互相包含的快照，
 *     不去重会把同一条消息数三遍
 *   - `removeSession` 是真的 unlink，那些消息才会从统计里消失
 *
 * 只读，不落盘 —— 不引入新的状态，也就不会出现"统计和会话对不上"的第二套账。
 */
import fs from 'node:fs'
import path from 'node:path'
import { dayKeyOf } from '../study-time'

export interface DailyCounts {
  /** 'YYYY-MM-DD' → 当天消息条数 */
  byDay: Record<string, number>
  /** 去重后的总条数 */
  total: number
  /** 有记录的天数 */
  days: number
  /** 今天的消息时间戳（毫秒，升序）——"没有计时记录时按消息间隔推算学习时长"要用 */
  todayTs: number[]
}

/** 解析上限：真有人攒到十万条也不能卡住首页 */
const MAX_MESSAGES = 60000
const MAX_TODAY_TS = 4000

/** 目录下的 .jsonl，按修改时间从新到旧（新会话优先计入，触到上限时丢的是老数据） */
function listJsonl(dir: string): string[] {
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: Array<{ file: string; mtime: number }> = []
  for (const name of names) {
    if (!/\.jsonl$/i.test(name)) continue
    const file = path.join(dir, name)
    try {
      out.push({ file, mtime: fs.statSync(file).mtimeMs })
    } catch {
      /* 读不到就跳过这一份 */
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out.map((x) => x.file)
}

export function dailyCounts(dataDir: string, now = new Date()): DailyCounts {
  const byDay: Record<string, number> = {}
  const seen = new Set<string>()
  const todayTs: number[] = []
  const todayKey = dayKeyOf(now)
  let total = 0

  const chatDir = path.join(dataDir, '会话')
  const files = [...listJsonl(chatDir), ...listJsonl(path.join(chatDir, '已删除'))]

  for (const file of files) {
    let raw = ''
    try {
      raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    } catch {
      continue
    }
    for (const line of raw.split('\n')) {
      const text = line.trim()
      if (!text) continue
      let msg: { role?: unknown; text?: unknown; at?: unknown }
      try {
        msg = JSON.parse(text) as { role?: unknown; text?: unknown; at?: unknown }
      } catch {
        continue
      }
      const at = String(msg?.at ?? '')
      const ts = at ? Date.parse(at) : NaN
      if (!Number.isFinite(ts)) continue
      // 去重键：同一毫秒 + 同一角色 + 同长度，基本不会误伤（备份是整份快照）
      const key = at + '|' + String(msg?.role ?? '') + '|' + String(msg?.text ?? '').length
      if (seen.has(key)) continue
      seen.add(key)
      total += 1
      const day = dayKeyOf(new Date(ts))
      byDay[day] = (byDay[day] ?? 0) + 1
      if (day === todayKey && todayTs.length < MAX_TODAY_TS) todayTs.push(ts)
      if (total >= MAX_MESSAGES) break
    }
    if (total >= MAX_MESSAGES) break
  }

  todayTs.sort((a, b) => a - b)
  return { byDay, total, days: Object.keys(byDay).length, todayTs }
}
