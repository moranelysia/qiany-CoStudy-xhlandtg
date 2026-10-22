/**
 * 系统提示的最终拼装。
 *
 * 层次顺序（顺序即缓存策略，别随手调）：
 *   1. 身份        角色卡来的，不变
 *   2. 学习模式    只有这一种模式
 *   3. 记事协议    不变
 *   4. 记忆        每轮可能变
 *   5. 学习进度    每学完一段就变
 *   6. 学习任务    每加一条 / 勾一条就变
 *   （7. 时间      不进系统提示，单独作为最后一条消息，见 buildTime）
 *
 * 阶段 1 只做「搬 + 去角色化」，chat/work 两层已经不存在了 ——
 * 参考版里 `能动手吗()` 那种按模式分支的写法，这里不再需要。
 */
import type { CharacterCard } from '../character'
import type { Stage } from '../config'
import { buildIdentity, buildMemoryLayer, buildNotebookLayer, composeLayers } from './layers'
import type { MemorySnippets } from './layers'
import { buildLearnLayer } from './learn'
import { ageGuardClause } from '../safety/age-guard'
import { phaseGuide } from '../learn/session'
import { formatForPrompt as formatMistakes } from '../learn/mistakes'
import { formatForPrompt as formatReview } from '../learn/points'
import type { SessionState } from '../learn/session'

export interface PromptOptions {
  card: CharacterCard
  learningDir: string
  stage: Stage
  memory?: MemorySnippets
  toolsDoc?: string
  envDoc?: string
  scopeDoc?: string
  /** 学习进度（阶段 4 生成，先留口子） */
  progress?: string
  /** 学习任务（阶段 4 生成） */
  task?: string
  /** 学习会话状态：决定"这一步该做什么" */
  session?: SessionState
  /**
   * 数据目录。给了它，错题本里的"还没弄明白的地方"会自动拼进记忆层，
   * 不用调用方每次自己查。
   */
  dataDir?: string
}

export function buildSystemPrompt(options: PromptOptions): string {
  const learn = buildLearnLayer({
    learningDir: options.learningDir,
    stage: options.stage,
    toolsDoc: options.toolsDoc,
    envDoc: options.envDoc,
    scopeDoc: options.scopeDoc,
  })

  return composeLayers([
    buildIdentity(options.card),
    learn,
    buildNotebookLayer(),
    buildMemoryLayer({
      ...(options.memory ?? {}),
      // 错题本里未纠正的条目自动接进来：这是"记住疑难"真正落地的地方
      pending:
        (options.memory?.pending ?? '') ||
        (options.dataDir ? formatMistakes(options.dataDir) : ''),
    }),
    options.progress,
    options.task,
    // 今天该复习的知识点（间隔重复）。放这里是因为它每过一天就变，
    // 越靠后越不拖累前面的缓存。
    options.dataDir ? formatReview(options.dataDir) : undefined,
    // 会话阶段：每轮只给它"现在这一步要干什么"，
    // 而不是把七个阶段全塞进去（那样等于让它自己挑一步，约束就没了）
    options.session ? phaseGuide(options.session) : undefined,
    // 安全准则放在**最后**：提示词末尾的内容依从度最高，
    // 而且它独立于角色卡 —— 卡片里写什么都压不过这一段。
    ageGuardClause(options.card.ageRating),
  ])
}

export { buildTime } from './layers'
