/**
 * 语音设置面板（TTS + ASR）。
 *
 * 引擎实现在主进程（搬自 Cyrene-Agent，MIT），这里只做两件事：
 *   1. 把当前配置读出来渲染成表单，保存时调 ttsConfigSet / asrConfigSet
 *   2. 「试听」：调 ttsSynthesize 拿回 base64，直接塞进 Audio 播出来
 *
 * 密钥永远不回显（主进程只返回 hasKey），所以密钥框留空 = 不改。
 */
const STYLE_ID = 'voice-ui-style'

const CSS = `
.vo-mask { position: fixed; inset: 0; z-index: 123; display: grid; place-items: center;
  background: rgba(18,26,38,.34); -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); }
.vo-panel { display: flex; flex-direction: column; width: min(620px, calc(100vw - 56px));
  max-height: calc(100vh - 80px); border-radius: 24px; color: #10151c; overflow: hidden;
  background: rgba(255,255,255,.96); -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%); box-shadow: 0 30px 80px rgba(30,44,62,.32);
  -webkit-app-region: no-drag; }
.vo-head { display: flex; align-items: center; gap: 10px; padding: 18px 22px 10px; }
.vo-title { font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
.vo-close { margin-left: auto; width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: rgba(120,148,178,.14); color: #5a6a7a; cursor: pointer; font-size: 13px; }
.vo-close:hover { background: rgba(120,148,178,.24); }
.vo-body { overflow-y: auto; padding: 4px 22px 20px; overscroll-behavior: contain; }
.vo-sec { margin-top: 14px; }
.vo-sec-title { font-size: 12px; font-weight: 600; color: #5a6a7a; margin-bottom: 8px; letter-spacing: .02em; }
.vo-row { display: block; margin-bottom: 10px; }
.vo-label { display: block; font-size: 11.5px; color: #5a6a7a; margin-bottom: 5px; }
.vo-input, .vo-select { width: 100%; box-sizing: border-box; height: 34px; padding: 0 11px;
  border: 0; border-radius: 10px; font: inherit; font-size: 12.5px; color: inherit;
  background: rgba(196,219,242,.26); box-shadow: inset 0 0 0 1px rgba(92,118,152,.12); }
.vo-input:focus, .vo-select:focus { outline: none; box-shadow: 0 0 0 3px rgba(10,132,255,.16); }
.vo-hint { margin-top: 4px; font-size: 11px; color: #8a97a8; }
.vo-actions { display: flex; align-items: center; gap: 8px; margin-top: 16px;
  padding-top: 14px; border-top: .5px solid rgba(120,148,178,.22); }
.vo-btn { height: 32px; padding: 0 15px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600; background: rgba(120,148,178,.16); color: #10151c; }
.vo-btn:hover { background: rgba(120,148,178,.26); }
.vo-btn.primary { background: #0a84ff; color: #fff; }
.vo-btn.primary:hover { background: #0a74e0; }
.vo-btn:disabled { opacity: .55; cursor: default; }
.vo-status { flex: 1; font-size: 11.5px; color: #5a6a7a; }
.vo-status.err { color: #b42318; }
`

const TTS_ENGINES: Array<{ id: string; label: string }> = [
  { id: 'off', label: '关闭' },
  { id: 'minimax', label: 'MiniMax（音色克隆 + 流式）' },
  { id: 'mossland', label: 'Mossland（音色克隆）' },
  { id: 'gptsovits', label: 'GPT-SoVITS（本地服务）' },
  { id: 'custom-cloud', label: '自定义云端 endpoint' },
  { id: 'mimo', label: '小米 MiMo（声音克隆）' },
]

