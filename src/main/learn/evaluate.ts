/**
 * P4 评估闭环：判断学习者这一句答对没答对，以及**答错时错在哪**。
 *
 * 为什么单独一次调用而不是让主对话"顺便判"：
 *   主对话在讲题，让它同时输出判定，容易两边都做不好；
 *   而且主进程必须拿到一个**可解析的结论**才能更新掌握度和错题本。
 *
 * 为什么还要错因：
 *   "错了"是不可复用的信息。下次遇到同类题，只知道"你错了"，
 *   于是只能泛泛地说"注意审题"。真正可复用的是两样：
 *     · errorType —— 错误类型（符号 / 概念 / 计算 / 审题 / 方法）
 *     · wrongStep —— 具体拐错的那一步（"移项时没变号"）
 *
 * 判据只问一件事：这段回答是否解决了上一个问题。
 * 不评价态度、不评价表述，判不出来就返回 null（宁可不记，不要记错）。
 */
import type { LlmClient } from '../llm/client'
import { ERROR_TYPES, type ErrorType } from './mistakes'

export interface JudgeResult {
  /** true = 答对，false = 答错，null = 判不出来 */
  correct: boolean | null
  reason: string
  /** 答错时的错因分类；答对 / 判不出来时为 undefined */
  errorType?: ErrorType
  /** 答错时具体拐错的那一步（20 字以内） */
  wrongStep?: string
}

const SYSTEM = [
  '你在判断学生对一道题的回答是否正确，并在答错时判断错因。',
  '',
  '输出格式（最多三行，不要解释、不要空行）：',
  '第一行：对 / 错 / 不确定',
  '第二行（只在答错时写）：类型: 符号错误｜概念混淆｜计算失误｜审题偏差｜方法不当｜其他',
  '第三行（只在答错时写）：步骤: 一句话说清拐错的那一步，20 字以内',
  '',
  '判定标准：',
  '· 对：核心结论或关键步骤正确，表述不严谨也算对。',
  '· 错：结论错误，或关键步骤缺失/走错方向。',
  '· 不确定：学生没有给出可判定的内容（在提问、跑题、只说"不懂"、或答案不完整到无法判断）。',
].join('\n')

/**
 * 把模型输出解析成结论。
 *
 * 单独抽出来是为了能脱机单测：不用烧 token 也能验证「错 + 类型 + 步骤」三种情况。
 */
export function parseVerdict(raw: string): JudgeResult {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // 只看第一行，避免第二三行里的"错""对"影响判定
  const head = (lines[0] ?? '').slice(0, 20)
  const rest = lines.slice(1)

  const field = (label: string): string => {
    for (const line of rest) {
      const m = line.match(new RegExp('^' + label + '\\s*[:：]\\s*(.+)$'))
      if (m) return m[1].trim()
    }
    return ''
  }

  const typeText = field('类型')
  const errorType = (ERROR_TYPES as readonly string[]).find((t) => typeText.includes(t)) as
    | ErrorType
    | undefined
  const wrongStep = field('步骤').slice(0, 40)

  if (head.includes('对') && !head.includes('不对') && !head.includes('错')) {
    return { correct: true, reason: head }
  }
  if (head.includes('错')) {
    // 错因解析不出来也要记，归到「其他」，不要因为格式问题丢掉整条错题
    return { correct: false, reason: head, errorType: errorType ?? '其他', wrongStep }
  }
  return { correct: null, reason: head || '空响应' }
}

export async function judgeAnswer(
  client: LlmClient,
  input: { question: string; answer: string; point?: string },
): Promise<JudgeResult> {
  const answer = input.answer.trim()
  if (!answer) return { correct: null, reason: '空回答' }

  // 注意：不要把 input.point 塞进提示。
  // 知识点标签和题目不一致时（比如点在「正弦定理」、题却是二次方程），
  // 模型会倾向判错 —— 实测把正确答案判成 wrong。判对错只需要问题 + 回答。
  const user = [
    '上一个问题：' + input.question.slice(0, 600),
    '学生的回答：' + answer.slice(0, 600),
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const raw = await client.complete(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      // 推理模型要留预算：太小会只剩推理、没有正文
      { maxTokens: 800, temperature: 0 },
    )
    return parseVerdict(raw)
  } catch (err) {
    return { correct: null, reason: '判定失败：' + (err as Error).message }
  }
}
