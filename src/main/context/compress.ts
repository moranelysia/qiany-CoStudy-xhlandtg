/**
 * 上下文压缩（三层里的"压缩"那层）。
 *
 * 现在的问题是：历史被**硬切**成最后 12 条（`slice(-12)`）。
 * 一节课聊 60 轮以后，学生开头说的"我这次想练电路"、以及早就确认过的结论，
 * 全部掉出窗口 —— 表现就是"它又问我一遍"。
 *
 * 做法：超出窗口的部分让模型压成一段结构化摘要，存盘；下一轮把摘要放在
 * 系统提示里、后面接最近若干条原文。摘要带 `upTo` 水位，已经压过的不会重复压。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface SessionSummary {
  /** 已经压进摘要的消息条数（水位） */
  upTo: number
  /** 摘要正文 */
  summary: string
  updatedAt: string
  /** 压缩过几次（诊断用） */
  rounds: number
}

/** 保留最近多少条原文（其余进摘要） */
export const KEEP_RECENT = 10
/** 超过这个条数才考虑压缩，避免每轮都调一次模型 */
export const COMPRESS_TRIGGER = 18

function dir(dataDir: string): string {
  return path.join(dataDir, '摘要')
}

function file(dataDir: string, sessionId: string): string {
  return path.join(dir(dataDir), sessionId + '.json')
}

