/**
 * 记忆压缩：第二层（聚类摘要）+ 第三层（抽象泛化）。
 *
 * 【为什么需要压缩】
 *   第一层评分只能"标出哪些不重要"，不能真正减少条目。
 *   聊两个月，即使只保留高分记忆，条目还是会涨到几百条。
 *   第二层把同一簇的低分记忆合并成一条摘要，原始条目归档；
 *   第三层从具体经历里提炼稳定规律（学习习惯、偏好），
 *   让"他做题必须先画图"这种跨情境的结论能被复用。
 *
 * 【为什么要有不依赖模型的兜底】
 *   没配 key 时压缩也要能工作，否则清理功能在一个刚装好的产品里永远不生效。
 *   兜底策略是确定性的：
 *     · 聚类：按 类别 + 关系 粗分（同知识点/同来源的算一簇）
 *     · 摘要：取该簇里最新的一条当代表，其余归档
 *     · 泛化：跳过（那是真需要模型的一步）
 *   有模型时走模型；没模型时也不会把数据弄乱。
 */
import type { MemoryRecord, MemoryKind } from '../memory/score'
import { allMemories, readMemory } from '../memory/score'
import type { LlmClient } from '../llm/client'

export interface Cluster {
  key: string
  kind: MemoryKind
  records: MemoryRecord[]
  /** 簇内平均重要性 */
  avgImportance: number
}

/**
 * 聚类：按 类别 + 首个关系（没有关系就用来源）分组。
 * 粗聚类是刻意的 —— 精细语义聚类需要向量，成本高且难以解释。
 * 用户能看懂"这五条都跟判别式有关"，但看不懂"余弦相似度 0.83"。
 */
export function clusterMemories(records: MemoryRecord[]): Cluster[] {
  const buckets = new Map<string, MemoryRecord[]>()
  for (const r of records) {
    const relation = r.meta.relations[0] ?? r.source ?? '未分类'
    const key = r.kind + '|' + relation
    const list = buckets.get(key) ?? []
    list.push(r)
    buckets.set(key, list)
  }

  const clusters: Cluster[] = []
  for (const [key, list] of buckets) {
    const avg = list.reduce((s, r) => s + r.meta.importance, 0) / list.length
    clusters.push({
      key,
      kind: list[0].kind,
      records: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      avgImportance: Math.round(avg * 1000) / 1000,
    })
  }
  return clusters.sort((a, b) => b.records.length - a.records.length)
}

export interface CompressPlan {
  /** 需要合并的簇（至少 minClusterSize 条且平均分不高） */
  clusters: Array<{ key: string; representative: MemoryRecord; archived: string[] }>
  /** 值不值得压（没有可压的就别调模型） */
  worthCompressing: boolean
}

/**
 * 生成压缩计划。**只出计划，不改数据** —— 压缩会归档用户记忆，
 * 必须先看计划再执行（和课程内容一样，AI 的动作要可回滚）。
 */
export function planCompression(records: MemoryRecord[], minClusterSize = 3): CompressPlan {
  const clusters = clusterMemories(records)
  const plan: CompressPlan['clusters'] = []

  for (const cluster of clusters) {
    // 只压"低分且条数多"的簇：高分记忆是资产，不该被合并掉
    if (cluster.records.length < minClusterSize) continue
    if (cluster.avgImportance >= 0.55) continue

    // 关键：归档集合里必须**排除高分条目**。
    // 踩过的坑：直接取"代表 + 其余全部归档"，会把簇里那条特别重要的
    // 记忆一起归档掉 —— 只因为它创建得早、排序靠后。
    const low = cluster.records.filter((r) => r.meta.importance < 0.55)
    if (low.length < minClusterSize) continue

    const [representative, ...rest] = low
    if (!representative) continue
    plan.push({
      key: cluster.key,
      representative,
      archived: rest.map((r) => r.id),
    })
  }

  return { clusters: plan, worthCompressing: plan.length > 0 }
}

/** 兜底摘要：不做生成，直接把代表条目当摘要（附条数） */
export function fallbackSummary(cluster: Cluster): string {
  const head = cluster.records[0]?.content ?? ''
  const more = cluster.records.length - 1
  return more > 0 ? `${head}（另有 ${more} 条同类记录已归档）` : head
}

