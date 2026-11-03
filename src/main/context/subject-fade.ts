/**
 * 跨学科的"适当遗忘"（不删除，只收起）。
 *
 * 场景：上一轮在问英语，这一轮换成数学。如果 12 条历史原样塞进提示词，
 * 英语那几段会占掉大半个窗口，还会把回答的风格带偏（数学题用英文例句的语气）。
 *
 * 做法（纯函数，能单测）：
 *   · 同科目：原样保留
 *   · 别的科目：最近 2 条原样保留（保证连续追问能接上），更早的压成一行"提要"
 *   · 数据本身一个字都不删 —— 记忆库、会话文件都还在，只是**这一轮提示词里被收起来**
 *   · 切换回来时自动恢复：因为是按"当前科目的相反面"来判断，回英语又变成数学被收起
 */
import { detectSubjects } from '../memory/library'

export interface FadeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface FadeResult {
  messages: FadeMessage[]
  /** 被收起的条数（诊断用） */
  faded: number
  /** 当前科目（识别不出来就是空） */
  subject: string
}

/** 这条消息属于哪个科目：先看文本里有没有科目词，识别不出返回空 */
export function subjectOf(text: string): string {
  const list = detectSubjects(String(text ?? ''))
  return list[0] ?? ''
}

/**
 * 收起来自其它科目的旧消息。
 * @param keepForeign 最近几条"别的科目"消息仍原样保留（默认 2）
 */
export function fadeOtherSubjects(messages: FadeMessage[], currentSubject: string, keepForeign = 2): FadeResult {
  if (!currentSubject) return { messages, faded: 0, subject: '' }

  // 从后往前标记：别的科目且超出 keepForeign 的，收起来
  const foreignIndexes: number[] = []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const subj = subjectOf(messages[i].content)
    if (subj && subj !== currentSubject) foreignIndexes.push(i)
  }
  const toFade = new Set(foreignIndexes.slice(Math.max(0, keepForeign)))

  if (!toFade.size) return { messages, faded: 0, subject: currentSubject }

  // 被收起的按科目聚成一行提要，插在它们原来最靠前的位置
  const digestBySubject = new Map<string, string[]>()
  const out: FadeMessage[] = []
  let digestInserted = false
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]
    if (!toFade.has(i)) {
      out.push(m)
      continue
    }
    const subj = subjectOf(m.content) || '别的科目'
    const list = digestBySubject.get(subj) ?? []
    if (list.length < 2) {
      list.push(m.content.replace(/\s+/g, ' ').slice(0, 40))
      digestBySubject.set(subj, list)
    }
    if (!digestInserted) {
      const lines = Array.from(digestBySubject.entries())
        .map(([s, items]) => s + '：' + items.join(' / '))
        .join('；')
      out.push({ role: 'assistant', content: '（已收起前面的' + lines + '。需要时再展开。）' })
      digestInserted = true
    }
  }
  return { messages: out, faded: toFade.size, subject: currentSubject }
}
