/**
 * 草稿卡（M3 生成即存）。
 *
 * 问题：M3「聊出来」生成的是草稿，不点「就这个」就丢了 ——
 * 用户试十个角色，关掉面板全没了，token 白花，也回不去看。
 *
 * 做法：生成成功就落一份草稿到 `记忆/草稿/<id>.json`：
 *   · 不进角色列表（不污染），单独一份"最近生成"
 *   · 采用时把草稿字段灌进当前卡，然后删掉草稿
 *   · 草稿是纯 JSON，不进 V2 卡格式 —— 它本来就不是卡
 */
import fs from 'node:fs'
import path from 'node:path'

export interface DraftRecord {
  id: string
  brief: string
  createdAt: string
  /** 生成耗时 */
  ms: number
  /** 是否用了外部资料 */
  usedSearch: boolean
  /** 资料出处（用户贴的链接等） */
  sources: string[]
  /** 角色卡字段（与 CardDraft 一致） */
  draft: Record<string, string>
  /** 伴学示例：同一道题用该角色口吻讲一段 */
  sample: string
}

export function draftDir(dataDir: string): string {
  return path.join(dataDir, '草稿')
}

export function saveDraft(dataDir: string, record: Omit<DraftRecord, 'id' | 'createdAt'>): DraftRecord {
  const dir = draftDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  const id = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
  const full: DraftRecord = { ...record, id, createdAt: new Date().toISOString() }

  const file = path.join(dir, id + '.json')
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(full, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return full
}

export function listDrafts(dataDir: string): DraftRecord[] {
  try {
    const dir = draftDir(dataDir)
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as DraftRecord
        } catch {
          return null
        }
      })
      .filter((d): d is DraftRecord => d !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export function readDraft(dataDir: string, id: string): DraftRecord | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(draftDir(dataDir), id + '.json'), 'utf8')) as DraftRecord
  } catch {
    return null
  }
}

/** 采用后删草稿；删不掉不影响主流程，返回是否删了 */
export function dropDraft(dataDir: string, id: string): boolean {
  try {
    fs.unlinkSync(path.join(draftDir(dataDir), id + '.json'))
    return true
  } catch {
    return false
  }
}
