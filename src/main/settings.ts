import { activeModel, activeModelFor } from './models'
/**
 * 设置与密钥（方案表 P2，方案：应用内设置页 + 系统加密存储）。
 *
 * 【为什么不用明文存 key】
 *   明文 JSON 放在用户目录里，任何进程、任何同步盘都能读到。
 *   Electron 自带 safeStorage：Windows 上用 DPAPI 绑定当前用户，
 *   拷到别的机器就解不开 —— 这是"不把钥匙写在纸上"的最低成本做法。
 *
 * 【为什么主进程从不把明文吐给界面】
 *   界面只需要知道「配没配」和「测试连接的结果」。
 *   真要把 key 回显到渲染进程，一次 XSS 或者一次 console 打印就泄露。
 *   所以 IPC 只回 `hasKey`，输入框永远是空的（占位符写"已配置"）。
 *
 * 【为什么 env 仍然优先】
 *   CI、临时调试、多账号切换时改环境变量最快。
 *   优先级：环境变量 > 加密文件 > 无（离线桩）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

export interface LlmSettings {
  baseUrl: string
  model: string
  /** 是否已保存过密钥（不返回明文） */
  hasKey: boolean
  /** 密钥来源：env / stored / none */
  source: 'env' | 'stored' | 'none'
}

interface StoredShape {
  version: 1
  /** base64(safeStorage 加密后的密文) */
  key: string
  baseUrl: string
  model: string
  updatedAt: string
}

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
// 默认模型：deepseek-flash。
//
// 取值来源是**服务端返回的报错**，不是猜的：
//   "The supported API model names are deepseek-flash, deepseek-v4-pro,
//    but you passed deepseek-v4.1-flash"
// 所以 v4.1-flash 这个名字不存在，真实 id 是 deepseek-flash。
export const DEFAULT_MODEL = 'deepseek-flash'

/** 服务端不认的旧 id → 归一到当前默认值，避免老设置一直报 400 */
const OBSOLETE_MODELS: Record<string, string> = {
  'deepseek-v4.1-flash': DEFAULT_MODEL,
  'deepseek-v4.1': DEFAULT_MODEL,
}

/**
 * 模型能不能看图。
 *
 * 只按名字判断 —— 这是**唯一**不用真发一次请求就能知道的办法，
 * 而且判断错的方向是安全的一侧：判成"不能看"最多多问一句，
 * 判成"能看"却发过去，DeepSeek 官方模型会直接 400。
 */
export function visionCapable(model: string): boolean {
  const m = String(model || '').toLowerCase()
  if (!m) return false
  // 明确的视觉型号
  if (/(^|[-_/])(vl|vision|multimodal|omni)([-_/]|$)/.test(m)) return true
  if (/gpt-4o|gpt-4\.1|gpt-5|gemini|claude|qwen.*vl|internvl|llava|glm-4v|minicpm-v/.test(m)) return true
  /* DeepSeek 的 flash 是**能看图**的。
   * 原来的注释写"DeepSeek 官方现在是纯文本"，那是过时结论，把能看图的模型当成了瞎子 ——
   * 表现就是"发图过去，模型说它看不了图"（2026-11-02 用户反馈）。
   * 实测依据：`run.cmd --x1` 真的发了一张 1×1 PNG 给 deepseek-flash，
   * 返回 HTTP 200 且回答了颜色（"粉红色"），不是 400。
   * 其他 deepseek 型号（chat / reasoner）没验过，保持保守。 */
  if (/deepseek-(flash|vl)/.test(m)) return true
  return false
}

export function normalizeModel(id: string | undefined): string {
  const value = (id ?? '').trim()
  if (!value) return DEFAULT_MODEL
  return OBSOLETE_MODELS[value] ?? value
}

export function settingsDir(dataDir: string): string {
  return path.join(dataDir, '设置')
}

export function settingsFile(dataDir: string): string {
  return path.join(settingsDir(dataDir), '模型.json')
}