export interface CompressResult {
  /** 用了模型还是兜底 */
  usedModel: boolean
  summaries: Array<{ key: string; text: string; archivedCount: number }>
  /** 给提示词用的"已压缩记忆"一行摘要 */
  digest: string
}

/**
 * 执行压缩。注意：**只产出摘要文本，不删除原始记录**。
 * 归档（改 status）由调用方决定 —— 这里不碰用户数据。
 */
export async function compress(
  client: LlmClient | null,
  records: MemoryRecord[],
  minClusterSize = 3,
): Promise<CompressResult> {
  const plan = planCompression(records, minClusterSize)
  if (!plan.worthCompressing) {
    return { usedModel: false, summaries: [], digest: '' }
  }

  const summaries: CompressResult['summaries'] = []
  let usedModel = false

  for (const item of plan.clusters) {
    const cluster = clusterMemories(records).find((c) => c.key === item.key)
    if (!cluster) continue

    if (!client) {
      summaries.push({
        key: item.key,
        text: fallbackSummary(cluster),
        archivedCount: item.archived.length,
      })
      continue
    }

    try {
      const text = await client.complete(
        [
          {
            role: 'system',
            content:
              '把下面几条关于同一个人的记忆合并成一句事实描述。' +
              '只保留能被后续对话用上的信息，不要评论、不要评价、不要加语气词。' +
              '输出一行中文，不超过 40 字。',
          },
          {
            role: 'user',
            content: cluster.records.map((r) => '- ' + r.content).join('\n'),
          },
        ],
        { temperature: 0.3, maxTokens: 200 },
      )
      const cleaned = text.trim().replace(/^["「]|["」]$/g, '')
      if (!cleaned) throw new Error('空摘要')
      summaries.push({
        key: item.key,
        text: cleaned.slice(0, 80),
        archivedCount: item.archived.length,
      })
      usedModel = true
    } catch {
      // 模型失败就退兜底：压缩不是关键路径，不能因为一次网络抖动把流程卡住
      summaries.push({
        key: item.key,
        text: fallbackSummary(cluster),
        archivedCount: item.archived.length,
      })
    }
  }

  const digest = summaries.length
    ? '【压缩记忆】\n' + summaries.map((s) => '· ' + s.text).join('\n')
    : ''

  return { usedModel, summaries, digest }
}

/**
 * 第三层：抽象泛化。
 *
 * 只做一件具体的事：从"经历类"记忆里提炼**稳定的学习习惯**。
 * 不做性格评价、不做情绪判断 —— 那些既不可靠也不该被当成事实传给模型。
 * 没有模型时直接返回空（这一层确实需要语言能力，兜底没有意义）。
 */
export async function generalize(
  client: LlmClient | null,
  records: MemoryRecord[],
): Promise<{ text: string; usedModel: boolean }> {
  if (!client) return { text: '', usedModel: false }

  const experiences = records.filter((r) => r.kind === 'experiences' || r.kind === 'notes')
  if (experiences.length < 5) return { text: '', usedModel: false }

  try {
    const text = await client.complete(
      [
        {
          role: 'system',
          content:
            '从下面这些学习经历里，提炼 1-2 条**稳定的学习习惯或偏好**。' +
            '必须是可复用的规律（例如"做题前一定要先画图"），' +
            '不要写评价、不要写情绪、不要编造。输出中文，每条一行，以 · 开头。' +
            '如果看不出稳定规律，直接输出空字符串。',
        },
        { role: 'user', content: experiences.slice(0, 20).map((r) => '- ' + r.content).join('\n') },
      ],
      { temperature: 0.2, maxTokens: 300 },
    )
    const cleaned = text.trim()
    if (!cleaned) return { text: '', usedModel: false }
    return { text: '【学习习惯】\n' + cleaned, usedModel: true }
  } catch {
    return { text: '', usedModel: false }
  }
}

/** 读全部记忆并给出一份压缩计划（界面/命令行用） */
export function previewCompression(dataDir: string, minClusterSize = 3): CompressPlan {
  return planCompression(allMemories(dataDir), minClusterSize)
}

export { readMemory }
