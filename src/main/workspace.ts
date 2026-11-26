/**
 * 代码工作区：模型跑代码时**可以自由读写**的那个目录。
 *
 * 用户选过的路径保存在 `记忆/工作区.json`，默认路径由 config.ts 决定。
 * 为什么单独存一份而不是塞进 settings：工作区是路径策略，和密钥那套是两回事，
 * 混在一起以后想按项目切换会很难拆。
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = '工作区.json'

/** 读当前工作区；文件坏了/没设就退回默认值（并且**不**因为读失败就报错） */
export function readWorkspace(dataDir: string, fallback: string): string {
  try {
    const raw = fs.readFileSync(path.join(dataDir, FILE), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as { root?: unknown } | null
    const root = parsed && typeof parsed.root === 'string' ? parsed.root.trim() : ''
    if (root) return path.resolve(fallback, root)
  } catch {
    /* 走默认 */
  }
  return fallback
}

/** 改工作区（顺手把目录建出来，否则第一次跑代码会报 ENOENT） */
export function setWorkspace(dataDir: string, root: string, fallback: string): string {
  const raw = String(root ?? '').trim()
  const next = path.resolve(fallback, raw)
  try {
    fs.mkdirSync(next, { recursive: true })
  } catch {
    /* 建不出来先记着，跑的时候还会再试 */
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, FILE), JSON.stringify({ root: next }, null, 2), 'utf8')
  } catch {
    /* 写不进去只影响持久化 */
  }
  return next
}

/** 确认目录存在（每次执行前调，用户可能手删了） */
export function ensureWorkspace(dir: string): string {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* 忽略 */
  }
  return dir
}
