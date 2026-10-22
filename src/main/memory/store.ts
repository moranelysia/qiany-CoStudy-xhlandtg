/**
 * 记忆存储（第一版：三份 JSON，扁平日志式）。
 *
 * 阶段 1 只做「搬运 + 去角色化」，**不做**重要性评分 / 三层压缩 / 画像 ——
 * 那些是阶段 5 的新建工作。先把数据落点和读写接口固定下来，
 * 阶段 5 在这套接口上加字段，不用重写调用方。
 *
 * 存储布局（和参考版一致，方便直接搬旧数据）：
 *   <dataDir>/记忆/事实.json     [{ id, 时间, 类别, 内容, 来源 }]
 *   <dataDir>/记忆/经历.json
 *   <dataDir>/记忆/小本子.json
 *
 * 为什么用 JSON 而不是数据库：
 *   条目量级是几百到几千，JSON 够用；用户可以直接打开看、直接改、直接备份。
 *   可审计本身就是这个产品的卖点之一。
 */
import fs from 'node:fs'
import path from 'node:path'

export type MemoryKind = 'facts' | 'experiences' | 'notes'

/** 中文文件名：用户在资源管理器里能看懂，迁移旧数据也不用改名 */
const FILE_NAME: Record<MemoryKind, string> = {
  facts: '事实.json',
  experiences: '经历.json',
  notes: '小本子.json',
}

export interface MemoryRecord {
  id: string
  /** ISO 时间戳 */
  time: string
  kind: MemoryKind
  content: string
  /** 来源：会话 id / 用户明说 / 工具结果 */
  source: string
}

/** 文件里实际存的字段名保持中文，和旧数据对齐 */
interface RawRecord {
  id?: string
  编号?: string
  时间?: string
  类别?: string
  内容?: string
  来源?: string
}

export function memoryDir(dataDir: string): string {
  return path.join(dataDir, '记忆')
}

export function memoryFile(dataDir: string, kind: MemoryKind): string {
  return path.join(memoryDir(dataDir), FILE_NAME[kind])
}

function toRecord(raw: RawRecord, kind: MemoryKind): MemoryRecord | null {
  const content = raw.内容 ?? ''
  if (!content.trim()) return null
  return {
    id: raw.id ?? raw.编号 ?? '',
    time: raw.时间 ?? '',
    kind,
    content,
    source: raw.来源 ?? '',
  }
}

/** 读一份记忆。文件不存在 / 损坏都返回空数组，不抛。 */
export function readMemory(dataDir: string, kind: MemoryKind): MemoryRecord[] {
  const file = memoryFile(dataDir, kind)
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => toRecord(item as RawRecord, kind))
      .filter((item): item is MemoryRecord => item !== null)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[记忆] 读不动 ' + file + '：' + (err as Error).message)
    }
    return []
  }
}

function writeMemory(dataDir: string, kind: MemoryKind, records: MemoryRecord[]): void {
  const file = memoryFile(dataDir, kind)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const raw: RawRecord[] = records.map((r) => ({
    编号: r.id,
    时间: r.time,
    类别: r.kind,
    内容: r.content,
    来源: r.source,
  }))
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n', 'utf8')
}

/** 追加一条记忆，返回写入后的记录。 */
export function appendMemory(
  dataDir: string,
  kind: MemoryKind,
  content: string,
  source = '对话',
): MemoryRecord {
  const trimmed = content.trim()
  const record: MemoryRecord = {
    id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    kind,
    content: trimmed,
    source,
  }
  const all = readMemory(dataDir, kind)
  all.push(record)
  writeMemory(dataDir, kind, all)
  return record
}

/**
 * 把记忆渲染成提示词里的几行。
 * 只取最近的若干条 —— 记忆不是越多越好，堆满了反而稀释注意力。
 */
export function formatForPrompt(records: MemoryRecord[], limit = 20): string {
  const recent = records.slice(-limit)
  return recent
    .map((r) => {
      const day = r.time ? r.time.slice(0, 10) : ''
      return day ? `· [${day}] ${r.content}` : `· ${r.content}`
    })
    .join('\n')
}

/**
 * 从模型输出里摘出记事标记。
 *   [记住:xxx]  → facts
 *   [经历:xxx]  → experiences
 * 返回清洗后的正文（标记已移除）与待写入的条目。
 */
export function extractMarkers(text: string): {
  cleaned: string
  pending: Array<{ kind: MemoryKind; content: string }>
} {
  const pending: Array<{ kind: MemoryKind; content: string }> = []
  let cleaned = text

  const patterns: Array<{ kind: MemoryKind; re: RegExp }> = [
    { kind: 'facts', re: /\[记住[:：]\s*([^\]\n]+)\]/g },
    { kind: 'experiences', re: /\[经历[:：]\s*([^\]\n]+)\]/g },
  ]

  for (const { kind, re } of patterns) {
    cleaned = cleaned.replace(re, (_m, body: string) => {
      const content = String(body).trim()
      if (content) pending.push({ kind, content })
      return ''
    })
  }

  return { cleaned: cleaned.replace(/[ \t]+\n/g, '\n').trim(), pending }
}
