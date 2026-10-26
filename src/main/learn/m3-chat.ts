/**
 * M3：跟 AI 聊出来（后端）。
 *
 * 流程：
 *   用户一句需求 →（可选）搜到的资料 → 角色卡草稿 → **伴学示例** → 用户确认 → 落盘
 *
 * 为什么必须先出「伴学示例」：
 *   "性格：活泼、爱用比喻" 这种描述，用户判断不出像不像。
 *   同一道题用该角色的口吻讲一遍，才能一眼看出"是不是我要的那个感觉"。
 *
 * 搜索这一环暂时留空（`context` 参数）：
 *   X1 探测里 DS 的联网搜索还没确认可用（200 但正文为空，疑似推理预算被吃光）。
 *   先把不依赖搜索的链路打通，搜索接上后只要往 context 里塞资料即可。
 */
import type { CardDraft } from '../llm/generate-card'
import type { LlmClient } from '../llm/client'
import { generateCardDraft, diffCard } from '../llm/generate-card'
import type { CharacterCard } from '../character'

export interface M3Request {
  /** 用户原话，比如「我想要一个奶龙来伴学」 */
  brief: string
  /** 外部资料（搜索结果摘要）。没有就是空串 */
  context?: string
  /** 学段，影响示例里的题 */
  stage: string
}

export interface M3Result {
  ok: boolean
  draft?: CardDraft
  /** 伴学示例：同一道题用该角色口吻讲一遍 */
  sample?: string
  /** 生成时用的题目，方便界面回显 */
  question?: string
  diff?: Array<{ field: string; before: string; after: string }>
  ms?: number
  /** 是否用了搜索资料 */
  usedSearch?: boolean
  error?: string
}

const QUESTION = 'x² − 5x + 6 = 0 怎么解？'

/**
 * 把"用户已经设定好的部分"渲染成一段文本，喂给造角色的模型。
 *
 * 之前这里什么都不传 —— 用户在面板里调的 12 维和教学取向完全没参与生成，
 * 所以出来的角色当然是"模型自己编的"，不像他设定的那个。
 */
function renderSettingsBrief(card: CharacterCard | null): string {
  if (!card) return ''
  const lines: string[] = []
  const dims = Object.entries(card.dims ?? {})
    .filter(([, v]) => typeof v === 'number' && v !== 50)
    .map(([k, v]) => k + '=' + String(v))
  if (dims.length) lines.push('性格维度：' + dims.join(' / '))
  if (card.name && card.name !== '新角色') lines.push('当前角色名：' + card.name)
  if (card.cosplay.style) lines.push('已定说话风格：' + card.cosplay.style)
  if (card.cosplay.rules) lines.push('已定守则：' + card.cosplay.rules)
  if (card.cosplay.behavior) lines.push('已定在场表现：' + card.cosplay.behavior)
  if (card.personality) lines.push('已定性格：' + card.personality)
  return lines.join('\n')
}

function briefForGeneration(req: M3Request): string {
  const parts = [req.brief.trim()]
  if (req.context && req.context.trim()) {
    parts.push('', '【可参考的资料】', req.context.trim().slice(0, 3000))
  }
  return parts.join('\n')
}

/**
 * 让角色把同一道题讲一遍。
 * 这一步单独调用，是因为它的输出要**和卡片描述分开看** ——
 * 用户确认的是"感觉"，不是字段。
 */
async function buildSample(
  client: LlmClient,
  draft: CardDraft,
  stage: string,
): Promise<{ sample: string; question: string }> {
  const system = [
    '你现在要扮演下面这个伴学角色，给学习者讲一道题。',
    '要求：',
    '1. 只用角色的口吻说话，不要写"（角色设定）""作为AI"这类旁白。',
    '2. 长度 120–220 字，像真实对话里的两三句。',
    '3. 必须体现角色的说话风格，但**不要一次把题讲完** —— 讲一小步就停下来问。',
    '4. 不要用 markdown、不要列点。',
    '',
    '角色：' + draft.name + '（' + draft.emoji + '）',
    '称呼：' + draft.address,
    '性格：' + draft.personality,
    '说话风格：' + draft.style,
    '守则：' + draft.rules,
  ].join('\n')

  const user = '学段：' + stage + '\n学习者问：' + QUESTION + '\n\n请用这个角色的口吻回应。'

  try {
    const text = await client.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 900, temperature: 0.7 },
    )
    return { sample: text.trim(), question: QUESTION }
  } catch (err) {
    return { sample: '', question: QUESTION }
  }
}

export async function draftFromChat(
  client: LlmClient,
  req: M3Request,
  current: CharacterCard | null,
): Promise<M3Result> {
  const started = Date.now()

  if (!req.brief.trim()) {
    return { ok: false, error: '先说要谁（例如：我想要一个奶龙来伴学）' }
  }

  const gen = await generateCardDraft(client, {
    keywords: briefForGeneration(req),
    stage: req.stage,
    settings: renderSettingsBrief(current),
  })
  if (!gen.ok) {
    return { ok: false, error: gen.error, ms: Date.now() - started }
  }

  const { sample, question } = await buildSample(client, gen.draft, req.stage)

  return {
    ok: true,
    draft: gen.draft,
    sample,
    question,
    diff: current ? diffCard(current, gen.draft) : [],
    ms: Date.now() - started,
    usedSearch: Boolean(req.context && req.context.trim()),
  }
}

/** 草稿 → 写卡用的 patch（只取角色卡认识的字段） */
export function draftToPatch(draft: CardDraft): Record<string, string> {
  return {
    name: draft.name,
    emoji: draft.emoji,
    address: draft.address,
    personality: draft.personality,
    description: draft.description,
    scenario: draft.scenario,
    style: draft.style,
    rules: draft.rules,
    behavior: draft.behavior,
    opening: draft.opening,
    firstMes: draft.firstMes,
    mesExample: draft.mesExample,
    systemPrompt: draft.systemPrompt,
    postHistoryInstructions: draft.postHistoryInstructions,
  }
}