const ASR_ENGINES: Array<{ id: string; label: string }> = [
  { id: 'off', label: '关闭' },
  { id: 'aliyun', label: '阿里云实时语音' },
  { id: 'mossland', label: 'Mossland' },
  { id: 'minimax', label: 'MiniMax' },
]

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function esc(text: string): string {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** 主进程返回的是给界面看的视图：密钥只有 hasKey */
interface TtsView {
  engine: string
  minimax: { voiceId: string; model: string; hasKey: boolean }
  mossland: { voiceId: string; model: string; hasKey: boolean }
  gptsovits: { baseUrl: string; refAudioPath: string; promptText: string; hasKey: boolean }
  customCloud: { endpointUrl: string; voiceId: string; hasKey: boolean }
  mimo: { voiceAudioPath: string; stylePrompt: string; hasKey: boolean }
}
interface AsrView {
  engine: string
  language: string
  aliyun: { hasKeys: boolean }
  mossland: { hasKey: boolean }
  minimax: { hasKey: boolean }
}

interface TtsDraft {
  engine: string
  minimax: { apiKey?: string; voiceId?: string; model?: string }
  mossland: { apiKey?: string; voiceId?: string; model?: string }
  gptsovits: { baseUrl?: string; refAudioPath?: string; promptText?: string }
  customCloud: { endpointUrl?: string; apiKey?: string; voiceId?: string }
  mimo: { apiKey?: string; voiceAudioPath?: string; stylePrompt?: string }
}
interface AsrDraft {
  engine: string
  language: string
  aliyun: { appKey?: string; accessKeyId?: string; accessKeySecret?: string }
  mossland: { apiKey?: string }
  minimax: { apiKey?: string }
}

let current: HTMLElement | null = null
let playing: HTMLAudioElement | null = null

export async function openVoiceSettings(): Promise<void> {
  ensureStyle()
  const api = window.costudy as unknown as {
    ttsConfig?: () => Promise<TtsView>
    ttsConfigSet?: (p: unknown) => Promise<TtsView>
    ttsSynthesize?: (r: unknown) => Promise<{ ok: boolean; base64?: string; format?: string; error?: string; cached?: boolean }>
    asrConfig?: () => Promise<AsrView>
    asrConfigSet?: (p: unknown) => Promise<AsrView>
  } | undefined
  if (!api?.ttsConfig || !api.asrConfig) {
    window.__toast?.('语音接口不可用')
    return
  }
  if (current) current.remove()

  const tts = await api.ttsConfig()
  const asr = await api.asrConfig()

  const keyPh = (has: boolean): string => (has ? '已配置，留空表示不改' : '填一个')

  const mask = document.createElement('div')
  mask.className = 'vo-mask'
  mask.innerHTML =
    '<div class="vo-panel" role="dialog" aria-label="语音设置">' +
    '<div class="vo-head"><span class="vo-title">语音</span>' +
    '<span class="sr-badge" style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#0a5cc4;background:rgba(10,132,255,.12)">TTS + 语音输入</span>' +
    '<button class="vo-close" data-vo-close aria-label="关闭">✕</button></div>' +
    '<div class="vo-body">' +
    // ---- TTS ----
    '<div class="vo-sec"><div class="vo-sec-title">朗读（TTS）</div>' +
    '<label class="vo-row"><span class="vo-label">引擎</span><select class="vo-select" data-vo-tts-engine>' +
    TTS_ENGINES.map((e) => `<option value="${e.id}"${e.id === tts.engine ? ' selected' : ''}>${e.label}</option>`).join('') +
    '</select></label>' +
    '<div data-vo-tts-fields></div>' +
    '</div>' +
    // ---- ASR ----
    '<div class="vo-sec"><div class="vo-sec-title">语音输入（ASR）</div>' +
    '<label class="vo-row"><span class="vo-label">引擎</span><select class="vo-select" data-vo-asr-engine>' +
    ASR_ENGINES.map((e) => `<option value="${e.id}"${e.id === asr.engine ? ' selected' : ''}>${e.label}</option>`).join('') +
    '</select></label>' +
    '<div data-vo-asr-fields></div>' +
    '<div class="vo-hint">识别是流式的：引擎和密钥配好之后，麦克风采集那条链路还没接（下一步）。</div>' +
    '</div>' +
    // ---- 操作 ----
    '<div class="vo-actions">' +
    '<button class="vo-btn" data-vo-preview>试听</button>' +
    '<span class="vo-status" data-vo-status></span>' +
    '<button class="vo-btn primary" data-vo-save>保存</button>' +
    '</div>' +
    '</div></div>'
  document.body.appendChild(mask)
  current = mask

  const $ = <T extends HTMLElement>(sel: string): T | null => mask.querySelector<T>(sel)
  const ttsFields = $('[data-vo-tts-fields]')
  const asrFields = $('[data-vo-asr-fields]')
  const ttsSel = $<HTMLSelectElement>('[data-vo-tts-engine]')
  const asrSel = $<HTMLSelectElement>('[data-vo-asr-engine]')
  const status = $('[data-vo-status]')

  const setStatus = (text: string, isError = false): void => {
    if (!status) return
    status.textContent = text
    status.className = 'vo-status' + (isError ? ' err' : '')
  }

  const input = (label: string, field: string, value: string, placeholder = ''): string =>
    '<label class="vo-row"><span class="vo-label">' + esc(label) + '</span>' +
    '<input class="vo-input" data-tts="' + field + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '" /></label>'
  const asrInput = (label: string, field: string, value = '', placeholder = ''): string =>
    '<label class="vo-row"><span class="vo-label">' + esc(label) + '</span>' +
    '<input class="vo-input" data-asr="' + field + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '" /></label>'

  const renderTtsFields = (engine: string): void => {
    if (!ttsFields) return
    let html = ''
    if (engine === 'minimax') {
      html += input('API Key', 'minimax.apiKey', '', keyPh(tts.minimax.hasKey))
      html += input('Voice ID', 'minimax.voiceId', tts.minimax.voiceId)
      html += input('模型', 'minimax.model', tts.minimax.model)
    } else if (engine === 'mossland') {
      html += input('API Key', 'mossland.apiKey', '', keyPh(tts.mossland.hasKey))
      html += input('Voice ID', 'mossland.voiceId', tts.mossland.voiceId)
      html += input('模型', 'mossland.model', tts.mossland.model)
    } else if (engine === 'gptsovits') {
      html += input('Base URL', 'gptsovits.baseUrl', tts.gptsovits.baseUrl)
      html += input('参考音频路径', 'gptsovits.refAudioPath', tts.gptsovits.refAudioPath)
      html += input('参考音频文本', 'gptsovits.promptText', tts.gptsovits.promptText)
    } else if (engine === 'custom-cloud') {
      html += input('Endpoint URL', 'customCloud.endpointUrl', tts.customCloud.endpointUrl)
      html += input('API Key', 'customCloud.apiKey', '', keyPh(tts.customCloud.hasKey))
      html += input('Voice ID（可选）', 'customCloud.voiceId', tts.customCloud.voiceId)
    } else if (engine === 'mimo') {
      html += input('API Key', 'mimo.apiKey', '', keyPh(tts.mimo.hasKey))
      html += input('克隆音频路径', 'mimo.voiceAudioPath', tts.mimo.voiceAudioPath)
      html += input('风格提示（可选）', 'mimo.stylePrompt', tts.mimo.stylePrompt)
    } else {
      html = '<div class="vo-hint">关着就不会朗读。</div>'
    }
    ttsFields.innerHTML = html
  }

  const renderAsrFields = (engine: string): void => {
    if (!asrFields) return
    let html = ''
    if (engine === 'aliyun') {
      html += asrInput('AppKey', 'aliyun.appKey', '', asr.aliyun.hasKeys ? '已配置，留空表示不改' : '')
      html += asrInput('AccessKey ID', 'aliyun.accessKeyId', '', asr.aliyun.hasKeys ? '已配置，留空表示不改' : '')
      html += asrInput('AccessKey Secret', 'aliyun.accessKeySecret', '', asr.aliyun.hasKeys ? '已配置，留空表示不改' : '')
    } else if (engine === 'mossland') {
      html += asrInput('API Key', 'mossland.apiKey', '', asr.mossland.hasKey ? '已配置，留空表示不改' : '')
    } else if (engine === 'minimax') {
      html += asrInput('API Key', 'minimax.apiKey', '', asr.minimax.hasKey ? '已配置，留空表示不改' : '')
    } else {
      html = '<div class="vo-hint">关着就不会录音。</div>'
    }
    asrFields.innerHTML = html
  }

  renderTtsFields(ttsSel?.value ?? tts.engine)
  renderAsrFields(asrSel?.value ?? asr.engine)
  ttsSel?.addEventListener('change', () => renderTtsFields(ttsSel.value))
  asrSel?.addEventListener('change', () => renderAsrFields(asrSel.value))

  const close = (): void => {
    playing?.pause()
    playing = null
    mask.remove()
    if (current === mask) current = null
  }
  $('[data-vo-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  const readTtsDraft = (): TtsDraft => {
    const draft: TtsDraft = {
      engine: ttsSel?.value ?? tts.engine,
      minimax: {},
      mossland: {},
      gptsovits: {},
      customCloud: {},
      mimo: {},
    }
    ttsFields?.querySelectorAll<HTMLInputElement>('[data-tts]').forEach((el) => {
      const path = el.dataset.tts ?? ''
      const [group, key] = path.split('.')
      const value = el.value.trim()
      if (!group || !key || !value) return
      const bag = draft[group as keyof TtsDraft] as Record<string, string>
      if (bag && typeof bag === 'object') bag[key] = value
    })
    // engine 之外全空的组不提交，避免把已有配置覆盖成空
    return draft
  }

  const readAsrDraft = (): AsrDraft => {
    const draft: AsrDraft = {
      engine: asrSel?.value ?? asr.engine,
      language: asr.language,
      aliyun: {},
      mossland: {},
      minimax: {},
    }
    asrFields?.querySelectorAll<HTMLInputElement>('[data-asr]').forEach((el) => {
      const path = el.dataset.asr ?? ''
      const [group, key] = path.split('.')
      const value = el.value.trim()
      if (!group || !key || !value) return
      const bag = draft[group as keyof AsrDraft] as Record<string, string>
      if (bag && typeof bag === 'object') bag[key] = value
    })
    return draft
  }

  $('[data-vo-save]')?.addEventListener('click', () => {
    void (async () => {
      setStatus('保存中…')
      try {
        await api.ttsConfigSet?.(readTtsDraft())
        await api.asrConfigSet?.(readAsrDraft())
        setStatus('已保存')
        window.__toast?.('语音设置已保存')
      } catch (err) {
        setStatus('保存失败：' + (err instanceof Error ? err.message : String(err)), true)
      }
    })()
  })

  $('[data-vo-preview]')?.addEventListener('click', () => {
    void (async () => {
      if (!api.ttsSynthesize) return
      setStatus('合成中…')
      const res = await api.ttsSynthesize({ text: '你好，我是你的学习搭子。' })
      if (!res.ok || !res.base64) {
        setStatus('合成失败：' + (res.error ?? '未知原因'), true)
        return
      }
      const format = res.format ?? 'mp3'
      if (format === 'pcm') {
        setStatus('引擎返回的是裸 PCM，播放需要先封装成 WAV（下个迭代补）', true)
        return
      }
      playing?.pause()
      playing = new Audio('data:audio/' + format + ';base64,' + res.base64)
      playing.play().then(
        () => setStatus(res.cached ? '播放中（缓存命中）' : '播放中'),
        (err: unknown) => setStatus('播放失败：' + (err instanceof Error ? err.message : String(err)), true),
      )
    })()
  })

  window.setTimeout(() => ttsSel?.focus(), 40)
}
