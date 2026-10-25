/**
 * 会话存储（P1 的第一半：消息落盘 + 多会话 + 状态机）。
 *
 * 为什么照 elysia 的结构做（`聊天记录.jsonl` + `对话索引.json`）：
 *   这是原项目里唯一"被长期使用验证过"的部分：
 *     · 消息追加写 jsonl —— 单条坏了不影响其它行，出问题能逐行看
 *     · 一个索引文件记"有哪些会话、当前是哪条" —— 比扫目录猜要稳
 *
 * 为什么状态机也放这里：
 *   会话的 phase 必须和消息一起落盘。否则重启后"学到第几步"就丢了，
 *   会出现"刚讲完检验，重启又让从开场来一遍"的怪事。
 *
 * 轻量化原则（方案表 §9.2）：
 *   不引数据库、不建向量、不做模型摘要。就是两个文本文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { moveTo, PHASE_LABEL, type Phase } from './session'

export interface SessionMeta {
  id: string
  title: string
  phase: Phase
  createdAt: string
  updatedAt: string
  /** 消息条数，界面列表直接显示 */
  count: number
  /** 当前在讲哪个知识点（P1 的最小版指针） */
  point: string
}

interface IndexShape {
  version: 1
  currentId: string
  items: SessionMeta[]
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  at: string
}

export function chatDir(dataDir: string): string {
  return path.join(dataDir, '会话')
}

function indexFile(dataDir: string): string {
  return path.join(chatDir(dataDir), '索引.json')
}

export function logFile(dataDir: string, id: string): string {
  return path.join(chatDir(dataDir), id + '.jsonl')
}

function readIndex(dataDir: string): IndexShape {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(dataDir), 'utf8').replace(/^\uFEFF/, ''))
    if (raw && Array.isArray(raw.items)) return raw as IndexShape
  } catch {
    /* 坏文件当空索引 */
  }
  return { version: 1, currentId: '', items: [] }
}

/** 索引原子写：临时文件 + rename */
function writeIndex(dataDir: string, index: IndexShape): void {
  const file = indexFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
}

export function listSessions(dataDir: string): SessionMeta[] {
  return readIndex(dataDir).items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function currentSession(dataDir: string): SessionMeta | null {
  const index = readIndex(dataDir)
  return index.items.find((s) => s.id === index.currentId) ?? index.items[0] ?? null
}

/** 新建会话并设为当前；空 title 用时间占位，第一条用户消息后会被覆盖 */
export function createSession(dataDir: string, title = ''): SessionMeta {
  const index = readIndex(dataDir)
  const at = nowIso()
  const meta: SessionMeta = {
    id: newId(),
    title: title.trim() || '新会话',
    phase: 'opening',
    createdAt: at,
    updatedAt: at,
    count: 0,
    point: '',
  }
  index.items.push(meta)
  index.currentId = meta.id
  writeIndex(dataDir, index)
  return meta
}

export function setCurrent(dataDir: string, id: string): boolean {
  const index = readIndex(dataDir)
  if (!index.items.some((s) => s.id === id)) return false
  index.currentId = id
  writeIndex(dataDir, index)
  return true
}

/** 当前会话不存在就建一个 —— 界面永远不愁"没有会话可用" */
export function ensureSession(dataDir: string): SessionMeta {
  return currentSession(dataDir) ?? createSession(dataDir)
}

export function loadMessages(dataDir: string, id: string): Message[] {
  try {
    const raw = fs.readFileSync(logFile(dataDir, id), 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          const item = JSON.parse(line) as Message
          return item && typeof item.text === 'string' ? item : null
        } catch {
          return null
        }
      })
      .filter((item): item is Message => item !== null)
  } catch {
    return []
  }
}

/**
 * 追加一条消息（只 append，不改历史）。
 * 同时更新索引里的 count / updatedAt / title（首条用户消息当标题）。
 */
export function appendMessage(
  dataDir: string,
  id: string,
  role: Message['role'],
  text: string,
): { ok: boolean; meta?: SessionMeta; error?: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '空消息' }

  const index = readIndex(dataDir)
  const meta = index.items.find((s) => s.id === id)
  if (!meta) return { ok: false, error: '会话不存在' }

  try {
    const file = logFile(dataDir, id)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const line = JSON.stringify({ role, text: trimmed, at: nowIso() })
    fs.appendFileSync(file, line + '\n', 'utf8')

    const firstUser = role === 'user' && meta.count === 0
    meta.count += 1
    meta.updatedAt = nowIso()
    if (firstUser) meta.title = trimmed.slice(0, 24)
    writeIndex(dataDir, index)
    return { ok: true, meta }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** 推进阶段（非法转移返回原因，不抛异常） */
export function advancePhase(
  dataDir: string,
  id: string,
  to: Phase,
): { ok: boolean; phase?: Phase; error?: string } {
  const index = readIndex(dataDir)
  const meta = index.items.find((s) => s.id === id)
  if (!meta) return { ok: false, error: '会话不存在' }

  const result = moveTo(
    {
      id: meta.id,
      goal: '',
      stage: '',
      phase: meta.phase,
      points: [],
      activeIndex: 0,
      weaknesses: [],
      startedAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      trail: [],
    },
    to,
  )
  if (!result.ok) return { ok: false, error: result.error }

  meta.phase = result.state.phase
  meta.updatedAt = nowIso()
  writeIndex(dataDir, index)
  return { ok: true, phase: meta.phase }
}

/** 给界面用的一行摘要 */
export function describeSession(meta: SessionMeta): string {
  return PHASE_LABEL[meta.phase] + ' · ' + meta.count + ' 条 · ' + meta.title
}

/**
 * 设置"当前在讲哪个知识点"。
 *
 * 这是 P1 的最小版：不做整棵树，先让会话知道自己在讲哪一点 ——
 * 否则判定结果只能记到「本轮练习」这种占位名下，知识点表永远是一堆垃圾。
 */
export function setSessionPoint(dataDir: string, id: string, point: string): boolean {
  const index = readIndex(dataDir)
  const meta = index.items.find((s) => s.id === id)
  if (!meta) return false
  meta.point = point.trim().slice(0, 40)
  meta.updatedAt = nowIso()
  writeIndex(dataDir, index)
  return true
}
