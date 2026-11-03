/**
 * 跨对话检索（记忆第三层）。
 *
 * 【为什么用 BM25 而不是向量】
 *   1. 零依赖：不用装嵌入模型、不用联网、不用 GPU
 *   2. 可解释：能说清"因为这几个词重合所以召回"，出问题好查
 *   3. 够用：伴学场景里用户会重复提到同一个知识点（"判别式""配方法""三角换元"），
 *      这些是**关键词**，不是语义 paraphrase —— 词面检索反而更准
 *   向量检索留到以后：等 BM25 明显不够时再加，别一上来就上重武器。
 *
 * 【中文怎么切词】
 *   不引入分词库。中文按 **二元组（bigram）** 切：`判别式` → `判别` `别式`。
 *   这是信息检索里的老办法，对术语召回很有效，也不需要词典。
 *   ASCII 单词（sin / x / GPT）按空格切，也进索引。
 *
 * 【分块】
 *   一问一答算一块（用户消息 + 紧随的助手回复）。块太大，注入的提示词就爆；
 *   块太小，上下文不完整。一问一答是天然边界。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface Chunk {
  sessionId: string
  /** 在会话里的起始行号，方便回溯 */
  index: number
  userText: string
  assistantText: string
  at: string
}

export interface Hit {
  chunk: Chunk
  score: number
  /** 命中了哪些词（调试/解释用） */
  terms: string[]
}

interface Doc {
  chunk: Chunk
  tokens: string[]
  tf: Map<string, number>
  length: number
}

/** 中文二元组 + ASCII 词 */
export function tokenize(text: string): string[] {
  const out: string[] = []
  const lower = String(text ?? '').toLowerCase()
  // ASCII 词（含数字、小数点）：sin / x / gpt2 / 3.14
  for (const m of lower.matchAll(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g)) {
    if (m[0].length >= 2) out.push(m[0])
  }
  // 连续中文段落 → 二元组
  for (const m of lower.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const seg = m[0]
    if (seg.length === 1) {
      out.push(seg)
      continue
    }
    for (let i = 0; i + 1 < seg.length; i++) out.push(seg.slice(i, i + 2))
  }
  return out
}

function readJsonl(file: string): Array<{ role: string; text: string; at?: string }> {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const rows: Array<{ role: string; text: string; at?: string }> = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const item = JSON.parse(trimmed) as { role?: string; text?: string; at?: string }
        if (item && typeof item.text === 'string') {
          rows.push({ role: String(item.role ?? 'user'), text: item.text, at: item.at })
        }
      } catch {
        /* 坏行跳过 */
      }
    }
    return rows
  } catch {
    return []
  }
}

/** 把 sessions 目录下的所有会话切成问答块 */
export function collectChunks(dataDir: string): Chunk[] {
  const dir = path.join(dataDir, '会话')
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }
  const chunks: Chunk[] = []
  for (const file of files) {
    const sessionId = file.replace(/\.jsonl$/, '')
    const rows = readJsonl(path.join(dir, file))
    // 用三个标量而不是可空对象：闭包里的可空对象会被 TS 收窄成 never
    let pendingText: string | null = null
    let pendingAt = ''
    let pendingIndex = 0
    rows.forEach((row, index) => {
      if (row.role === 'user') {
        pendingText = row.text
        pendingAt = row.at ?? ''
        pendingIndex = index
        return
      }
      if (row.role === 'assistant' && pendingText !== null) {
        chunks.push({
          sessionId,
          index: pendingIndex,
          userText: pendingText,
          assistantText: row.text,
          at: pendingAt || row.at || '',
        })
        pendingText = null
      }
    })
    // 只有提问没有回答的，也留一块（提问本身有信息量）
    if (pendingText !== null) {
      chunks.push({ sessionId, index: pendingIndex, userText: pendingText, assistantText: '', at: pendingAt })
    }
  }
  return chunks
}

const K1 = 1.5
const B = 0.75

/** 建索引（每次检索都重建：会话文件不大，重建比维护增量简单可靠） */
export function searchSessions(
  dataDir: string,
  query: string,
  options: { topK?: number; minScore?: number } = {},
): Hit[] {
  const topK = options.topK ?? 3
  const minScore = options.minScore ?? 0.5
  const queryTokens = Array.from(new Set(tokenize(query)))
  if (!queryTokens.length) return []

  const chunks = collectChunks(dataDir)
  if (!chunks.length) return []

  const docs: Doc[] = chunks.map((chunk) => {
    const tokens = tokenize(chunk.userText + '\n' + chunk.assistantText)
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { chunk, tokens, tf, length: tokens.length }
  })

  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1

  // 文档频率
  const df = new Map<string, number>()
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = docs.length

  const hits: Hit[] = []
  for (const d of docs) {
    let score = 0
    const matched: string[] = []
    for (const term of queryTokens) {
      const freq = d.tf.get(term) ?? 0
      if (!freq) continue
      const n = df.get(term) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const denom = freq + K1 * (1 - B + (B * d.length) / avgLength)
      score += idf * ((freq * (K1 + 1)) / denom)
      matched.push(term)
    }
    if (score >= minScore) hits.push({ chunk: d.chunk, score, terms: matched })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, topK)
}

/** 拼一小段可注入提示词的历史片段 */
export function formatRecall(hits: Hit[], maxChars = 400): string {
  if (!hits.length) return ''
  const lines = hits.slice(0, 3).map((h, k) => {
    const q = h.chunk.userText.replace(/\s+/g, ' ').slice(0, 80)
    const a = h.chunk.assistantText.replace(/\s+/g, ' ').slice(0, 120)
    return `${k + 1}. 学生问过：「${q}」你当时答：「${a}」`
  })
  const body = lines.join('\n')
  const clipped = body.length > maxChars ? body.slice(0, maxChars) + '…' : body
  return '【以往对话里提到过】\n' + clipped
}