export function readSummary(dataDir: string, sessionId: string): SessionSummary | null {
  try {
    const raw = fs.readFileSync(file(dataDir, sessionId), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<SessionSummary> | null
    if (!parsed || typeof parsed.summary !== 'string') return null
    return {
      upTo: Number.isFinite(Number(parsed.upTo)) ? Math.max(0, Number(parsed.upTo)) : 0,
      summary: parsed.summary,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      rounds: Number(parsed.rounds) || 0,
    }
  } catch {
    return null
  }
}

export function writeSummary(dataDir: string, sessionId: string, next: SessionSummary): void {
  try {
    fs.mkdirSync(dir(dataDir), { recursive: true })
    fs.writeFileSync(file(dataDir, sessionId), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* 写不进去就只在内存里用 */
  }
}

/** 该不该压、压哪一段 */
export function planCompression(
  total: number,
  alreadyCompressed: number,
  keep = KEEP_RECENT,
  trigger = COMPRESS_TRIGGER,
): { from: number; to: number } | null {
  const remaining = total - alreadyCompressed
  if (remaining <= trigger) return null
  const to = total - keep
  if (to <= alreadyCompressed) return null
  return { from: alreadyCompressed, to }
}

/** 把要压的那段拼成给模型看的原文（限长，避免摘要请求本身超长） */
export function renderForSummary(messages: HistoryMessage[], from: number, to: number, maxChars = 6000): string {
  const lines: string[] = []
  let used = 0
  for (const m of messages.slice(from, to)) {
    const who = m.role === 'user' ? '学生' : '你'
    const text = String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 240)
    const line = who + '：' + text
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
  }
  return lines.join('\n')
}

export const SUMMARY_SYSTEM = [
  '你在压缩一段师生对话，供后续轮次继续使用。要求：',
  '1. 只保留"后面会用到"的东西：学到哪、卡在哪、学生的目标与约定、已确认的结论、还没解决的疑问。',
  '2. 用短句，不超过 12 行；不要客套话，不要复述原题。',
  '3. 不确定的信息写"未确认"，不要编。',
  '4. 保留学生原话里关键的错因（比如"总把电压表串联"）。',
].join('\n')

export function buildSummaryPrompt(previous: string, transcript: string): string {
  return (
    (previous ? '【之前的摘要】\n' + previous + '\n\n' : '') +
    '【需要并入摘要的新对话】\n' +
    transcript +
    '\n\n按上面的要求输出合并后的新摘要。'
  )
}

/** 把摘要变成提示词里的一段 */
export function renderSummaryBlock(summary: string): string {
  const text = String(summary ?? '').trim()
  if (!text) return ''
  return '# 前面聊过的（压缩摘要，细节已省略）\n' + text + '\n（如果和最近几句冲突，以最近的原话为准。）'
}

/* ---------- 上下文占用估算（给界面上的圆环用） ---------- */

/**
 * 粗估 token：中文约 1 字 ≈ 1 token，英文约 4 字符 ≈ 1 token。
 * 没有本地分词器（引一个几十 MB 的 tokenizer 不值），所以这是**估算**，
 * 界面上必须写"约"，不能当成精确值。
 */
export function estimateTokens(text: string): number {
  const s = String(text ?? '')
  let cjk = 0
  let other = 0
  for (const ch of s) {
    if (/[\u3400-\u9fff\u3040-\u30ff\uff00-\uffef]/.test(ch)) cjk += 1
    else other += 1
  }
  return Math.round(cjk + other / 4)
}

export interface ContextStats {
  /** 会话总条数 */
  messages: number
  /** 已压进摘要的条数 */
  compressed: number
  /** 摘要正文的估算 token */
  summaryTokens: number
  /** 最近原文的估算 token（会进提示词的那部分） */
  recentTokens: number
  /** 估算总占用（本轮进提示词的部分） */
  usedTokens: number
  /** 整段会话累计（含已压缩的），用来让圆环随对话增长 */
  sessionTokens: number
  /** 模型窗口（配置值） */
  windowTokens: number
  /** 占用百分比 0–100 */
  percent: number
  /** 是否已经产生摘要 */
  hasSummary: boolean
}

export function contextStats(
  messages: HistoryMessage[],
  summary: SessionSummary | null,
  windowTokens: number,
  keep = KEEP_RECENT,
): ContextStats {
  const total = messages.length
  const compressed = Math.min(summary?.upTo ?? 0, total)
  const recent = messages.slice(Math.max(0, total - keep))
  const recentTokens = recent.reduce((sum, m) => sum + estimateTokens(m.text), 0)
  const summaryTokens = estimateTokens(summary?.summary ?? '')
  const usedTokens = recentTokens + summaryTokens
  const sessionTokens = messages.reduce((sum, m) => sum + estimateTokens(m.text), 0) + summaryTokens
  const win = Math.max(1000, windowTokens)
  return {
    messages: total,
    compressed,
    summaryTokens,
    recentTokens,
    usedTokens,
    sessionTokens,
    windowTokens: win,
    percent: Math.min(100, Math.round((sessionTokens / win) * 1000) / 10),
    hasSummary: Boolean(summary?.summary),
  }
}
/**
 * 按 **token 占比**决定要不要压、压到哪。
 *
 * 为什么换掉"按条数"：10 条长消息可能是 2 万 token，10 条"嗯/对"只有几十 token，
 * 用条数当尺子，要么撑爆窗口、要么白压。这里用的是估算 token（没有本地分词器）。
 *
 * 规则：
 *   · 未压缩部分的估算 token 超过窗口的 triggerRatio（默认 60%）才触发
 *   · 压缩后保留的最近消息，累计不超过窗口的 keepRatio（默认 25%），至少留 4 条
 */
export function planCompressionByTokens(
  messages: HistoryMessage[],
  alreadyCompressed: number,
  windowTokens: number,
  options: { triggerRatio?: number; keepRatio?: number; minKeep?: number } = {},
): { from: number; to: number; tokens: number } | null {
  const triggerRatio = options.triggerRatio ?? 0.6
  const keepRatio = options.keepRatio ?? 0.25
  const minKeep = options.minKeep ?? 4
  const total = messages.length
  const from = Math.max(0, Math.min(alreadyCompressed, total))
  if (total - from < 2) return null

  let liveTokens = 0
  for (let i = from; i < total; i += 1) liveTokens += estimateTokens(messages[i].text)
  if (liveTokens < windowTokens * triggerRatio) return null

  // 从最后往前留，直到预算用完
  const budget = Math.max(1000, windowTokens * keepRatio)
  let acc = 0
  let cut = total
  for (let i = total - 1; i >= from; i -= 1) {
    acc += estimateTokens(messages[i].text)
    cut = i
    if (acc > budget && total - i >= minKeep) break
  }
  if (cut - from < 2) return null
  return { from, to: cut, tokens: liveTokens }
}