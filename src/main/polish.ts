/**
 * M1-1：AI 收尾提示词。
 *
 * 职责只有一个：把用户在面板上拧出来的设定（身份 / 性格 / 12 维 / 教学取向）
 * 汇总成一段描述，让模型写成**最终可用的 system prompt 文本**。
 *
 * 边界（重要）：
 *   · 只产出 systemPrompt 的文本，不重新设计角色，也不改卡片其它字段
 *   · 采用与否由用户点「采用」决定 —— 和 AI 写卡一样，绝不自动覆盖
 *
 * 为什么单独成文件而不是塞进 index.ts：
 *   index.ts 已经很长，而且它是主进程入口、每次改动风险最高。
 *   这种纯逻辑放在独立模块里，tsc 与自检都更容易覆盖。
 */
import type { CharacterCard } from './character'
import type { LlmClient } from './llm/client'

export interface PolishResult {
  ok: boolean
  text?: string
  ms?: number
  error?: string
}

function describeCard(card: CharacterCard, stage: string): string {
  const dims = Object.entries(card.dims ?? {})
    .filter(([, value]) => typeof value === 'number' && value !== 50)
    .map(([key, value]) => key + '=' + String(value))
    .join(' / ')

  return [
    '角色名：' + card.name,
    '称呼学习者：' + (card.cosplay.address || '同学'),
    '性格：' + (card.personality || '（未填）'),
    '来历：' + (card.description || '（未填）'),
    '情境：' + (card.scenario || '（未填）'),
    '说话风格：' + (card.cosplay.style || '（未填）'),
    '伴学守则：' + (card.cosplay.rules || '（未填）'),
    '在场的样子：' + (card.cosplay.behavior || '（未填）'),
    '性格维度（非中性项）：' + (dims || '（全中性）'),
    '学段：' + stage,
  ].join('\n')
}

const SYSTEM = [
  '你在为一个「伴学角色」写系统提示词（system prompt）。',
  '',
  '输出要求：',
  '1. 直接输出提示词正文，不要解释、不要代码块、不要前后客套。',
  '2. 结构固定四段，用【】小标题：你是谁 / 怎么讲 / 怎么纠错 / 边界。',
  '3. 「怎么讲」要具体到节奏与措辞习惯（先问还是先讲、句子长短、举例偏好）。',
  '4. 「边界」必须包含：不与学习者建立依赖、不索取个人信息、不做心理诊断、',
  '   遇到不适内容平静转回学习。',
  '5. 不写「你会尽量」这类空话，写成可执行的行为要求。',
  '6. 全文 400–700 字，中文。',
].join('\n')

export async function polishPrompt(
  client: LlmClient,
  card: CharacterCard,
  stage: string,
): Promise<PolishResult> {
  const started = Date.now()
  try {
    const text = await client.complete(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: '角色设定如下：\n\n' + describeCard(card, stage) + '\n\n请写出系统提示词。' },
      ],
      // 推理模型：推理与正文都要预算，给足 2000
      { maxTokens: 2000, temperature: 0.4 },
    )
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, ms: Date.now() - started, error: '模型返回空文本' }
    return { ok: true, text: trimmed, ms: Date.now() - started }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: (err as Error).message }
  }
}
