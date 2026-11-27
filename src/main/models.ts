/**
 * 多模型配置（P0）。
 *
 * 以前 `settings.ts` 只有一套 {apiKey, baseUrl, model}，换模型就得覆盖原来的。
 * 这里改成"配置列表 + 当前选中"，可以同时放：DeepSeek 官方、本地 Ollama、中转站…
 * 每个配置还能标用途（chat / work），后面分模式调用时会用到。
 *
 * 兼容：第一次读时如果只有老的 `记忆/settings.json`，自动把它迁移成一条 profile，
 * 老的密钥加密数据原样搬过来（`enc:` 前缀，safeStorage 解）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'

export interface ModelProfile {
  id: string
  label: string
  baseUrl: string
  model: string
  /** 加密后的密钥；空表示不需要（本地模型） */
  keyRef: string
  /** 用途标签，界面展示 + 未来分模式路由 */
  useFor: string[]
}

export interface ModelsFile {
  active: string
  profiles: ModelProfile[]
}

const FILE = 'models.json'
// 真实位置是 记忆/设置/模型.json（见 settings.ts 的 settingsFile）
const LEGACY_DIR = '设置'
const LEGACY = '模型.json'

const DEFAULT_PROFILE: ModelProfile = {
  id: 'deepseek',
  label: 'DeepSeek 官方',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  keyRef: '',
  useFor: ['chat', 'work'],
}

function modelsFile(dataDir: string): string {
  return path.join(dataDir, FILE)
}

function enc(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  } catch {
    /* 退回明文 */
  }
  return 'raw:' + Buffer.from(plain, 'utf8').toString('base64')
}

export function decKey(keyRef: string): string {
  if (!keyRef) return ''
  try {
    if (keyRef.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(keyRef.slice(4), 'base64'))
    if (keyRef.startsWith('raw:')) return Buffer.from(keyRef.slice(4), 'base64').toString('utf8')
  } catch {
    /* 换机器解不开 */
  }
  return ''
}

/** 老 settings.json 里的密钥字段叫 key（同样是 enc: 前缀） */
function migrateLegacy(dataDir: string): ModelsFile | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir, LEGACY_DIR, LEGACY), 'utf8').replace(/^\uFEFF/, '')
    const old = JSON.parse(raw) as { baseUrl?: string; model?: string; key?: string } | null
    if (!old || typeof old !== 'object') return null
    const profile: ModelProfile = {
      id: 'deepseek',
      label: 'DeepSeek 官方',
      baseUrl: typeof old.baseUrl === 'string' && old.baseUrl ? old.baseUrl : DEFAULT_PROFILE.baseUrl,
      model: typeof old.model === 'string' && old.model ? old.model : DEFAULT_PROFILE.model,
      keyRef: typeof old.key === 'string' && old.key
        ? old.key.includes(':') ? old.key : 'enc:' + old.key
        : '',
      useFor: ['chat', 'work'],
    }
    return { active: profile.id, profiles: [profile] }
  } catch {
    return null
  }
}

export function readSavedProfiles(dataDir: string): ModelsFile | null {
  try {
    const raw = fs.readFileSync(modelsFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as ModelsFile | null
    if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) {
      const profiles = parsed.profiles.filter((p) => p && typeof p.id === 'string' && p.id)
      if (profiles.length) {
        const active = profiles.some((p) => p.id === parsed.active) ? parsed.active : profiles[0].id
        return { active, profiles }
      }
    }
  } catch {
    /* 继续走迁移 / 默认 */
  }
  return null
}

export function readModels(dataDir: string): ModelsFile {
  return readSavedProfiles(dataDir) ?? migrateLegacy(dataDir) ?? { active: DEFAULT_PROFILE.id, profiles: [{ ...DEFAULT_PROFILE }] }
}

function write(dataDir: string, file: ModelsFile): void {
  fs.mkdirSync(dataDir, { recursive: true })
  const target = modelsFile(dataDir)
  const temp = target + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(file, null, 2), 'utf8')
  fs.renameSync(temp, target)
}

/** 修改已有配置的连接字段。密钥由调用方加密。 */
export function updateProfileConnection(
  dataDir: string,
  file: ModelsFile,
  id: string,
  patch: Partial<Pick<ModelProfile, 'baseUrl' | 'model' | 'keyRef'>>,
): void {
  write(dataDir, {
    ...file,
    profiles: file.profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile),
  })
}

/** 给界面看：密钥只留 hasKey */
export interface ModelProfileView {
  id: string
  label: string
  baseUrl: string
  model: string
  hasKey: boolean
  useFor: string[]
  active: boolean
}

