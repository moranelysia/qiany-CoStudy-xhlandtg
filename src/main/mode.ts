/**
 * 模式：chat / work（P5 第一步）。
 *
 * 【为什么要有模式】
 *   权限三档（read/write/exec）之前只是字段，没有任何地方真正执行它。
 *   现在按模式收口：
 *     chat —— 只给 read 工具（查时间、作图、检索）。聊天就是聊天，不该动文件。
 *     work —— 才允许 write（写笔记）和 exec（跑代码）。
 *
 *   默认 chat：**默认给最低权限**，要用更强能力得自己切过去。
 *
 * 【为什么存文件而不是内存】
 *   模式影响"模型能看到哪些工具"，重启后要保持一致，否则用户切到 work 写了一半，
 *   重启后变成 chat，工具突然消失会让人困惑。
 */
import fs from 'node:fs'
import path from 'node:path'

export type AgentMode = 'chat' | 'work'

export interface ModeState {
  mode: AgentMode
}

const FILE = '模式.json'

function file(dataDir: string): string {
  return path.join(dataDir, FILE)
}

export function readMode(dataDir: string): AgentMode {
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as ModeState | null
    return parsed?.mode === 'work' ? 'work' : 'chat'
  } catch {
    return 'chat'
  }
}

export function setMode(dataDir: string, mode: AgentMode): AgentMode {
  const next: AgentMode = mode === 'work' ? 'work' : 'chat'
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify({ mode: next }, null, 2), 'utf8')
  } catch {
    /* 写不进去只影响持久化 */
  }
  return next
}

/** 这个模式允许哪几档权限 —— 唯一的收口点 */
export function allowedPermissions(mode: AgentMode): Array<'read' | 'write' | 'exec'> {
  return mode === 'work' ? ['read', 'write', 'exec'] : ['read']
}

export function describeMode(mode: AgentMode): string {
  return mode === 'work' ? '工作' : '聊天'
}
