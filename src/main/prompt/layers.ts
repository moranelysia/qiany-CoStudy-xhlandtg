/**
 * 提示词分层 —— 「拼一叠纸」而不是「写一大坨」。
 *
 * 【为什么分层】（沿用参考版的设计，理由仍然成立）
 *   模型服务商对「请求开头完全一致的一大段」有缓存优惠（便宜约十倍）。
 *   所以：
 *     · 永远不变的东西（角色身份）放最前 —— 缓存的主力
 *     · 每次都可能变的东西（记忆、学习进度、时间）放最后 —— 不拖累前面
 *   以前把"关于学习者"的记忆夹在中间，导致它后面整段（含工具说明）全部无法命中缓存。
 *
 * 层次（从先到后）：
 *   1. 你是谁        角色卡来的，不变
 *   2. 你在这个模式  学习模式（本项目只有这一种）
 *   3. 你随时可以记事 记忆写入协议
 *   4. 你记得的事    记忆注入
 *   5. 学习进度 / 学习任务
 *   6. 现在是什么时候 （单独放最后一条消息，见 buildTime）
 *
 * 去角色化：这里没有硬编码角色名，全部来自角色卡；
 * 人称统一中性 —— 对学习者用「你」，不出现「他/她」。
 */
import type { CharacterCard } from '../character'


/**
 * 维度 → 行为指令。
 *
 * 关键取舍：**只翻译极端值**（>=70 或 <=30），中间值保持沉默。
 * 12 个维度如果全写进提示词，会变成一屏形容词，模型抓不住重点，
 * 反而每一条都只做一半。极端值才是真正区分这个角色的地方。
 */
const DIM_HINT: Array<{ key: string; high: string; low: string }> = [
  { key: 'warmth', high: '语气偏暖，会先接住对方的情绪再讲内容', low: '语气克制，不寒暄，直接进入内容' },
  { key: 'formal', high: '用词正式、有结构，像讲义', low: '口语、随意，像同桌在说话' },
  { key: 'humor', high: '允许开玩笑、用俏皮话调节节奏', low: '不开玩笑，保持平实' },
  { key: 'patience', high: '同一个点可以换三种说法反复讲，不催', low: '讲一遍就往下走，节奏快' },
  { key: 'strict', high: '要求严格：答案不规范会指出来', low: '宽松：先鼓励，细节以后再说' },
  { key: 'proactive', high: '主动提问、主动推进，不等对方开口', low: '被动：等对方问，只回应' },
  { key: 'encourage', high: '多给正反馈，进步就点出来', low: '少夸，只讲事实' },
  { key: 'verbosity', high: '解释可以长，愿意铺开讲', low: '能一句说完就一句' },
  { key: 'abstract', high: '先讲原理和结构，再落到例子', low: '先给具体例子，再总结规律' },
  { key: 'pace', high: '节奏慢，每步都停下来确认', low: '节奏快，一次推进多步' },
  { key: 'affinity', high: '关系亲近，会提及你们一起的经历', low: '保持距离，只谈学习' },
  { key: 'stability', high: '表达稳定，不用语气词和感叹号', low: '表达跳跃，情绪外露' },
]

/** 把维度翻成几行行为指令；全中性时返回空串（不占提示词） */
export function buildDimHints(dims: Record<string, number>): string {
  const lines: string[] = []
  for (const hint of DIM_HINT) {
    const value = dims[hint.key] ?? 50
    if (value >= 70) lines.push(`· ${hint.high}`)
    else if (value <= 30) lines.push(`· ${hint.low}`)
  }
  return lines.length ? ['【你的说话方式（由性格维度决定）】', ...lines, ''].join('\\n') : ''
}

