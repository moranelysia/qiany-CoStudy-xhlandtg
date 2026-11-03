/**
 * 图片（学生发来的照片 / 截图）。
 *
 * 【为什么要存盘、只回标记】
 *   和图表一个道理：图片塞进消息正文会把 jsonl 撑爆，模型也没必要复述它。
 *   所以：
 *     选图 → 存 `记忆/图片/<id>.<ext>` → 消息里只写 `[图片:i-xxxxxxxxxxxx]`
 *   渲染端凭 id 取 data URL 显示，点击可放大（复用图表的浮层）。
 *
 * 【当前模型看不了图怎么办（重要）】
 *   DeepSeek 官方模型是纯文本的，发图会直接报错。所以这里分成两条路：
 *     · 视觉模型（名字像 *-vl / *vision* / gpt-4o / gemini / claude…）→ 真的把图片发过去
 *     · 纯文本模型 → 不发图片，只在提示词里说明"对方发了一张图，你看不到"，
 *       让模型照实说、并请对方用文字补充。**不假装看到了。**
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface ImageMeta {
  id: string
  name: string
  mime: string
  ext: string
  bytes: number
  at: string
}

export interface StoredImage extends ImageMeta {
  file: string
}

const DIR = '图片'
const INDEX = '图片.json'
/** 消息里的标记：[图片:i-1a2b3c4d5e6f] */
export const IMAGE_MARKER = /\[图片:(i-[a-f0-9]{12})\]/g

function dir(dataDir: string): string {
  return path.join(dataDir, DIR)
}
function indexFile(dataDir: string): string {
  return path.join(dataDir, INDEX)
}

function readIndex(dataDir: string): ImageMeta[] {
  try {
    const raw = fs.readFileSync(indexFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const list = JSON.parse(raw) as ImageMeta[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeIndex(dataDir: string, list: ImageMeta[]): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(indexFile(dataDir), JSON.stringify(list, null, 2), 'utf8')
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/** 存一张图。写盘失败会抛 —— 不给调用方一个打不开的 id（图表那边踩过这个坑）。 */
export function saveImage(dataDir: string, input: { data: Buffer; mime?: string; name?: string }): StoredImage {
  const mime = String(input.mime || '').toLowerCase() || 'image/png'
  const ext = EXT_BY_MIME[mime] ?? 'png'
  const id = 'i-' + randomUUID().replace(/-/g, '').slice(0, 12)
  const file = path.join(dir(dataDir), id + '.' + ext)
  fs.mkdirSync(dir(dataDir), { recursive: true })
  fs.writeFileSync(file, input.data)
  const back = fs.readFileSync(file)
  if (back.length !== input.data.length) throw new Error('图片写入不完整')

  const meta: ImageMeta = {
    id,
    name: String(input.name || id + '.' + ext).slice(0, 120),
    mime,
    ext,
    bytes: input.data.length,
    at: new Date().toISOString(),
  }
  writeIndex(dataDir, [meta, ...readIndex(dataDir)].slice(0, 500))
  return { ...meta, file }
}

/** 按 id 取图；取不到返回 null（界面要显示"这张图找不到了"，不能静默） */
export function readImage(dataDir: string, id: string): StoredImage | null {
  if (!/^i-[a-f0-9]{12}$/.test(id)) return null
  const meta = readIndex(dataDir).find((m) => m.id === id)
  if (meta) {
    const file = path.join(dir(dataDir), meta.id + '.' + meta.ext)
    try {
      if (fs.existsSync(file)) return { ...meta, file }
    } catch {
      /* 落到下面的兜底 */
    }
  }
  // 索引丢了也还能按 id 找文件（扩展名挨个试）
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']) {
    const file = path.join(dir(dataDir), id + '.' + ext)
    try {
      if (fs.existsSync(file)) {
        return {
          id,
          name: id + '.' + ext,
          mime: MIME_BY_EXT[ext] ?? 'image/png',
          ext,
          bytes: fs.statSync(file).size,
          at: '',
          file,
        }
      }
    } catch {
      /* 继续试 */
    }
  }
  return null
}

/** 删掉一张图（清理 / 测试用）。删不掉返回 false，不抛。 */
export function deleteImage(dataDir: string, id: string): boolean {
  try {
    const meta = readIndex(dataDir).find((m) => m.id === id)
    if (meta) fs.rmSync(path.join(dir(dataDir), meta.id + '.' + meta.ext), { force: true })
    writeIndex(dataDir, readIndex(dataDir).filter((m) => m.id !== id))
    return true
  } catch {
    return false
  }
}

/** 从一段文字里取出所有图片 id（去重、保序） */
export function imageIds(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(IMAGE_MARKER.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** 把标记从给模型看的文本里去掉 */
export function stripImageMarkers(text: string): string {
  return text.replace(new RegExp(IMAGE_MARKER.source, 'g'), '').replace(/\n{3,}/g, '\n\n').trim()
}

/** 给模型的一句话说明（纯文本模型用它，视觉模型不需要） */
export function imagePromptNote(metas: Array<{ name: string }>): string {
  const list = metas.map((m) => '「' + m.name + '」').join('、')
  return (
    '【对方发来了图片】' + list + '。' +
    '**你当前使用的模型看不到图像内容**，所以不要描述图里有什么。' +
    '照实说一句"图我收到了，但我这边看不了图"，然后请对方用文字把题目抄一下，或者说说想弄懂什么。'
  )
}

/** 文件名安全化（Windows 不允许 \ / : * ? " < > |） */
export function safeImageName(name: string): string {
  return String(name || '照片').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

/** 读成 data URL（视觉模型要把图直接塞进请求体） */
export function imageDataUrl(img: StoredImage): string | null {
  try {
    return 'data:' + img.mime + ';base64,' + fs.readFileSync(img.file).toString('base64')
  } catch {
    return null
  }
}

export type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

/**
 * 把图片挂到最后一条用户消息上（OpenAI 兼容的多模态写法）。
 * 只在模型真能看图时调用 —— 纯文本模型收到这种 content 会 400。
 */
export function withImageParts<T extends { role: string; content: MessageContent }>(
  history: T[],
  images: StoredImage[],
): T[] {
  if (!images.length || !history.length) return history
  const urls = images.map(imageDataUrl).filter((u): u is string => Boolean(u))
  if (!urls.length) return history
  const last = history[history.length - 1]
  if (last.role !== 'user') return history
  const text = typeof last.content === 'string' ? last.content : ''
  const content: MessageContent = [
    { type: 'text', text },
    ...urls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]
  return [...history.slice(0, -1), { ...last, content }]
}
