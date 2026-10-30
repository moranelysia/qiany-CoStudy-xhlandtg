/**
 * TTS 配置（引擎选择 + 各家密钥/音色）。
 *
 * 存在 `记忆/tts.json`；密钥字段用 Electron safeStorage 加密后再落盘（`enc:` 前缀）。
 * safeStorage 不可用时退回明文（`raw:` 前缀）—— 和 settings.ts 对模型 Key 的处理一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { TtsEngine } from './types'

export interface TtsVendorMinimax {
  apiKey: string
  voiceId: string
  model: string
}
export interface TtsVendorMossland {
  apiKey: string
  voiceId: string
  model: string
}
export interface TtsVendorGptsovits {
  baseUrl: string
  refAudioPath: string
  promptText: string
}
export interface TtsVendorCustomCloud {
  endpointUrl: string
  apiKey: string
  voiceId: string
}
export interface TtsVendorMimo {
  apiKey: string
  voiceAudioPath: string
  stylePrompt: string
}

export interface TtsConfig {
  engine: TtsEngine
  minimax: TtsVendorMinimax
  mossland: TtsVendorMossland
  gptsovits: TtsVendorGptsovits
  customCloud: TtsVendorCustomCloud
  mimo: TtsVendorMimo
}

/** 给渲染端看的版本：密钥只留"配没配"，绝不回明文 */
export interface TtsConfigView {
  engine: TtsEngine
  minimax: { voiceId: string; model: string; hasKey: boolean }
  mossland: { voiceId: string; model: string; hasKey: boolean }
  gptsovits: { baseUrl: string; refAudioPath: string; promptText: string; hasKey: false }
  customCloud: { endpointUrl: string; voiceId: string; hasKey: boolean }
  mimo: { voiceAudioPath: string; stylePrompt: string; hasKey: boolean }
}

const FILE = 'tts.json'

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  engine: 'off',
  minimax: { apiKey: '', voiceId: '', model: 'speech-2.8-turbo' },
  mossland: { apiKey: '', voiceId: '', model: 'moss-tts-1.5-flash' },
  gptsovits: { baseUrl: 'http://localhost:9880', refAudioPath: '', promptText: '' },
  customCloud: { endpointUrl: '', apiKey: '', voiceId: '' },
  mimo: { apiKey: '', voiceAudioPath: '', stylePrompt: '' },
}

function configFile(dataDir: string): string {
  return path.join(dataDir, FILE)
}

function encryptSecret(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* 落回明文 */
  }
  return 'raw:' + Buffer.from(plain, 'utf8').toString('base64')
}

function decryptSecret(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('raw:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf8')
    }
  } catch {
    /* 换机器解不开时当作没配 */
  }
  return ''
}

