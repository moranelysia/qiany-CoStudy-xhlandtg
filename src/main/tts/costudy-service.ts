/**
 * costudy 侧的 TTS 门面：把配置 + 缓存 + 分发串起来，供 IPC 调用。
 *
 * 引擎实现本身是从 Cyrene-Agent（MIT）原样搬过来的（见同目录各 *-engine.ts），
 * 这里只做「取配置 → 查缓存 → 合成 → 写缓存 → 返回 base64」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { synthesizeByEngine } from './tts-dispatcher'
import {
  buildCustomCloudCacheKey,
  buildGptsovitsCacheKey,
  buildMimoCacheKey,
  buildMosslandCacheKey,
  buildTtsCacheKey,
  getTtsCachePath,
  readTtsCacheByKey,
} from './tts-cache'
import { readTtsConfig } from './costudy-config'
import type { TtsEngine } from './types'

export interface TtsSynthRequest {
  text: string
  /** 不传就用配置里的当前引擎 */
  engine?: TtsEngine
  speed?: number
  volume?: number
  voiceId?: string
  format?: 'mp3' | 'wav'
}

export interface TtsSynthResponse {
  ok: boolean
  engine?: TtsEngine
  base64?: string
  format?: 'wav' | 'mp3' | 'pcm'
  cacheKey?: string
  cached?: boolean
  error?: string
}

function writeCache(cacheKey: string, format: 'wav' | 'mp3' | 'pcm', audio: Buffer): void {
  try {
    const file = getTtsCachePath(cacheKey, format)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, audio)
  } catch {
    /* 缓存失败不影响这次播放 */
  }
}

function buildCacheKey(
  engine: TtsEngine,
  cfg: ReturnType<typeof readTtsConfig>,
  text: string,
  req: TtsSynthRequest,
): string {
  const speed = req.speed ?? 1
  if (engine === 'minimax') {
    return buildTtsCacheKey({
      voiceId: req.voiceId || cfg.minimax.voiceId,
      text,
      speed,
      volume: req.volume ?? 1,
      model: cfg.minimax.model,
      format: req.format ?? 'mp3',
    })
  }
  if (engine === 'gptsovits') {
    return buildGptsovitsCacheKey({
      baseUrl: cfg.gptsovits.baseUrl,
      refAudioPath: cfg.gptsovits.refAudioPath,
      promptText: cfg.gptsovits.promptText,
      text,
      speed,
      format: req.format ?? 'wav',
    })
  }
  if (engine === 'custom-cloud') {
    return buildCustomCloudCacheKey({
      endpointUrl: cfg.customCloud.endpointUrl,
      voiceId: req.voiceId || cfg.customCloud.voiceId,
      text,
      speed,
      volume: req.volume ?? 1,
      format: req.format ?? 'mp3',
    })
  }
  if (engine === 'mimo') {
    return buildMimoCacheKey({
      voiceAudioPath: cfg.mimo.voiceAudioPath,
      text,
      stylePrompt: cfg.mimo.stylePrompt,
    })
  }
  return buildMosslandCacheKey({
    voiceId: req.voiceId || cfg.mossland.voiceId,
    text,
    model: cfg.mossland.model,
    format: req.format ?? 'mp3',
  })
}

export async function synthesize(dataDir: string, req: TtsSynthRequest): Promise<TtsSynthResponse> {
  const text = String(req?.text ?? '').trim()
  if (!text) return { ok: false, error: '没有要朗读的文本' }

  const cfg = readTtsConfig(dataDir)
  const engine = (req.engine ?? cfg.engine) as TtsEngine
  if (engine === 'off') return { ok: false, error: '语音还没开：先在设置里选一个 TTS 引擎' }

  let cacheKey = ''
  try {
    cacheKey = buildCacheKey(engine, cfg, text, req)
    const hit = readTtsCacheByKey(cacheKey)
    if (hit) {
      return {
        ok: true,
        engine,
        base64: hit.audio.toString('base64'),
        format: hit.format,
        cacheKey,
        cached: true,
      }
    }
  } catch {
    /* 缓存 key 算不出来就跳过缓存 */
  }

  try {
    const result = await synthesizeByEngine(engine, {
      text,
      speed: req.speed,
      volume: req.volume,
      apiKey: engine === 'minimax' ? cfg.minimax.apiKey : engine === 'mossland' ? cfg.mossland.apiKey : engine === 'mimo' ? cfg.mimo.apiKey : cfg.customCloud.apiKey,
      voiceId: req.voiceId || (engine === 'minimax' ? cfg.minimax.voiceId : engine === 'mossland' ? cfg.mossland.voiceId : cfg.customCloud.voiceId),
      model: engine === 'minimax' ? cfg.minimax.model : engine === 'mossland' ? cfg.mossland.model : undefined,
      baseUrl: engine === 'gptsovits' ? cfg.gptsovits.baseUrl : undefined,
      refAudioPath: engine === 'gptsovits' ? cfg.gptsovits.refAudioPath : undefined,
      promptText: engine === 'gptsovits' ? cfg.gptsovits.promptText : undefined,
      endpointUrl: engine === 'custom-cloud' ? cfg.customCloud.endpointUrl : undefined,
      voiceAudioPath: engine === 'mimo' ? cfg.mimo.voiceAudioPath : undefined,
      stylePrompt: engine === 'mimo' ? cfg.mimo.stylePrompt : undefined,
      format: req.format,
      mosslandFormat: engine === 'mossland' ? (req.format ?? 'mp3') : undefined,
    })

    if (cacheKey) writeCache(cacheKey, result.format, result.audio)
    return {
      ok: true,
      engine,
      base64: result.audio.toString('base64'),
      format: result.format,
      cacheKey,
      cached: false,
    }
  } catch (err) {
    return { ok: false, engine, error: err instanceof Error ? err.message : String(err) }
  }
}