export function describeModels(dataDir: string): { active: string; profiles: ModelProfileView[] } {
  const file = readModels(dataDir)
  return {
    active: file.active,
    profiles: file.profiles.map((p) => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      model: p.model,
      hasKey: Boolean(p.keyRef),
      useFor: Array.isArray(p.useFor) ? p.useFor : [],
      active: p.id === file.active,
    })),
  }
}

/** 保存一条配置（id 不传就是新增）。apiKey 传 undefined 表示不改，传空串表示清空。 */
export function upsertProfile(
  dataDir: string,
  input: { id?: string; label?: string; baseUrl?: string; model?: string; apiKey?: string; useFor?: string[] },
): ModelsFile {
  const file = readModels(dataDir)
  const id = input.id && input.id.trim() ? input.id.trim() : 'm-' + Date.now().toString(36)
  const existing = file.profiles.find((p) => p.id === id)
  const next: ModelProfile = {
    id,
    label: (input.label ?? existing?.label ?? '未命名配置').trim() || '未命名配置',
    baseUrl: (input.baseUrl ?? existing?.baseUrl ?? DEFAULT_PROFILE.baseUrl).trim() || DEFAULT_PROFILE.baseUrl,
    model: (input.model ?? existing?.model ?? DEFAULT_PROFILE.model).trim() || DEFAULT_PROFILE.model,
    keyRef: input.apiKey === undefined ? (existing?.keyRef ?? '') : enc(input.apiKey),
    useFor: Array.isArray(input.useFor) ? input.useFor : (existing?.useFor ?? ['chat']),
  }
  const profiles = existing ? file.profiles.map((p) => (p.id === id ? next : p)) : [...file.profiles, next]
  const result: ModelsFile = { active: file.active || id, profiles }
  write(dataDir, result)
  return result
}

export function removeProfile(dataDir: string, id: string): ModelsFile {
  const file = readModels(dataDir)
  const profiles = file.profiles.filter((p) => p.id !== id)
  if (!profiles.length) return file
  const active = profiles.some((p) => p.id === file.active) ? file.active : profiles[0].id
  const result: ModelsFile = { active, profiles }
  write(dataDir, result)
  return result
}

export function activateProfile(dataDir: string, id: string): ModelsFile {
  const file = readModels(dataDir)
  if (!file.profiles.some((p) => p.id === id)) return file
  const result: ModelsFile = { ...file, active: id }
  write(dataDir, result)
  return result
}

/** 给 LLM 客户端用：当前选中的那套解密后的配置 */
/**
 * 按用途挑模型：'chat'（伴学对话）/ 'work'（工作区、跑代码）。
 *
 * ⚠ 优先级的第一条必须是 **active**：只要当前选中的配置声明了自己能用于这个用途，
 *   就用它。否则用户新增一条 "只给 chat 用" 的配置（比如本地 Ollama），
 *   会把正在用的云端配置顶掉 —— 2026-10-31 真踩到过：加了条 Ollama 之后
 *   聊天全线没回复（本地服务没起）。专项配置只在 active 不覆盖该用途时才生效。
 */
export function activeModelFor(dataDir: string, useFor: 'chat' | 'work'): { apiKey: string; baseUrl: string; model: string; id: string } {
  const file = readModels(dataDir)
  const active = file.profiles.find((p) => p.id === file.active)
  const covers = (p: typeof active): boolean => Boolean(p && Array.isArray(p.useFor) && p.useFor.includes(useFor))
  const exact = file.profiles.find((p) => Array.isArray(p.useFor) && p.useFor.length === 1 && p.useFor[0] === useFor)
  const anyUse = file.profiles.find((p) => Array.isArray(p.useFor) && p.useFor.includes(useFor))
  const profile = (covers(active) ? active : exact) ?? anyUse ?? active ?? file.profiles[0] ?? DEFAULT_PROFILE
  return {
    apiKey: decKey(profile.keyRef),
    baseUrl: profile.baseUrl || DEFAULT_PROFILE.baseUrl,
    model: profile.model || DEFAULT_PROFILE.model,
    id: profile.id,
  }
}

export function activeModel(dataDir: string): { apiKey: string; baseUrl: string; model: string } {
  const file = readModels(dataDir)
  const profile = file.profiles.find((p) => p.id === file.active) ?? file.profiles[0] ?? DEFAULT_PROFILE
  return {
    apiKey: decKey(profile.keyRef),
    baseUrl: profile.baseUrl || DEFAULT_PROFILE.baseUrl,
    model: profile.model || DEFAULT_PROFILE.model,
  }
}
