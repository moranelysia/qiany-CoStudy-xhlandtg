/**
 * 角色卡 —— 产品里唯一「人设」来源。
 *
 * 采用 **chara_card_v2**（SillyTavern 通用规范），这样用户可以直接把社区角色卡
 * 导进来，不用学我们的私有格式。
 *
 * 关键设计（沿用参考版的优点）：
 *   **每次都重读文件**。改完角色卡立刻生效，不需要重启应用。
 *   读一次缓存起来的做法会让"编辑器里改了但对话没变"变成玄学问题。
 *
 * 去角色化：这里不出现任何具体角色名，默认模板是空壳。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 伴学专用扩展字段（在 v2 的 extensions.dshCosplay 下） */
export interface CosplayExt {
  /** 稳定标识，用于文件命名与统计 */
  id: string
  /** 头像 emoji（没有图片资源时的兜底） */
  emoji: string
  /** 称呼学习者的方式，如「同学」 */
  address: string
  /** 说话风格 */
  style: string
  /** 伴学守则 */
  rules: string
  /** 在场的样子 / 行为基调 */
  behavior: string
  /** 开场白（伴学场景下的第一句） */
  opening: string
  /** 口头禅（伴学扩展）：最影响"像不像"，所以要能单独改 */
  catchphrase?: string
  /** 明确不做的（伴学扩展） */
  dislikes?: string
}

export type AgeRating = 'all-ages' | 'teen' | 'adult'

/** 12 个性格维度（0-100）。键固定，值缺省按 50（中性）。 */
export const DIM_KEYS = [
  'warmth',
  'formal',
  'humor',
  'patience',
  'strict',
  'proactive',
  'encourage',
  'verbosity',
  'abstract',
  'pace',
  'affinity',
  'stability',
] as const

export type DimKey = (typeof DIM_KEYS)[number]

export type Dims = Record<DimKey, number>

export function neutralDims(): Dims {
  const out = {} as Dims
  for (const key of DIM_KEYS) out[key] = 50
  return out
}

export interface CharacterCard {
  /** 文件位置，便于编辑器回写 */
  file: string
  name: string
  emoji: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  mesExample: string
  systemPrompt: string
  postHistoryInstructions: string
  cosplay: CosplayExt
  /** 性格维度：决定"怎么讲"，而不只是"是谁" */
  dims: Dims
  /**
   * 适龄标记。只允许**收紧**全局默认，不能放宽 ——
   * 真正的拦截在适龄护栏里做，这里只是声明。
   */
  ageRating: AgeRating
}

const AGE_RATINGS: readonly AgeRating[] = ['all-ages', 'teen', 'adult']

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读维度：非法值一律夹到 0-100，缺省 50 */
function readDims(raw: unknown): Dims {
  const out = neutralDims()
  if (!isRecord(raw)) return out
  for (const key of DIM_KEYS) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(100, Math.round(value)))
    }
  }
  return out
}

/** 把 chara_card_v2（或扁平结构）统一成我们的类型。缺字段一律给空串，不报错。 */
export function normalizeCard(raw: unknown, file: string): CharacterCard {
  const root = isRecord(raw) ? raw : {}
  // v2 规范把内容放在 data 下；也兼容直接铺在根上的写法
  const data = isRecord(root.data) ? root.data : root
  const extensions = isRecord(data.extensions) ? data.extensions : {}
  const cosplayRaw = isRecord(extensions.dshCosplay) ? extensions.dshCosplay : {}

  const name = str(data.name).trim() || '新角色'
  const ratingRaw = str(data.ageRating, 'all-ages')

  return {
    file,
    name,
    emoji: str(cosplayRaw.emoji, '✧'),
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    firstMes: str(data.first_mes),
    mesExample: str(data.mes_example),
    systemPrompt: str(data.system_prompt),
    postHistoryInstructions: str(data.post_history_instructions),
    cosplay: {
      id: str(cosplayRaw.id) || name,
      emoji: str(cosplayRaw.emoji, '✧'),
      // 兼容两种写法：address（新）与 suffix（旧）
      address: str(cosplayRaw.address) || str(cosplayRaw.suffix) || '同学',
      style: str(cosplayRaw.style),
      rules: str(cosplayRaw.rules),
      behavior: str(cosplayRaw.behavior),
      opening: str(cosplayRaw.opening) || str(data.first_mes),
      // 伴学扩展字段：读的时候要留，否则保存后重新加载就变空
      catchphrase: str(cosplayRaw.catchphrase),
      dislikes: str(cosplayRaw.dislikes),
    },
    dims: readDims(cosplayRaw.dims),
    ageRating: (AGE_RATINGS as readonly string[]).includes(ratingRaw)
      ? (ratingRaw as AgeRating)
      : 'all-ages',
  }
}

/**
 * 读角色卡。
 * 文件不存在时返回空壳卡（名字「新角色」），界面据此显示"还没有角色"引导，
 * 而不是崩掉或显示上一张卡。
 */
export function loadCard(cardPath: string): CharacterCard {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(cardPath, 'utf8').replace(/^\uFEFF/, ''))
    return normalizeCard(raw, cardPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[角色卡] 读不动 ' + cardPath + '：' + (err as Error).message)
    }
    return normalizeCard({}, cardPath)
  }
}

/** 序列化成 chara_card_v2 结构（保存与导出共用，避免两处结构走样） */
export function toV2Payload(card: CharacterCard): Record<string, unknown> {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_mes: card.firstMes,
      mes_example: card.mesExample,
      system_prompt: card.systemPrompt,
      post_history_instructions: card.postHistoryInstructions,
      ageRating: card.ageRating,
      extensions: {
        dshCosplay: {
          id: card.cosplay.id,
          emoji: card.emoji,
          address: card.cosplay.address,
          style: card.cosplay.style,
          rules: card.cosplay.rules,
          behavior: card.cosplay.behavior,
          opening: card.cosplay.opening,
          catchphrase: card.cosplay.catchphrase ?? '',
          dislikes: card.cosplay.dislikes ?? '',
          dims: card.dims,
        },
      },
    },
  }
}

/** 写回角色卡（保留 v2 结构）。编辑器保存时用。 */
export function saveCard(card: CharacterCard): void {
  fs.mkdirSync(path.dirname(card.file), { recursive: true })
  fs.writeFileSync(card.file, JSON.stringify(toV2Payload(card), null, 2) + '\n', 'utf8')
}
