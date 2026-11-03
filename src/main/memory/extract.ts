/**
 * 从模型回复里提取记忆标记（记忆轻量化第二批）。
 *
 * 约定：模型可以在回复里写 `[记住: 他做题必须画图]` / `[经历: 今天先做了三道判别式题]`，
 * 我们把它抠出来写进记忆文件，**并且从给用户看的文本里删掉**。
 *
 * 为什么用标记而不是让模型调工具：
 *   学习对话不需要工具调用那一套；一行标记足够，且失败时最坏情况是
 *   "没记住"，不会让整轮对话崩掉。
 *
 * 为什么单独成文件：
 *   这是纯函数，能脱离模型单测 —— 不用烧 tokens 也能验证解析对不对。
 */

export interface ExtractedMemory {
  kind: 'facts' | 'experiences' | 'point'
  content: string
  /** 模型给的分类标签（学科、类型），例如 ['物理','知识点'] */
  tags?: string[]
}

export interface ExtractResult {
  /** 去掉标记后的文本（给用户看的） */
  clean: string
  /** 要写进记忆的条目 */
  items: ExtractedMemory[]
}

// 支持可选分类尾巴：[记住: 电压表要并联 | 物理,知识点]
const MARKER = /\[(记住|经历|知识点)\s*[:：]\s*([^\]|]+?)(?:\s*[|｜]\s*([^\]]+))?\]/g

/** 单条内容上限：太长的多半是模型把整段话塞进来了，宁可截断 */
const MAX_CONTENT = 120

export function parseMemoryMarkers(text: string): ExtractResult {
  const items: ExtractedMemory[] = []

  MARKER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKER.exec(text)) !== null) {
    const kind = match[1] === '记住' ? 'facts' : 'experiences'
    const content = match[2].replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT)
    if (content) items.push({ kind, content })
  }

  // 删掉标记本身，并把因此多出来的空行压掉
  const clean = text
    .replace(MARKER, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { clean, items }
}