/** 读配置（密钥已解密，只给主进程内部用） */
export function readTtsConfig(dataDir: string): TtsConfig {
  const base: TtsConfig = JSON.parse(JSON.stringify(DEFAULT_TTS_CONFIG)) as TtsConfig
  try {
    const raw = fs.readFileSync(configFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<TtsConfig> | null
    if (!parsed || typeof parsed !== 'object') return base
    const engine = parsed.engine
    if (engine === 'off' || engine === 'minimax' || engine === 'mossland' || engine === 'gptsovits' || engine === 'custom-cloud' || engine === 'mimo') {
      base.engine = engine
    }
    const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
    base.minimax = {
      apiKey: decryptSecret(str(parsed.minimax?.apiKey, '')),
      voiceId: str(parsed.minimax?.voiceId, base.minimax.voiceId),
      model: str(parsed.minimax?.model, base.minimax.model) || base.minimax.model,
    }
    base.mossland = {
      apiKey: decryptSecret(str(parsed.mossland?.apiKey, '')),
      voiceId: str(parsed.mossland?.voiceId, ''),
      model: str(parsed.mossland?.model, base.mossland.model) || base.mossland.model,
    }
    base.gptsovits = {
      baseUrl: str(parsed.gptsovits?.baseUrl, base.gptsovits.baseUrl) || base.gptsovits.baseUrl,
      refAudioPath: str(parsed.gptsovits?.refAudioPath, ''),
      promptText: str(parsed.gptsovits?.promptText, ''),
    }
    base.customCloud = {
      endpointUrl: str(parsed.customCloud?.endpointUrl, ''),
      apiKey: decryptSecret(str(parsed.customCloud?.apiKey, '')),
      voiceId: str(parsed.customCloud?.voiceId, ''),
    }
    base.mimo = {
      apiKey: decryptSecret(str(parsed.mimo?.apiKey, '')),
      voiceAudioPath: str(parsed.mimo?.voiceAudioPath, ''),
      stylePrompt: str(parsed.mimo?.stylePrompt, ''),
    }
    return base
  } catch {
    return base
  }
}

/** 保存（密钥加密；空字符串表示"清空"） */
export function saveTtsConfig(dataDir: string, patch: Partial<TtsConfig>): TtsConfig {
  const current = readTtsConfig(dataDir)
  const next: TtsConfig = { ...current }
  if (patch.engine) next.engine = patch.engine
  if (patch.minimax) {
    next.minimax = {
      apiKey: patch.minimax.apiKey ?? current.minimax.apiKey,
      voiceId: patch.minimax.voiceId ?? current.minimax.voiceId,
      model: patch.minimax.model ?? current.minimax.model,
    }
  }
  if (patch.mossland) {
    next.mossland = {
      apiKey: patch.mossland.apiKey ?? current.mossland.apiKey,
      voiceId: patch.mossland.voiceId ?? current.mossland.voiceId,
      model: patch.mossland.model ?? current.mossland.model,
    }
  }
  if (patch.gptsovits) {
    next.gptsovits = {
      baseUrl: patch.gptsovits.baseUrl ?? current.gptsovits.baseUrl,
      refAudioPath: patch.gptsovits.refAudioPath ?? current.gptsovits.refAudioPath,
      promptText: patch.gptsovits.promptText ?? current.gptsovits.promptText,
    }
  }
  if (patch.customCloud) {
    next.customCloud = {
      endpointUrl: patch.customCloud.endpointUrl ?? current.customCloud.endpointUrl,
      apiKey: patch.customCloud.apiKey ?? current.customCloud.apiKey,
      voiceId: patch.customCloud.voiceId ?? current.customCloud.voiceId,
    }
  }
  if (patch.mimo) {
    next.mimo = {
      apiKey: patch.mimo.apiKey ?? current.mimo.apiKey,
      voiceAudioPath: patch.mimo.voiceAudioPath ?? current.mimo.voiceAudioPath,
      stylePrompt: patch.mimo.stylePrompt ?? current.mimo.stylePrompt,
    }
  }

  const onDisk = {
    engine: next.engine,
    minimax: { ...next.minimax, apiKey: encryptSecret(next.minimax.apiKey) },
    mossland: { ...next.mossland, apiKey: encryptSecret(next.mossland.apiKey) },
    gptsovits: next.gptsovits,
    customCloud: { ...next.customCloud, apiKey: encryptSecret(next.customCloud.apiKey) },
    mimo: { ...next.mimo, apiKey: encryptSecret(next.mimo.apiKey) },
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(configFile(dataDir), JSON.stringify(onDisk, null, 2), 'utf8')
  } catch {
    /* 写不进去返回内存值 */
  }
  return next
}

/** 给界面用：不含明文密钥 */
export function describeTtsConfig(dataDir: string): TtsConfigView {
  const c = readTtsConfig(dataDir)
  return {
    engine: c.engine,
    minimax: { voiceId: c.minimax.voiceId, model: c.minimax.model, hasKey: Boolean(c.minimax.apiKey) },
    mossland: { voiceId: c.mossland.voiceId, model: c.mossland.model, hasKey: Boolean(c.mossland.apiKey) },
    gptsovits: {
      baseUrl: c.gptsovits.baseUrl,
      refAudioPath: c.gptsovits.refAudioPath,
      promptText: c.gptsovits.promptText,
      hasKey: false,
    },
    customCloud: { endpointUrl: c.customCloud.endpointUrl, voiceId: c.customCloud.voiceId, hasKey: Boolean(c.customCloud.apiKey) },
    mimo: { voiceAudioPath: c.mimo.voiceAudioPath, stylePrompt: c.mimo.stylePrompt, hasKey: Boolean(c.mimo.apiKey) },
  }
}
