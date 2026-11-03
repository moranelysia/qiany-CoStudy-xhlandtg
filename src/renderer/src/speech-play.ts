/**
 * 朗读助手：把助手回复交给主进程 TTS 引擎合成并播放。
 *
 * 【为什么改成"按句排队播"】
 *   之前是：整段文本一次合成 → 一个 Audio 播完 → 结束。两个问题：
 *     1. 文本超 320 字直接截断，听起来就是"说到一半突然没声了"
 *     2. 长文本一次性合成很慢，首字延迟高
 *   现在切成句子，逐句「合成 → 播 → 等播完 → 下一句」，
 *   长回复能完整念完，首句也能更早出声。
 *
 * 【打断】
 *   任何一次 stopSpeaking 或新的 speak 都会让当前队列作废（generation 计数），
 *   正在播的音频立刻暂停。麦克风一开也会调它（barge-in）。
 */
let current: HTMLAudioElement | null = null
let queue: string[] = []
let draining = false
let generation = 0
let enabledCache: { value: boolean; at: number } | null = null

/** 单句最大长度：太长会一次性合成变慢，太碎又显得断 */
const SENTENCE_CHARS = 90
/** 一次最多念这么多字，防止一次回复把额度烧穿 */
const TOTAL_CHARS = 800

interface TtsViewLike {
  engine?: string
}

export async function isTtsEnabled(): Promise<boolean> {
  const now = Date.now()
  if (enabledCache && now - enabledCache.at < 3000) return enabledCache.value
  try {
    const view = (await window.costudy?.ttsConfig?.()) as TtsViewLike | undefined
    const value = Boolean(view && view.engine && view.engine !== 'off')
    enabledCache = { value, at: now }
    return value
  } catch {
    return false
  }
}

export function stopSpeaking(): void {
  generation++
  queue = []
  if (current) {
    try {
      current.pause()
    } catch {
      /* 忽略 */
    }
    current = null
  }
}

/** 把正文切成适合逐句合成的片段 */
function toChunks(raw: string): string[] {
  const text = String(raw ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[(记住|经历):[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TOTAL_CHARS)
  if (!text) return []

  // 先按句末标点切，过长的再按逗号切，实在没标点就硬切
  const rough = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [text]
  const chunks: string[] = []
  for (const piece of rough) {
    const s = piece.trim()
    if (!s) continue
    if (s.length <= SENTENCE_CHARS) {
      chunks.push(s)
      continue
    }
    const parts = s.match(/[^，,、]+[，,、]?/g) ?? [s]
    let buf = ''
    for (const p of parts) {
      if ((buf + p).length > SENTENCE_CHARS && buf) {
        chunks.push(buf)
        buf = p
      } else {
        buf += p
      }
    }
    if (buf) chunks.push(buf)
  }
  return chunks
}

async function playOne(text: string, gen: number): Promise<void> {
  const api = window.costudy as unknown as {
    ttsSynthesize?: (req: unknown) => Promise<{ ok: boolean; base64?: string; format?: string; error?: string }>
  } | undefined
  if (!api?.ttsSynthesize) return

  const res = await api.ttsSynthesize({ text })
  if (gen !== generation) return
  if (!res.ok || !res.base64) {
    /* 【2026-11-02 用户要求】合成失败**不再弹 toast**。
     *
     * 原来这里每次都 `__toast('朗读失败：' + error)`，而 speak() 是按标点切片的、
     * drain() 一片一片念 —— 服务没起的时候一条消息能连弹七八个
     * "GPT-SoVITS 请求失败: fetch failed"，一屏黑条。
     *
     * 现在只写控制台（排查要留痕），不再打扰：
     * 「语音服务没起来」这件事由顶部保障条统一说一次，10 秒后自动收。 */
    console.warn('[TTS] 朗读失败：' + (res.error ?? '未知原因'))
    return
  }
  const format = res.format ?? 'mp3'
  if (format === 'pcm') return

  await new Promise<void>((resolve) => {
    const audio = new Audio('data:audio/' + format + ';base64,' + res.base64)
    current = audio
    const done = (): void => {
      audio.removeEventListener('ended', done)
      audio.removeEventListener('error', done)
      if (current === audio) current = null
      resolve()
    }
    audio.addEventListener('ended', done)
    audio.addEventListener('error', done)
    audio.play().catch(done)
    // 被打断时 play 不会自然结束，靠 generation 让外层跳出；这里给个兜底
    const guard = window.setInterval(() => {
      if (gen !== generation) {
        window.clearInterval(guard)
        try {
          audio.pause()
        } catch {
          /* 忽略 */
        }
        done()
      }
    }, 200)
    audio.addEventListener('ended', () => window.clearInterval(guard), { once: true })
  })
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  const gen = generation
  try {
    while (gen === generation && queue.length) {
      const next = queue.shift()
      if (!next) break
      await playOne(next, gen)
    }
  } finally {
    draining = false
  }
}

export async function speak(raw: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isTtsEnabled())) return { ok: false, error: '语音没开' }
  const chunks = toChunks(raw)
  if (!chunks.length) return { ok: false, error: '没有可朗读的内容' }

  stopSpeaking()
  queue = chunks.slice()
  void drain()
  return { ok: true }
}

/**
 * 慢读：把词/字拆开逐个念（**不是改引擎语速**，多数 TTS 接口没有 rate 参数）。
 * 每念完一个单位再念下一个，词间留 260ms —— 背单词、纠发音时比整句连读清楚。
 */
export async function speakSlow(raw: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isTtsEnabled())) return { ok: false, error: '语音没开' }
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, error: '没有可朗读的内容' }
  const units = text.split(/[\s，。,.!?！？;；:：、]+/).filter(Boolean)
  if (units.length <= 1) return speak(text)
  const first = await speak(units[0])
  if (!first.ok) return first
  for (const unit of units.slice(1)) {
    const started = Date.now()
    while (isSpeaking() && Date.now() - started < 3000) {
      await new Promise((r) => setTimeout(r, 120))
    }
    await new Promise((r) => setTimeout(r, 260))
    const res = await speak(unit)
    if (!res.ok) return res
  }
  return { ok: true }
}

/** 当前是否正在朗读（给界面做指示用） */
export function isSpeaking(): boolean {
  return Boolean(current) || queue.length > 0
}
