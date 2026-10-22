/**
 * 配置 —— 所有可迁移的路径与应用身份只在这里决定。
 *
 * 优先级：环境变量（COSTUDY_*）> 配置文件 > 默认值。
 * 配置文件里的相对路径一律相对「工作区」，而不是进程当前目录。
 *
 * 去角色化（阶段 1）的三条硬要求：
 *   1. 命名空间从 ELYSIA_* 换成 COSTUDY_*，但**旧名保留兼容读取**，
 *      否则用户升级后找不到自己原来的数据，会以为数据丢了。
 *   2. 配置文件默认 costudy.config.json；如果它不存在而 elysia.config.json
 *      还在，就读旧的那份（迁移期不能让人重新配一遍）。
 *   3. 应用名 / 应用 ID / 窗口标题全部来自这里，代码里不再出现任何角色名。
 *
 * 这个模块**不 import electron** —— 保持纯函数、可单测。
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * 迁移期兼容白名单。
 *
 * 这几处**故意**保留旧名字，缺了会让老用户丢配置：
 *   1. 环境变量前缀 ELYSIA_*（新前缀 COSTUDY_* 不存在时才读）
 *   2. 配置文件 elysia.config.json（costudy.config.json 不存在时才读）
 *
 * 除本文件以外的任何地方都不该出现这些词 —— smoke 会检查系统提示里没有它们。
 */
export const LEGACY_ENV_PREFIX = 'ELYSIA_'
export const LEGACY_CONFIG_FILE = 'elysia.config.json'
/** 用于自动化检查的禁用词表（只在这里出现一次） */
export const LEGACY_NAMES = ['爱莉希雅', 'elysia', 'ELYSIA'] as const

/** 学段：决定讲解的深度与例子风格（阶段 4 会用到，这里先定下来） */
export const STAGES = ['小学', '初中', '高中', '大学', '成人自学', '不限'] as const
export type Stage = (typeof STAGES)[number]

export interface CostudyConfig {
  /** 程序目录（打包后是 resources/app，开发时是工程根） */
  projectRoot: string
  /** 用户的长期数据根目录：学习资料、记忆、角色卡都在这下面 */
  workspaceRoot: string
  /** 实际生效的配置文件路径（可能指向旧的 elysia.config.json） */
  configFile: string
  /** 配置文件解析出来的原始对象（给调试 / 迁移用） */
  fileConfig: Record<string, unknown>
  /** 运行数据目录（记忆、会话） */
  dataDir: string
  /** 缓存目录 */
  cacheDir: string
  /** 学习资料目录（只读材料 + 笔记 + 练习） */
  learningDir: string
  /** 当前生效的角色卡文件 */
  cardPath: string
  /** 内置模板目录（blank.character.json 等） */
  templatesDir: string
  /** 应用显示名（托盘、窗口标题、通知都用它） */
  appName: string
  /** 应用 ID（Windows 的通知 / 任务栏分组） */
  appId: string
  /** 默认学段 */
  stage: Stage
}

/**
 * 读环境变量，环境变量优先于配置文件。
 * 两套前缀都认：新的 COSTUDY_* 优先，旧的 ELYSIA_* 作为迁移期兜底。
 */
function envBoth(suffix: string): string | undefined {
  const fresh = process.env['COSTUDY_' + suffix]
  if (fresh !== undefined && fresh !== '') return fresh
  const legacy = process.env[LEGACY_ENV_PREFIX + suffix]
  if (legacy !== undefined && legacy !== '') return legacy
  return undefined
}

function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return null
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[配置] 读不动配置文件 ' + file + '：' + (err as Error).message)
    }
    return null
  }
}

function textOf(fileConfig: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fileConfig[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

export interface ConfigOptions {
  /** 程序目录；主进程传 app.getAppPath()，测试可传临时目录 */
  projectRoot: string
}

export function loadConfig(options: ConfigOptions): CostudyConfig {
  const projectRoot = path.resolve(options.projectRoot)

  // 工作区默认是程序目录的上一级（便携版常见布局），可用环境变量覆盖
  const workspaceRoot = path.resolve(
    envBoth('WORKSPACE_ROOT') ?? path.join(projectRoot, '..'),
  )

  // 配置文件：新名优先；新名不存在而旧名存在时读旧名（迁移期兼容）
  const freshConfigFile = path.resolve(
    envBoth('CONFIG_FILE') ?? path.join(workspaceRoot, 'costudy.config.json'),
  )
  const legacyConfigFile = path.join(workspaceRoot, LEGACY_CONFIG_FILE)
  const configFile =
    !fs.existsSync(freshConfigFile) && fs.existsSync(legacyConfigFile)
      ? legacyConfigFile
      : freshConfigFile
  const fileConfig = readJsonFile(configFile) ?? {}

  const pathValue = (suffix: string, keys: string[], fallback: string): string => {
    const raw = envBoth(suffix) ?? textOf(fileConfig, keys) ?? fallback
    return path.resolve(workspaceRoot, String(raw))
  }

  const dataDir = pathValue('DATA_DIR', ['dataDir'], path.join(projectRoot, '记忆'))
  const stageRaw = envBoth('STAGE') ?? textOf(fileConfig, ['stage'])
  const stage: Stage = (STAGES as readonly string[]).includes(stageRaw ?? '')
    ? (stageRaw as Stage)
    : '不限'

  return {
    projectRoot,
    workspaceRoot,
    configFile,
    fileConfig,
    dataDir,
    cacheDir: pathValue('CACHE_DIR', ['cacheDir'], path.join(projectRoot, '.cache')),
    learningDir: pathValue('LEARNING_DIR', ['learningDir'], '学习'),
    // 默认角色卡放在数据目录下；用户换卡就是换这个路径
    cardPath: pathValue('CARD_FILE', ['personaFile', 'cardFile'], path.join(dataDir, 'cards', 'active.card.json')),
    templatesDir: path.resolve(projectRoot, 'templates'),
    appName: envBoth('APP_NAME') ?? textOf(fileConfig, ['appName']) ?? '伴学',
    appId: envBoth('APP_ID') ?? textOf(fileConfig, ['appId']) ?? 'com.costudy.app',
    stage,
  }
}

/** 确保运行需要的目录存在（第一次启动时调用一次即可） */
export function ensureDirs(config: CostudyConfig): void {
  for (const dir of [
    config.dataDir,
    config.cacheDir,
    path.dirname(config.cardPath),
    config.learningDir,
    path.join(config.dataDir, '记忆'),
    path.join(config.dataDir, '会话'),
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
