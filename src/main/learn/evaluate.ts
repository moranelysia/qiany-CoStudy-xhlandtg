/**
 * P4 评估闭环：判断学习者这一句答对没答对。
 *
 * 为什么单独一次调用而不是让主对话"顺便判"：
 *   主对话在讲题，让它同时输出判定，容易两边都做不好；
 *   而且主进程必须拿到一个**可解析的结论**才能更新掌握度和错题本。
 *
 * 判据只问一件事：这段回答是否解决了上一个问题。
 * 不评价态度、不评价表述，判不出来就返回 null（宁可不记，不要记错）。
 */
import type { LlmClient } from '../llm/client'

export interface JudgeResult {
  /** true = 答对，false = 答错，null = 判不出来 */
  correct: boolean | null
  reason: string
}

const SYSTEM = [
  '你在判断学生对一道题的回答是否正确。',
  '',
  '输出格式（只输出一行，不要解释）：',
  '  对',
  '  错',
  '  不确定',
  '',
  '判定标准：',
  '· 对：核心结论或关键步骤正确，表述不严谨也算对。',
  '· 错：结论错误，或关键步骤缺失/走错方向。',
  '· 不确定：学生没有给出可判定的内容（在提问、跑题、只说"不懂"、或答案不完整到无法判断）。',
].join('\n')

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
    const text = raw.trim()
    // 只看前 20 个字，避免模型写解释影响判断
    const head = text.slice(0, 20)
    if (head.includes('对') && !head.includes('不对') && !head.includes('错')) {
      return { correct: true, reason: head }
    }
    if (head.includes('错')) return { correct: false, reason: head }
    return { correct: null, reason: head || '空响应' }
  } catch (err) {
    return { correct: null, reason: '判定失败：' + (err as Error).message }
  }
}
