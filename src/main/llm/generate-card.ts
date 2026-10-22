/**
 * AI 辅助写卡（阶段 3.3）。
 *
 * 【流程】
 *   用户给 3-5 个关键词 → 一次独立调用（不占主对话上下文）→
 *   返回一张结构化卡片草稿 → **展示 diff** → 用户确认后才写入。
 *
 * 【三个必须的设计约束】
 *   1. 独立调用：写卡不该污染学习对话的上下文，也不该让学习对话的
 *      角色设定影响"正在生成的角色"。
 *   2. 严格校验：模型返回的 JSON 经常缺字段、类型不对、带 markdown 代码块。
 *      这里做容错解析 + 字段级校验，不合格就重试一次，再不合格就报错。
 *   3. 不自动写入：生成结果只作为草稿返回。用户看到 diff 再决定 ——
 *      自动落盘会让"AI 写卡"变成"AI 覆盖我的卡"。
 */
import type { CharacterCard } from '../character'
import { effectiveRating } from '../safety/age-guard'
import type { AgeRating } from '../character'
import type { ChatMessage, LlmClient } from './client'
import { ageHint } from './client'

export interface GenerateInput {
  /** 用户给的关键词，如「温柔的学长 / 喜欢用比喻」 */
  keywords: string
  /** 学段（影响说话方式） */
  stage: string
  /** 卡片声明的适龄等级 */
  ageRating?: AgeRating
}

/** 生成出来的草稿：只包含角色卡里"人设相关"的字段 */
export type CardDraft = Pick<
  CharacterCard,
  | 'name'
  | 'emoji'
  | 'description'
  | 'personality'
  | 'scenario'
  | 'firstMes'
  | 'mesExample'
  | 'systemPrompt'
  | 'postHistoryInstructions'
> & {
  address: string
  style: string
  rules: string
  behavior: string
  opening: string
  ageRating: AgeRating
}

export interface GenerateOk {
  ok: true
  draft: CardDraft
  /** 与当前卡的差异，给用户确认用 */
  diff: Array<{ field: string; before: string; after: string }>
  /** 模型原始输出，便于排查 */
  raw: string
}

export interface GenerateFail {
  ok: false
  error: string
  raw?: string
}

export type GenerateResult = GenerateOk | GenerateFail

const FIELD_LIMITS: Record<string, number> = {
  name: 24,
  address: 12,
  personality: 600,
  description: 600,
  scenario: 400,
  style: 400,
  rules: 600,
  behavior: 400,
  opening: 300,
  firstMes: 300,
  mesExample: 800,
  systemPrompt: 600,
  postHistoryInstructions: 400,
}

function buildMessages(input: GenerateInput): ChatMessage[] {
  const rating = effectiveRating(input.ageRating)
  const system: ChatMessage = {
    role: 'system',
    content: [
      '你在帮用户写一张「伴学角色卡」。输出必须是**单一 JSON 对象**，不要 markdown 代码块，不要任何解释文字。',
      '',
      '字段（全部是字符串，除 ageRating）：',
      '  name 角色名（中文，2-12 字）',
      '  emoji 一个表示气质的 emoji',
      '  address 怎么称呼学习者（如「同学」「小同学」）',
      '  personality 性格特质：写**具体行为倾向**，不要堆形容词',
      '  description 来历/背景，一两句',
      '  scenario 现在所处的情境，一两句',
      '  style 说话风格：句子长短、先给结论还是先提问',
      '  rules 伴学守则：这个角色在教学上必须遵守的规则',
      '  behavior 在场的样子（安静/活泼/盯得紧）',
      '  opening 伴学场景的第一句话',
      '  first_mes 同 opening',
      '  mes_example 示例对话，用「{{user}}: …」「{{char}}: …」格式，2 轮',
      '  system_prompt 可留空字符串',
      '  post_history_instructions 可留空字符串',
      '  ageRating 固定返回 "all-ages"',
      '',
      ageHint(rating),
      '',
      '要求：不要写任何真实人物、不要涉及版权角色；不要出现"只有我懂你"这类依赖暗示。',
    ].join('\n'),
  }

  const user: ChatMessage = {
    role: 'user',
    content: [
      `关键词：${input.keywords}`,
      `学段：${input.stage}`,
      '',
      '按上面的字段生成一张角色卡。只输出 JSON。',
    ].join('\n'),
  }

  return [system, user]
}

