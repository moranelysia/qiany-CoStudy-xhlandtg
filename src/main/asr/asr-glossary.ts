/**
 * ASR 专名/术语表 —— 只给模型当"谐音参考"，**不改写识别原文**。
 *
 * 这个设计是照着 elysia 那套做的（它明确写了"程序不再自动改写 ASR 原文"），
 * 但代码是重写的：那个仓库没有 LICENSE，不能直接复制它的文件。
 *
 * 为什么"不自动改写"：
 *   学生说「芽衣」「苏」「华」这种单字/短词，强行替换几乎一定错；
 *   「滑动变阻器」被听成「滑都变阻器」时，模型结合上下文能懂，直接改反而可能把原话改歪。
 *   所以：词表只进提示词，改不改由模型判断，拿不准就追问。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface GlossaryEntry {
  /** 标准写法 */
  term: string
  /** 类别：术语 / 人名 / 学科名词… */
  category: string
  /** 常见误识别写法（谐音） */
  wrong?: string[]
  /** 别自动替换：出现这些写法时只当参考，不许强行改 */
  noAutoFix?: boolean
}

export interface GlossaryFile {
  enabled: boolean
  /** 给模型看的规则 */
  rules: string[]
  entries: GlossaryEntry[]
}

const FILE = 'asr-词表.json'

/** 默认词表：先把伴学最容易被听错的理科词放进去 */
const DEFAULT: GlossaryFile = {
  enabled: true,
  rules: [
    'ASR 原文不改写；把下面的词当成"学生可能说的是这个"的参考。',
    '结合上下文判断谐音；拿不准就按原话问一句，不要擅自补成专有名词。',
    '被标记为"单字/高歧义"的词只作参考，绝不要替换原话。',
  ],
  entries: [
    { term: '滑动变阻器', category: '物理术语', wrong: ['滑都变阻器', '滑洞变阻器', '华动变阻器'] },
    { term: '伏安法', category: '物理实验', wrong: ['浮安法', '阜安法'] },
    { term: '电流表', category: '物理仪器', wrong: ['电流表', '电留表'] },
    { term: '电压表', category: '物理仪器', wrong: ['电鸭表', '电压表'] },
    { term: '凸透镜', category: '物理光学', wrong: ['秃透镜', '凸透境'] },
    { term: '双缝干涉', category: '物理光学', wrong: ['双缝干射', '双逢干涉'] },
    { term: '洛伦兹力', category: '物理', wrong: ['洛伦磁力', '洛伦兹里'] },
    { term: '楞次定律', category: '物理', wrong: ['愣次定律', '冷次定律'] },
    { term: '判别式', category: '数学', wrong: ['判变式', '判边式'] },
    { term: '余弦定理', category: '数学', wrong: ['鱼弦定理', '余玄定理'] },
    { term: '酯化反应', category: '化学', wrong: ['脂化反应', '酯华反应'] },
    { term: '有丝分裂', category: '生物', wrong: ['有私分裂', '有丝分列'] },
    { term: '细胞板', category: '生物', wrong: ['细胞版', '细胞半'] },
    { term: '光合作用', category: '生物', wrong: ['光和作用', '光和作用'] },
    { term: '染色体', category: '生物', wrong: ['染色体', '然色体'] },
    { term: '苏', category: '人名', noAutoFix: true },
    { term: '华', category: '人名', noAutoFix: true },
  ],
}

function file(dataDir: string): string {
  return path.join(dataDir, FILE)
}

/** 读词表：文件不存在就用默认（并落盘，方便用户直接编辑） */
export function readGlossary(dataDir: string): GlossaryFile {
  try {
    const raw = fs.readFileSync(file(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<GlossaryFile> | null
    if (parsed && Array.isArray(parsed.entries)) {
      return {
        enabled: parsed.enabled !== false,
        rules: Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules.map(String) : DEFAULT.rules,
        entries: parsed.entries
          .filter((e): e is GlossaryEntry => Boolean(e && typeof e.term === 'string' && e.term.trim()))
          .map((e) => ({
            term: String(e.term).trim(),
            category: typeof e.category === 'string' && e.category ? e.category : '术语',
            wrong: Array.isArray(e.wrong) ? e.wrong.map(String).filter(Boolean) : [],
            noAutoFix: e.noAutoFix === true,
          })),
      }
    }
  } catch {
    /* 用默认 */
  }
  const fresh = { ...DEFAULT, entries: DEFAULT.entries.map((e) => ({ ...e })) }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify(fresh, null, 2), 'utf8')
  } catch {
    /* 写不进去就只用内存里的 */
  }
  return fresh
}

export function saveGlossary(dataDir: string, next: GlossaryFile): GlossaryFile {
  const clean: GlossaryFile = {
    enabled: next.enabled !== false,
    rules: Array.isArray(next.rules) && next.rules.length ? next.rules.map(String) : DEFAULT.rules,
    entries: (Array.isArray(next.entries) ? next.entries : [])
      .filter((e) => e && typeof e.term === 'string' && e.term.trim())
      .map((e) => ({
        term: String(e.term).trim(),
        category: typeof e.category === 'string' && e.category ? e.category : '术语',
        wrong: Array.isArray(e.wrong) ? e.wrong.map(String).filter(Boolean) : [],
        noAutoFix: e.noAutoFix === true,
      })),
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file(dataDir), JSON.stringify(clean, null, 2), 'utf8')
  } catch {
    /* 内存值仍然返回 */
  }
  return clean
}

/**
 * 拼成给模型看的一段（放在系统提示里）。
 * 词条多的时候按类别分组、只列标准写法 + 常见误听，控制长度。
 */
export function glossaryPrompt(dataDir: string): string {
  const g = readGlossary(dataDir)
  if (!g.enabled || !g.entries.length) return ''
  const lines: string[] = ['# 语音输入可能听错的词（只作参考，不要擅自改写原话）']
  for (const rule of g.rules) lines.push('- ' + rule)
  const byCat = new Map<string, GlossaryEntry[]>()
  for (const e of g.entries) {
    const list = byCat.get(e.category) ?? []
    list.push(e)
    byCat.set(e.category, list)
  }
  for (const [cat, list] of byCat) {
    const parts = list.map((e) => {
      const wrong = (e.wrong ?? []).slice(0, 4)
      const tail = wrong.length ? '（常被听成：' + wrong.join('、') + '）' : ''
      return e.term + (e.noAutoFix ? '【单字，别替换】' : '') + tail
    })
    lines.push('- ' + cat + '：' + parts.join('；'))
  }
  return lines.join('\n')
}
