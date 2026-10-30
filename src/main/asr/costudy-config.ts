/**
 * ASR（语音输入）配置。
 *
 * 引擎实现搬自 Cyrene-Agent（MIT），三种：阿里云实时语音、MiniMax、Mossland。
 * 密钥同样用 safeStorage 加密后落 `记忆/asr.json`。
 *
 * 注意：`asr-config.ts` 里那套 `setAsrConfig/getAsrConfig` 是引擎们读取配置的入口，
 * 这里在每次读写时把它刷新，保证 dispatcher 拿到的和界面看到的是同一份。
 */
import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import { setAsrConfig, type AsrConfig } from './asr-config'

export type AsrEngine = 'off' | 'aliyun' | 'mossland' | 'minimax'

export interface AsrSettings {
  engine: AsrEngine
  language: string
  aliyun: { appKey: string; accessKeyId: string; accessKeySecret: string }
  mossland: { apiKey: string }
  minimax: { apiKey: string }
}

export interface AsrSettingsView {
  engine: AsrEngine
  language: string
  aliyun: { hasKeys: boolean }
  mossland: { hasKey: boolean }
  minimax: { hasKey: boolean }
}

const FILE = 'asr.json'

const DEFAULTS: AsrSettings = {
  engine: 'off',
  language: 'zh',
  aliyun: { appKey: '', accessKeyId: '', accessKeySecret: '' },
  mossland: { apiKey: '' },
  minimax: { apiKey: '' },
}

function file(dataDir: string): string {
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

function dec(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8')
  } catch {
    /* 换机器解不开 */
  }
  return ''
}

/** 把当前配置喂给引擎们 */
function sync(asr: AsrSettings): void {
  if (asr.engine === 'off') {
    setAsrConfig(() => null)
    return
  }
  if (asr.engine === 'aliyun') {
    const cfg: AsrConfig = {
      engine: 'aliyun',
      appKey: asr.aliyun.appKey,
      accessKeyId: asr.aliyun.accessKeyId,
      accessKeySecret: asr.aliyun.accessKeySecret,
      language: asr.language,
    }
    setAsrConfig(() => cfg)
    return
  }
  if (asr.engine === 'mossland') {
    const cfg: AsrConfig = { engine: 'mossland', apiKey: asr.mossland.apiKey }
    setAsrConfig(() => cfg)
    return
  }
  const cfg: AsrConfig = { engine: 'minimax', apiKey: asr.minimax.apiKey }
  setAsrConfig(() => cfg)
}

export function readAsrSettings(dataDir: string): AsrSettings {
  const next: AsrSettings = JSON.parse(JSON.stringify(DEFAULTS)) as AsrSettings
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (parsed && typeof parsed === 'object') {
      const engine = parsed['engine']
      if (engine === 'off' || engine === 'aliyun' || engine === 'mossland' || engine === 'minimax') {
        next.engine = engine
      }
      if (typeof parsed['language'] === 'string' && parsed['language']) next.language = parsed['language']
      const pick = (obj: unknown, key: string): string => {
        if (!obj || typeof obj !== 'object') return ''
        const v = (obj as Record<string, unknown>)[key]
        return typeof v === 'string' ? dec(v) : ''
      }
      next.aliyun = {
        appKey: pick(parsed['aliyun'], 'appKey'),
        accessKeyId: pick(parsed['aliyun'], 'accessKeyId'),
        accessKeySecret: pick(parsed['aliyun'], 'accessKeySecret'),
      }
      next.mossland = { apiKey: pick(parsed['mossland'], 'apiKey') }
      next.minimax = { apiKey: pick(parsed['minimax'], 'apiKey') }
    }
  } catch {
    /* 用默认值 */
  }
  sync(next)
  return next
}

export function saveAsrSettings(dataDir: string, patch: Partial<AsrSettings>): AsrSettings {
  const cur = readAsrSettings(dataDir)
  const next: AsrSettings = {
    engine: patch.engine ?? cur.engine,
    language: patch.language ?? cur.language,
    aliyun: { ...cur.aliyun, ...(patch.aliyun ?? {}) },
    mossland: { ...cur.mossland, ...(patch.mossland ?? {}) },
    minimax: { ...cur.minimax, ...(patch.minimax ?? {}) },
  }
  const onDisk = {
    engine: next.engine,
    language: next.language,
    aliyun: {
      appKey: enc(next.aliyun.appKey),
      accessKeyId: enc(next.aliyun.accessKeyId),
      accessKeySecret: enc(next.aliyun.accessKeySecret),
    },
    mossland: { apiKey: enc(next.mossland.apiKey) },
    minimax: { apiKey: enc(next.minimax.apiKey) },
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify(onDisk, null, 2), 'utf8')
  } catch {
    /* 写不进去返回内存值 */
  }
  sync(next)
  return next
}

export function describeAsrSettings(dataDir: string): AsrSettingsView {
  const s = readAsrSettings(dataDir)
  return {
    engine: s.engine,
    language: s.language,
    aliyun: { hasKeys: Boolean(s.aliyun.appKey && s.aliyun.accessKeyId && s.aliyun.accessKeySecret) },
    mossland: { hasKey: Boolean(s.mossland.apiKey) },
    minimax: { hasKey: Boolean(s.minimax.apiKey) },
  }
}