/** 第一层：你是谁。真正决定"像不像那个角色"的一层。 */
export function buildIdentity(card: CharacterCard): string {
  const lines: string[] = []

  // 关键：不是"扮演"，是"就是"。这两句的差别在实测里很大。
  lines.push(
    `你就是「${card.name}」。不是「扮演」${card.name} —— 你就是 TA 本身，用第一人称说中文。`,
    '',
  )

  if (card.personality) lines.push('【你是谁】', card.personality, '')
  if (card.description) lines.push('【你的来历】', card.description, '')
  if (card.scenario) lines.push('【你在哪儿】', card.scenario, '')
  if (card.systemPrompt) lines.push(card.systemPrompt, '')

  // 扩展字段：伴学角色卡专有的语气与守则
  if (card.cosplay.style) lines.push('【你怎么说话】', card.cosplay.style, '')
  if (card.cosplay.rules) lines.push('【守则】', card.cosplay.rules, '')
  if (card.cosplay.behavior) lines.push('【你在场的样子】', card.cosplay.behavior, '')
  if (card.mesExample) lines.push('【像你、和不像你的例子】', card.mesExample, '')
  if (card.postHistoryInstructions) lines.push('【开口之前】', card.postHistoryInstructions, '')

  // 性格维度：决定"怎么讲"，比"是谁"更影响实际体验
  const dims = buildDimHints(card.dims)
  if (dims) lines.push(dims)

  // 称呼：角色卡里定的，默认「同学」
  lines.push(
    '【怎么称呼对方】',
    `叫对方「${card.cosplay.address}」。不要用「他」「她」来指代对方 —— 对方就在你面前，说「你」。`,
    '',
  )

  return lines.join('\n')
}

/** 第三层：记事协议（告诉模型怎么往记忆里写东西） */
export function buildNotebookLayer(): string {
  return [
    '===== 你随时可以记事 =====',
    '',
    '往自己的本子上写东西，写法是在话的最后单独起一行：',
    '  [记住:对方今天有两门课要交]          ← 关于对方的事',
    '  [经历:今天一起把二次函数过了一遍]    ← 你们一起经历的事',
    '',
    '什么时候写：对方明确让你记住的；或者你听到了值得留下的、关于对方的事。',
    '一次最多写两条，宁少勿多 —— 本子写满了反而看不清。',
    '这两个标记对方不会看见。',
    '',
  ].join('\n')
}

export interface MemorySnippets {
  /** 关于对方的事实（每条一行，已带时间前缀） */
  facts?: string
  /** 共同经历 */
  experiences?: string
  /** 小本子里的零散记录 */
  notes?: string
  /** 待复习的疑难（阶段 4/5 会填，这里先留口子） */
  pending?: string
}

/** 第四层：你记得的事。放最后，因为它每轮都可能变。 */
export function buildMemoryLayer(memory: MemorySnippets): string {
  const facts = (memory.facts ?? '').trim()
  const experiences = (memory.experiences ?? '').trim()
  const notes = (memory.notes ?? '').trim()
  const pending = (memory.pending ?? '').trim()

  const lines: string[] = ['===== 你记得的事（只信这里写着的，别的不许当成记忆）=====', '']

  if (facts) lines.push('【关于眼前这个人】', facts, '')
  else lines.push('【关于眼前这个人】（记忆是空的；这是全新的相遇，不要假装认识对方）', '')

  if (experiences) lines.push('【你们一起经历过的事】', experiences, '')
  if (pending) lines.push('【还没弄明白的地方】', pending, '')
  if (notes) lines.push('【你随手记下的小本子】', notes, '')

  lines.push(
    '上面没写的事，就是你不记得的事。别讲「上次我们聊过」「那天你说过」——' +
      '除非上面真的写着。记不清就问一句，这比编一个顺口的版本好得多。',
    '',
  )

  return lines.join('\n')
}

/**
 * 「现在是什么时候」。
 * 单独拿出来，并且放在**所有消息的最后** —— 它每次都变，
 * 混进上面那叠纸里会把缓存全废掉。
 */
export function buildTime(now: Date = new Date()): string {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
  const hour = now.getHours()
  const period =
    hour < 5 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午'
      : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'

  return (
    `【现在】${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 ` +
    `${week}，现在${period} ${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}。\n` +
    '（用这个判断要不要关心对方：深夜了问一句怎么还没睡；早上问今天有什么安排。' +
    '别把时间念出来，你自己心里有数就行。）'
  )
}

/** 一层层拼起来。空段自动丢掉。 */
export function composeLayers(layers: Array<string | undefined | null>): string {
  return layers.filter((part): part is string => Boolean(part && part.trim())).join('\n')
}
