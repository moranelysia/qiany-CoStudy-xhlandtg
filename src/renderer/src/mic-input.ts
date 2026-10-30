import { stopSpeaking } from './speech-play'

/**
 * 麦克风采集：把麦克风音频降采样成 16 kHz / Int16 / 单声道 PCM 片段，
 * 通过 asr:chunk 推给主进程的流式识别引擎。
 *
 * 为什么用 ScriptProcessor 而不是 AudioWorklet：
 *   AudioWorklet 需要单独的 worklet 模块文件，在 electron-vite 里要额外处理资源路径；
 *   这条链路对延迟不敏感（100ms 一帧），ScriptProcessor 够用且零构建配置。
 *   以后要压延迟再换 worklet，接口不用动。
 */
const TARGET_RATE = 16000
const FRAME_MS = 100

let ctx: AudioContext | null = null
let source: MediaStreamAudioSourceNode | null = null
let proc: ScriptProcessorNode | null = null
let media: MediaStream | null = null
let unsubscribe: (() => void) | null = null
let running = false

export function isMicRunning(): boolean {
  return running
}

/** 把任意采样率的 Float32 线性降采样到 16k */
function downsample(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_RATE) return input
  const ratio = fromRate / TARGET_RATE
  const outLength = Math.floor(input.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = end > start ? sum / (end - start) : input[start] ?? 0
  }
  return out
}

function toBase64Pcm16(samples: Float32Array): string {
  const buf = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(buf.buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export interface MicCallbacks {
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
}

export async function startMic(cb: MicCallbacks = {}): Promise<{ ok: boolean; error?: string }> {
  if (running) return { ok: true }
  const api = window.costudy
  if (!api?.asrStart || !api.asrChunk) return { ok: false, error: '语音接口不可用' }

  // 打断：用户开口了，角色就别继续念了（barge-in）
  stopSpeaking()
  const started = await api.asrStart()
  if (!started.ok) return { ok: false, error: started.error ?? '识别会话没起来' }

  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (err) {
    void api.asrStop?.()
    return { ok: false, error: '拿不到麦克风：' + (err instanceof Error ? err.message : String(err)) }
  }

  ctx = new AudioContext()
  source = ctx.createMediaStreamSource(media)
  proc = ctx.createScriptProcessor(4096, 1, 1)

  let pending: Float32Array = new Float32Array(0)
  const frameLen = Math.round((TARGET_RATE * FRAME_MS) / 1000)

  proc.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0)
    const down = downsample(input, ctx?.sampleRate ?? TARGET_RATE)
    const merged = new Float32Array(pending.length + down.length)
    merged.set(pending)
    merged.set(down, pending.length)
    let offset = 0
    while (merged.length - offset >= frameLen) {
      const frame = merged.subarray(offset, offset + frameLen)
      offset += frameLen
      void api.asrChunk?.(toBase64Pcm16(frame))
    }
    pending = merged.slice(offset)
  }

  source.connect(proc)
  // 必须接目的地，否则某些实现不跑 onaudioprocess；静音节点不发声
  proc.connect(ctx.destination)

  unsubscribe = api.onAsrEvent?.((event) => {
    const e = event as { type?: string; text?: string }
    if (e.type === 'partial' && e.text) cb.onPartial?.(e.text)
    else if (e.type === 'final' && e.text) cb.onFinal?.(e.text)
    else if (e.type === 'error') cb.onError?.(e.text ?? '识别出错')
  }) ?? null

  running = true
  return { ok: true }
}

export async function stopMic(): Promise<string> {
  if (!running) return ''
  running = false
  try {
    proc?.disconnect()
    source?.disconnect()
    media?.getTracks().forEach((t) => t.stop())
    await ctx?.close()
  } catch {
    /* 清理失败不影响结果 */
  }
  proc = null
  source = null
  media = null
  ctx = null
  unsubscribe?.()
  unsubscribe = null
  try {
    return (await window.costudy?.asrStop?.()) ?? ''
  } catch {
    return ''
  }
}
