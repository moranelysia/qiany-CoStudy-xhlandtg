/**
 * ASR 流式会话门面（costudy 侧）。
 *
 * 引擎是流式的：渲染端把 PCM 片段推上来，这里转发给引擎，引擎的回调再把
 * 中间结果 / 最终文本推回渲染端。约定：
 *   asr:start  → { ok, sessionId }
 *   asr:chunk  → base64(Int16LE PCM) 片段
 *   asr:stop   → 结束，返回最终文本
 *   事件通道 asr:event → { type: 'partial' | 'final' | 'error', text, sessionId }
 */
import { BrowserWindow } from 'electron'
import { createAsrStream, type AsrStreamSession } from './asr-dispatcher'
import { getAsrConfig } from './asr-config'
import { readAsrSettings } from './costudy-config'

export interface AsrEvent {
  type: 'partial' | 'final' | 'error'
  text?: string
  sessionId?: string
}

let active: { stream: AsrStreamSession; id: string } | null = null

function emit(event: AsrEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('asr:event', event)
  }
}

export function hasActiveAsr(): boolean {
  return Boolean(active)
}

export async function startAsr(dataDir: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  // readAsrSettings 会把配置同步给引擎的 getAsrConfig()
  readAsrSettings(dataDir)
  const cfg = getAsrConfig()
  if (!cfg) return { ok: false, error: '语音输入没开：先在「语音」面板里选一个 ASR 引擎并填好密钥' }

  void stopAsr()
  const id = 'asr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
  const stream = createAsrStream(
    cfg,
    (text) => emit({ type: 'partial', text, sessionId: id }),
    (text) => emit({ type: 'final', text, sessionId: id }),
  )
  active = { stream, id }
  try {
    await stream.start()
    return { ok: true, sessionId: id }
  } catch (err) {
    active = null
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

/** 推一段音频（base64 的 Int16LE PCM）。没有会话就忽略。 */
export function pushAsrAudio(base64: string): boolean {
  if (!active) return false
  try {
    active.stream.sendAudio(Buffer.from(String(base64 ?? ''), 'base64'))
    return true
  } catch (err) {
    emit({ type: 'error', text: err instanceof Error ? err.message : String(err), sessionId: active.id })
    return false
  }
}

export async function stopAsr(): Promise<string> {
  if (!active) return ''
  const { stream } = active
  active = null
  try {
    const final = await stream.stop()
    return typeof final === 'string' ? final : ''
  } catch {
    return ''
  }
}