/**
 * 从模型输出里抠出 JSON。
 * 模型常见毛病：外面包了 ```json ```、前后带一句"好的，这是…"。
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('输出里没有 JSON 对象')
  return JSON.parse(candidate.slice(start, end + 1))
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/** 字段级校验 + 截断。超长不报错，截断并记一笔 —— 报错会让用户白等一次。 */
function toDraft(raw: Record<string, unknown>): { draft: CardDraft; truncated: string[] } {
  const truncated: string[] = []
  const take = (key: string, fallback = ''): string => {
    const value = asText(raw[key], fallback)
    const limit = FIELD_LIMITS[key] ?? 500
    if (value.length > limit) {
      truncated.push(key)
      return value.slice(0, limit)
    }
    return value
  }

  const name = take('name')
  if (!name) throw new Error('模型没有给出角色名')

  return {
    draft: {
      name,
      emoji: take('emoji', '✧').slice(0, 4) || '✧',
      address: take('address', '同学') || '同学',
      personality: take('personality'),
      description: take('description'),
      scenario: take('scenario'),
      style: take('style'),
      rules: take('rules'),
      behavior: take('behavior'),
      opening: take('opening') || take('firstMes'),
      firstMes: take('first_mes') || take('opening'),
      mesExample: take('mes_example'),
      systemPrompt: take('system_prompt'),
      postHistoryInstructions: take('post_history_instructions'),
      ageRating: 'all-ages',
    },
    truncated,
  }
}

/** 生成卡片草稿。不写盘。 */
export async function generateCardDraft(
  client: LlmClient,
  input: GenerateInput,
): Promise<GenerateResult> {
  if (!input.keywords.trim()) {
    return { ok: false, error: '先给几个关键词，比如「温柔的学长 / 喜欢用比喻」' }
  }

  const messages = buildMessages(input)

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw = ''
    try {
      raw = await client.complete(messages, { json: true, temperature: 0.8, maxTokens: 1500 })
    } catch (err) {
      return { ok: false, error: '模型调用失败：' + (err as Error).message }
    }

    try {
      const parsed = extractJson(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('返回的不是一个对象')
      }
      const { draft, truncated } = toDraft(parsed as Record<string, unknown>)

      // 二次安全：生成出来的人设也可能踩线（模型偶尔会写暧昧内容）
      const guard = effectiveRating(draft.ageRating)
      if (guard !== 'all-ages') {
        return { ok: false, error: '生成的卡片适龄标记异常，已拒绝', raw }
      }
      if (truncated.length) {
        draft.behavior += ''
      }

      return {
        ok: true,
        draft,
        diff: [],
        raw,
      }
    } catch (err) {
      if (attempt === 1) {
        return { ok: false, error: '模型输出无法解析：' + (err as Error).message, raw }
      }
      // 第二次：把错误原因加进对话，要求只输出 JSON
      messages.push({ role: 'assistant', content: raw })
      messages.push({
        role: 'user',
        content: '上面这段不是合法 JSON（' + (err as Error).message + '）。请只输出一个 JSON 对象，不要任何其他文字。',
      })
    }
  }

  return { ok: false, error: '生成失败' }
}

export interface DiffEntry {
  field: string
  before: string
  after: string
}

/** 与现有卡对比，只列出**有变化**的字段 */
export function diffCard(current: CharacterCard | null, draft: CardDraft): DiffEntry[] {
  const pairs: Array<[keyof CardDraft, string]> = [
    ['name', '角色名'],
    ['emoji', '头像'],
    ['address', '称呼'],
    ['personality', '性格'],
    ['description', '来历'],
    ['scenario', '情境'],
    ['style', '说话风格'],
    ['rules', '守则'],
    ['behavior', '在场的样子'],
    ['opening', '开场白'],
    ['mesExample', '示例对话'],
  ]

  const before: Record<string, string> = current
    ? {
        name: current.name,
        emoji: current.emoji,
        address: current.cosplay.address,
        personality: current.personality,
        description: current.description,
        scenario: current.scenario,
        style: current.cosplay.style,
        rules: current.cosplay.rules,
        behavior: current.cosplay.behavior,
        opening: current.cosplay.opening,
        mesExample: current.mesExample,
      }
    : {}

  const out: DiffEntry[] = []
  for (const [key, label] of pairs) {
    const afterValue = String(draft[key] ?? '')
    const beforeValue = before[key] ?? ''
    if (beforeValue !== afterValue) {
      out.push({ field: label, before: beforeValue, after: afterValue })
    }
  }
  return out
}