function readStored(dataDir: string): StoredShape | null {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(dataDir), 'utf8').replace(/^\uFEFF/, ''))
    if (raw && typeof raw === 'object' && typeof raw.key === 'string') return raw as StoredShape
    return null
  } catch {
    return null
  }
}

/** 原子写：先写临时文件再改名，中途断电不会把原文件写坏（照 elysia 的做法） */
function writeStored(dataDir: string, value: StoredShape): void {
  const file = settingsFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

export interface SaveInput {
  apiKey?: string
  baseUrl?: string
  model?: string
}

/** 保存设置。apiKey 留空表示"不改密钥，只改其他项"。 */
export function saveSettings(dataDir: string, input: SaveInput): { ok: boolean; error?: string } {
  const current = readStored(dataDir)

  let encrypted = current?.key ?? ''
  if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: '这台机器上不可用系统加密（safeStorage），拒绝以明文保存密钥' }
    }
    encrypted = safeStorage.encryptString(input.apiKey.trim()).toString('base64')
  }

  const next: StoredShape = {
    version: 1,
    key: encrypted,
    baseUrl: (input.baseUrl ?? current?.baseUrl ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
    model: (input.model ?? current?.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    updatedAt: new Date().toISOString(),
  }
  writeStored(dataDir, next)
  return { ok: true }
}

/** 清掉密钥（其他设置保留） */
export function clearKey(dataDir: string): void {
  const current = readStored(dataDir)
  if (!current) return
  writeStored(dataDir, { ...current, key: '', updatedAt: new Date().toISOString() })
}

/** 解密后的密钥，只在主进程内部使用，绝不外传 */
export function readSecretKey(dataDir: string): string {
  const stored = readStored(dataDir)
  if (!stored?.key) return ''
  try {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(stored.key, 'base64'))
  } catch {
    return ''
  }
}

/** 生效的模型配置（不带密钥） */
export function describeSettings(dataDir: string): LlmSettings {
  const envKey = process.env['COSTUDY_LLM_API_KEY'] ?? process.env['DEEPSEEK_API_KEY'] ?? ''
  const stored = readStored(dataDir)
  const storedKey = stored?.key ? 'yes' : ''
  return {
    baseUrl: process.env['COSTUDY_LLM_BASE_URL'] ?? activeModel(dataDir).baseUrl ?? stored?.baseUrl ?? DEFAULT_BASE_URL,
    model: normalizeModel(process.env['COSTUDY_LLM_MODEL'] ?? activeModel(dataDir).model ?? stored?.model),
    hasKey: Boolean(envKey || storedKey),
    source: envKey ? 'env' : storedKey ? 'stored' : 'none',
  }
}

/** 给 createClient 用的最终配置 */
export function resolveLlmConfig(dataDir: string, mode: 'chat' | 'work' = 'chat'): {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
} {
  const envKey = process.env['COSTUDY_LLM_API_KEY'] ?? process.env['DEEPSEEK_API_KEY'] ?? ''
  // P0：多模型配置优先（models.json 里选中的那条）；没有就用老的单配置
  // 按用途挑（chat / work 可以用不同模型）；没配 useFor 就仍走 active
  const multi = activeModelFor(dataDir, mode)
  const stored = readStored(dataDir)
  return {
    apiKey: envKey || multi.apiKey || readSecretKey(dataDir),
    baseUrl: process.env['COSTUDY_LLM_BASE_URL'] ?? multi.baseUrl ?? stored?.baseUrl ?? DEFAULT_BASE_URL,
    model: process.env['COSTUDY_LLM_MODEL'] ?? multi.model ?? stored?.model ?? DEFAULT_MODEL,
    timeoutMs: Number(process.env['COSTUDY_LLM_TIMEOUT_MS'] ?? 30000),
  }
}

/** 启动时确认 safeStorage 可用性，不可用要早说 */
export function encryptionStatus(): { available: boolean; backend: string } {
  const available = (() => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  })()
  const backend =
    process.platform === 'win32' ? 'DPAPI（绑定当前 Windows 用户）' : process.platform === 'darwin' ? 'Keychain' : 'libsecret'
  return { available, backend }
}

export function appNameForDialog(): string {
  return app.getName()
}
