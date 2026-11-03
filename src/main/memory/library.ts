/**
 * 记忆库：**全量记录 + 检索标记**。
 *
 * 设计按伴学场景定，不照搬 elysia：
 *   · elysia 是聊天 agent，它要区分长期/瞬时、要「待确认→已确认」防污染；
 *   · 伴学是**所有东西都值得记**（学到哪、卡在哪、习惯、错因），而且都该是长期记忆。
 *   · 所以这里**没有升格机制**，只有两件事：① 全量记 ② 能检索。
 *
 * 每条记录三样东西：
 *   text     原文（截 200 字）
 *   tags     检索标记：学科 + 类型 + 关键词（自动抽，用户不用管）
 *   evidence 从哪句话来（可回溯）
 *
 * 检索：token 命中数 × 权重 + 出现次数 + 时间新鲜度；纯本地，零依赖。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface LibraryEntry {
  id: string
  text: string
  /** 检索标记：['物理','知识点','电压表','并联'] */
  tags: string[]
  /** 来源原话（截断） */
  evidence: string
  /** 被记过几次 */
  hits: number
  firstSeen: string
  lastSeen: string
  archived?: boolean
}

const FILE = '记忆库.json'
const MAX_ENTRIES = 800

function libraryPath(dataDir: string): string {
  return path.join(dataDir, FILE)
}

/** 学科词典：命中就给对应学科标记 */
const SUBJECTS: Array<[string, string[]]> = [
  ['数学', ['函数', '方程', '不等式', '三角', '正弦', '余弦', '导数', '积分', '概率', '数列', '向量', '几何', '判别式', '对数', '指数']],
  ['物理', ['力', '加速度', '速度', '电路', '电流', '电压', '电阻', '磁场', '电场', '透镜', '折射', '反射', '功率', '能量', '动量', '机械能', '滑动变阻器']],
  ['化学', ['反应', '溶液', '酸', '碱', '盐', '氧化', '还原', '离子', '方程式', '酯化', '催化剂', '浓度', '滴定', '蒸馏', '过滤']],
  ['生物', ['细胞', '光合', '呼吸', '染色体', '分裂', '遗传', '基因', '酶', '蛋白', '种群', '生态']],
  ['英语', ['单词', '语法', '时态', '从句', '发音', '作文', '短语', '被动语态', '词性']],
]

/** 类型词典：这条记忆属于哪一类 */
const KINDS: Array<[string, string[]]> = [
  ['知识点', ['定义', '公式', '定理', '定律', '原理', '怎么算', '怎么求', '结论']],
  ['卡点', ['不会', '不懂', '卡住', '老是错', '总是忘', '搞混', '分不清']],
  ['习惯', ['喜欢', '习惯', '先', '每次', '总是先', '不爱', '懒得']],
  ['目标', ['想考', '目标', '计划', '下次', '期末', '高考', '要提分']],
  ['错因', ['错在', '错因', '粗心', '看错', '算错', '符号']],
  ['偏好', ['别用', '不要', '希望', '最好']],
]

