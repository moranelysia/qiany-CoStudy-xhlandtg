/**
 * 未发送消息队列（P3 保障层）。
 *
 * 【为什么要有】
 *   断网时发一条消息，现在的表现是"这一句没发出去"，然后消息就没了 ——
 *   用户得自己记住刚才说了什么。存下来、能重发，才叫"保障"。
 *
 * 存 `记忆/待发送.json`，最多留 20 条（防止长期断网无限堆积）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface OutboxItem {
  id: string
  sessionId: string
  text: string
  at: string
  /** 上次失败原因，界面上直接显示 */
  error?: string
}

const FILE = '待发送.json'
const MAX_ITEMS = 20

function file(dataDir: string): string {
  return path.join(dataDir, FILE)
}

export function listOutbox(dataDir: string): OutboxItem[] {
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as OutboxItem[] | null
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.text === 'string') : []
  } catch {
    return []
  }
}

function write(dataDir: string, items: OutboxItem[]): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify(items.slice(-MAX_ITEMS), null, 2), 'utf8')
  } catch {
    /* 写不进去就算了，不能影响发送流程 */
  }
}

export function pushOutbox(dataDir: string, sessionId: string, text: string, error?: string): OutboxItem {
  const item: OutboxItem = {
    id: 'o-' + randomUUID().replace(/-/g, '').slice(0, 10),
    sessionId,
    text,
    at: new Date().toISOString(),
    error,
  }
  const items = listOutbox(dataDir)
  items.push(item)
  write(dataDir, items)
  return item
}

export function removeOutbox(dataDir: string, id: string): OutboxItem[] {
  const items = listOutbox(dataDir).filter((i) => i.id !== id)
  write(dataDir, items)
  return items
}

export function clearOutbox(dataDir: string): void {
  write(dataDir, [])
}
