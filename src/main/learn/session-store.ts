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
import { loadSessionState, moveTo, PHASE_LABEL, saveSession, type Phase } from './session'

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
  /** 这条回复用到了哪些工具（界面据此显示标记）；老消息没有这个字段 */
  tools?: string[]
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
  tools?: string[],
): { ok: boolean; meta?: SessionMeta; error?: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '空消息' }

  const index = readIndex(dataDir)
  const meta = index.items.find((s) => s.id === id)
  if (!meta) return { ok: false, error: '会话不存在' }

  try {
    const file = logFile(dataDir, id)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const line = JSON.stringify(tools && tools.length ? { role, text: trimmed, at: nowIso(), tools } : { role, text: trimmed, at: nowIso() })
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

  const result = moveTo(loadSessionState(dataDir, meta, ''), to)
  if (!result.ok) return { ok: false, error: result.error }

  // 完整状态也要落盘：只写索引的话，points / trail 在推进这一步就丢了
  saveSession(dataDir, result.state)

  meta.phase = result.state.phase
  meta.updatedAt = nowIso()
  writeIndex(dataDir, index)
  return { ok: true, phase: meta.phase }
}

/**
 * 清空一条会话里的聊天记录（会话本身保留 —— 界面不用换 id、不用重建）。
 *
 * 三个决定：
 *  1. **不直接删文件**，把它挪进 `会话/已删除/`。清空是不可撤销的动作，
 *     而用户的会话是他自己一个字一句话攒出来的；留一份能捞回来的副本，成本只有一个文件。
 *  2. 备份放进**子目录**：retrieval.ts 只扫 `会话/*.jsonl`（不递归），
 *     所以删掉的记录不会再被 BM25 召回、不会偷偷影响后面的回答。
 *  3. 索引跟着归零：count / title / phase / point 一起回到"刚开场"，
 *     否则会出现"界面上一条没有、状态却停在逐点教学"这种自相矛盾的状态。
 */
export function clearMessages(
  dataDir: string,
  id: string,
): { ok: boolean; removed: number; backup?: string; error?: string } {
  const index = readIndex(dataDir)
  const meta = index.items.find((s) => s.id === id) ?? index.items.find((s) => s.id === index.currentId)
  if (!meta) return { ok: false, removed: 0, error: '会话不存在' }

  const file = logFile(dataDir, meta.id)
  const removed = loadMessages(dataDir, meta.id).length
  try {
    let backup: string | undefined
    if (fs.existsSync(file)) {
      const dir = path.join(chatDir(dataDir), '已删除')
      fs.mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      backup = path.join(dir, meta.id + '-' + stamp + '-' + Math.random().toString(36).slice(2, 5) + '.jsonl')
      fs.renameSync(file, backup)
    }
    meta.count = 0
    meta.title = '新会话'
    meta.phase = 'opening'
    meta.point = ''
    meta.updatedAt = nowIso()
    writeIndex(dataDir, index)
    return { ok: true, removed, backup }
  } catch (err) {
    return { ok: false, removed: 0, error: (err as Error).message }
  }
}

/** 删掉一条会话（连日志一起）。会话列表以后要做"删除"就需要它；自检也用它收尾。 */
export function removeSession(dataDir: string, id: string): boolean {
  const index = readIndex(dataDir)
  const at = index.items.findIndex((s) => s.id === id)
  if (at < 0) return false
  index.items.splice(at, 1)
  if (index.currentId === id) index.currentId = index.items[0]?.id ?? ''
  try {
    writeIndex(dataDir, index)
    const file = logFile(dataDir, id)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return true
  } catch {
    return false
  }
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