/** 判重键：去空白与标点，不改原文 */
export function normalizeKey(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:（）()「」『』"'“”]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * 抽检索标记：只认**学科 + 类型**两本词典。
 *
 * 【为什么不再切中文词】
 *   原实现从每段中文里切 2–6 字当"术语"，而且是取前缀，于是
 *   「一起写下第一份学习记录」会吐出 一起写下第一 / 一起写下 / 一起写 / 一起
 *   一整串互相包含的碎片 —— 界面上每张卡挂十几个垃圾标签（2026-11-02）。
 *   后来改成 4 字不重叠切片，仍然切得出「一起画了」「的棋盘」这种跨词碎片。
 *   而检索现在用**正文二字共现**（见 searchLibrary），根本不依赖这些碎片，
 *   所以干脆不切了：只留学科和类型，卡片干净，语义也准。
 */
export function deriveTags(text: string): string[] {
  const s = String(text ?? '')
  const tags: string[] = []
  for (const [name, words] of SUBJECTS) {
    if (words.some((w) => s.includes(w))) tags.push(name)
  }
  for (const [name, words] of KINDS) {
    if (words.some((w) => s.includes(w))) tags.push(name)
  }
  return sanitizeTags(tags)
}

/**
 * 标签清理：只留学科 / 类型。
 *
 * 老数据里的碎片标签也靠这一步在读取时清掉，不用迁移 `记忆库.json`。
 * 显式传进来的自由标签（`recordEntry({tags})`）如果不是这两类，会被丢掉 ——
 * 因为检索已经不靠它们了，留着只会变成界面噪音。
 */
export function sanitizeTags(input: string[]): string[] {
  const list = Array.from(new Set((input ?? []).map(String).filter(Boolean)))
  const curated = list.filter((t) => SUBJECTS.some(([n]) => n === t) || KINDS.some(([n]) => n === t))
  return Array.from(new Set(curated)).slice(0, 10)
}

function readAll(dataDir: string): LibraryEntry[] {
  try {
    const raw = fs.readFileSync(libraryPath(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as { entries?: unknown } | null
    const list = Array.isArray(parsed?.entries) ? (parsed!.entries as LibraryEntry[]) : []
    return list
      .filter((e) => e && typeof e.text === 'string' && e.text.trim())
      .map((e) => ({
        id: String(e.id ?? ''),
        text: String(e.text).slice(0, 200),
        tags: Array.isArray(e.tags) && e.tags.length ? sanitizeTags(e.tags.map(String)) : deriveTags(e.text),
        evidence: String(e.evidence ?? '').slice(0, 240),
        hits: Number.isFinite(Number(e.hits)) ? Math.max(1, Number(e.hits)) : 1,
        firstSeen: String(e.firstSeen ?? ''),
        lastSeen: String(e.lastSeen ?? ''),
        archived: e.archived === true,
      }))
  } catch {
    return []
  }
}

function writeAll(dataDir: string, entries: LibraryEntry[]): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(libraryPath(dataDir), JSON.stringify({ version: 2, entries }, null, 2), 'utf8')
  } catch {
    /* 写不进去不影响对话 */
  }
}

function newId(): string {
  return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

/** 全量记录：同内容再出现就攒 hits、补标记，不重复插入 */
export function recordEntry(
  dataDir: string,
  input: { text: string; evidence?: string; tags?: string[] },
  now = new Date().toISOString(),
): LibraryEntry | null {
  const text = String(input.text ?? '').trim().slice(0, 200)
  const key = normalizeKey(text)
  if (!key) return null

  const all = readAll(dataDir)
  const hit = all.find((e) => normalizeKey(e.text) === key)
  const extra = (input.tags ?? []).map(String)
  if (hit) {
    hit.hits += 1
    hit.lastSeen = now
    hit.tags = sanitizeTags([...hit.tags, ...extra, ...deriveTags(text)])
    if (!hit.evidence && input.evidence) hit.evidence = String(input.evidence).slice(0, 240)
    writeAll(dataDir, all)
    return hit
  }

  const entry: LibraryEntry = {
    id: newId(),
    text,
    tags: sanitizeTags([...extra, ...deriveTags(text)]),
    evidence: String(input.evidence ?? '').slice(0, 240),
    hits: 1,
    firstSeen: now,
    lastSeen: now,
  }
  all.push(entry)
  const next = all.length > MAX_ENTRIES ? all.slice(-MAX_ENTRIES) : all
  writeAll(dataDir, next)
  return entry
}

/**
 * **物理删除**一条记忆（不可恢复）。
 *
 * 和 archiveEntry 的区别：归档是软删（记录还在文件里，只是不再参与召回），
 * 这个是真从 `记忆库.json` 里删掉 —— 记录错了、记重复了、不想留，才用它。
 */
export function deleteEntry(dataDir: string, id: string): boolean {
  const key = String(id ?? '')
  if (!key) return false
  const all = readAll(dataDir)
  const next = all.filter((e) => e.id !== key)
  if (next.length === all.length) return false
  writeAll(dataDir, next)
  return true
}

export function archiveEntry(dataDir: string, id: string): boolean {
  const all = readAll(dataDir)
  const hit = all.find((e) => e.id === id)
  if (!hit) return false
  hit.archived = true
  writeAll(dataDir, all)
  return true
}

export interface LibraryHit {
  id: string
  text: string
  tags: string[]
  evidence: string
  hits: number
  lastSeen: string
  score: number
  /** 命中了哪些词（界面高亮/解释用） */
  matched: string[]
}

/**
 * 检索：按查询词切分 → 命中 text 或 tags 计分。
 * 分数 = 命中词数 × 2 + 出现次数 × 0.5 + 时间新鲜度（30 天内线性，最多 +1.5）
 * 纯本地，不含向量；够用且可解释（界面上能说清"为什么召回这条"）。
 */
export function detectSubjects(text: string): string[] {
  const s = String(text ?? '')
  return SUBJECTS.filter(([, words]) => words.some((w) => s.includes(w))).map(([name]) => name)
}

/**
 * 中文二字组（bigram）。
 *
 * 为什么不继续用"整串包含"：中文没有空格，`电压表怎么接` 整串在正文里查不到。
 * 为什么不用最长公共子串：`透镜怎么成像` 与 `透镜成像是倒立的实像` 的
 * 最长公共子串只有「透镜」两个字（中间插了"怎么"），阈值高了就召不回。
 * 二字共现对语序不敏感，是中文检索的常规做法：
 *   透镜|镜怎|怎么|么成|成像  ∩  透镜|镜成|成像|像是… = {透镜, 成像}
 */
function bigrams(s: string): Set<string> {
  const t = String(s ?? '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  const out = new Set<string>()
  for (let i = 0; i + 2 <= t.length; i += 1) out.add(t.slice(i, i + 2))
  return out
}

export function searchLibrary(dataDir: string, query: string, topK = 5, subjects?: string[]): LibraryHit[] {
  const q = String(query ?? '').trim()
  if (!q) return []
  const rawTerms: string[] = ((q.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{2,}/g) ?? []) as string[]).concat([q.slice(0, 8)])
  const terms = Array.from(new Set(rawTerms.filter((t) => t.length >= 2)))
  if (!terms.length) return []
  const qBig = bigrams(q)
  const now = Date.now()
  const hits: LibraryHit[] = []
  for (const e of readAll(dataDir)) {
    if (e.archived) continue
    const direct = terms.filter((t) => e.text.includes(t) || e.tags.some((tag) => tag.includes(t) || t.includes(tag)))
    let matched = direct
    let overlap = direct.length * 2
    if (!direct.length) {
      // 整串查不到就退回二字共现；**至少两对**才算命中，
      // 否则"怎么""什么"这种词会把什么都拉回来
      const eBig = bigrams(e.text)
      const shared = Array.from(qBig).filter((g) => eBig.has(g))
      if (shared.length < 2) continue
      matched = shared
      overlap = Math.min(3, shared.length)
    }
    const sameSubject = Boolean(subjects?.length) && e.tags.some((tag) => subjects!.includes(tag))
    const ageDays = e.lastSeen ? (now - Date.parse(e.lastSeen)) / 86400000 : 999
    const fresh = Number.isFinite(ageDays) ? Math.max(0, 1.5 - ageDays / 30) : 0
    hits.push({
      id: e.id,
      text: e.text,
      tags: e.tags,
      evidence: e.evidence,
      hits: e.hits,
      lastSeen: e.lastSeen,
      score: overlap + Math.min(3, e.hits * 0.5) + fresh + (sameSubject ? 2.5 : 0),
      matched,
    })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK)
}

/** 拼成给模型看的召回块（没有命中就返回空串） */
export function recallBlock(dataDir: string, query: string, topK = 5): string {
  const hits = searchLibrary(dataDir, query, topK)
  if (!hits.length) return ''
  const lines = hits.map((h, i) => `${i + 1}. ${h.text}${h.tags.length ? '（' + h.tags.slice(0, 4).join('、') + '）' : ''}`)
  return ['# 以前记过的相关内容（检索结果，按相关度排序）', ...lines].join('\n')
}

export interface LibraryView {
  entries: Array<Pick<LibraryEntry, 'id' | 'text' | 'tags' | 'evidence' | 'hits' | 'firstSeen' | 'lastSeen'>>
  counts: { total: number; archived: number; tagged: number; bySubject: Record<string, number> }
}

export function viewLibrary(dataDir: string, limit = 200): LibraryView {
  const all = readAll(dataDir)
  const live = all.filter((e) => !e.archived)
  return {
    entries: live
      .slice()
      .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        text: e.text,
        tags: e.tags,
        evidence: e.evidence,
        hits: e.hits,
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
      })),
    counts: {
      total: all.length,
      archived: all.filter((e) => e.archived).length,
      tagged: live.filter((e) => e.tags.length > 0).length,
      bySubject: SUBJECTS.reduce<Record<string, number>>((acc, [name]) => {
        acc[name] = live.filter((e) => e.tags.includes(name)).length
        return acc
      }, {}),
    },
  }
}