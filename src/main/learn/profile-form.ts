/**
 * M2：学情画像（用户自己填的那份）。
 *
 * 和 `profile.ts` 的区别：
 *   · `profile.ts` 是**程序统计**出来的（学科掌握度、错题分布、待复习数）
 *   · 这里是**用户自己声明**的（年龄、学历、当前学情、想学的知识点、目标、可投入时间）
 *
 * 为什么要分开：
 *   声明的事实回答"他想学什么、在什么阶段"，
 *   统计的事实回答"他实际在哪、哪里薄弱"。
 *   两者打架时（比如他说"我数学还行"但掌握度 30%），提示词里应同时给出，
 *   让模型自己选择措辞 —— 而不是让程序替他判断谁对。
 *
 * 存储：`<dataDir>/学情.json`，原子写（临时文件 + rename）。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface DeclaredProfile {
  /** 年龄段：不写具体岁数，避免不必要的个人信息 */
  ageBand: '' | '小学' | '初中' | '高中' | '大学' | '工作后'
  /** 学历/身份，自由填 */
  education: string
  /** 当前学情：自评 + 最近一次成绩/进度 */
  currentLevel: string
  /** 具体想学的知识点（可多条） */
  targetPoints: string[]
  /** 目标：考试 / 兴趣 / 项目 / 补基础 */
  goal: string
  /** 每周可投入时间（小时） */
  weeklyHours: number
  /** 偏好：先讲后练 / 先练后讲 */
  preferOrder: '' | '先讲后练' | '先练后讲'
  /** 忌口：明确不希望出现的东西（比如"别用鸡汤""别叫我同学"） */
  dislikes: string[]
  updatedAt: string
}

export function emptyProfile(): DeclaredProfile {
  return {
    ageBand: '',
    education: '',
    currentLevel: '',
    targetPoints: [],
    goal: '',
    weeklyHours: 0,
    preferOrder: '',
    dislikes: [],
    updatedAt: '',
  }
}

export function declaredProfileFile(dataDir: string): string {
  return path.join(dataDir, '学情.json')
}

export function readDeclaredProfile(dataDir: string): DeclaredProfile {
  try {
    const raw = JSON.parse(
      fs.readFileSync(declaredProfileFile(dataDir), 'utf8').replace(/^\uFEFF/, ''),
    ) as Partial<DeclaredProfile>
    return { ...emptyProfile(), ...raw, updatedAt: raw.updatedAt ?? '' }
  } catch {
    return emptyProfile()
  }
}

/** 原子写：先写 .tmp 再 rename，中途断电不会留半个文件 */
export function saveDeclaredProfile(
  dataDir: string,
  patch: Partial<DeclaredProfile>,
): { ok: boolean; profile: DeclaredProfile; error?: string } {
  const current = readDeclaredProfile(dataDir)
  const next: DeclaredProfile = {
    ...current,
    ...patch,
    targetPoints: cleanList(patch.targetPoints ?? current.targetPoints),
    dislikes: cleanList(patch.dislikes ?? current.dislikes),
    weeklyHours: clampHours(patch.weeklyHours ?? current.weeklyHours),
    updatedAt: new Date().toISOString(),
  }

  try {
    const file = declaredProfileFile(dataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true, profile: next }
  } catch (err) {
    return { ok: false, profile: current, error: (err as Error).message }
  }
}

function cleanList(list: string[] | undefined): string[] {
  return (list ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20)
}

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(80, Math.round(value)))
}

/** 是否填过（用来决定要不要在引导里催） */
export function hasDeclared(profile: DeclaredProfile): boolean {
  return Boolean(
    profile.ageBand ||
      profile.education ||
      profile.currentLevel ||
      profile.targetPoints.length ||
      profile.goal,
  )
}

/**
 * 渲染成提示词里的一段。
 * 只写"对教学有用"的：年龄段/学历决定深度，目标与知识点决定先讲什么，
 * 忌口决定不能碰什么 —— 其余（比如更新时间）一律不写进去。
 */
export function formatDeclaredForPrompt(profile: DeclaredProfile): string {
  if (!hasDeclared(profile)) return ''

  const lines: string[] = ['===== 学习者自己说的（原话，不是你的推断）=====', '']

  if (profile.ageBand) lines.push('· 学段：' + profile.ageBand)
  if (profile.education) lines.push('· 身份/学历：' + profile.education)
  if (profile.currentLevel) lines.push('· 自评当前水平：' + profile.currentLevel)
  if (profile.targetPoints.length) lines.push('· 想学的具体内容：' + profile.targetPoints.join('、'))
  if (profile.goal) lines.push('· 目标：' + profile.goal)
  if (profile.weeklyHours > 0) lines.push('· 每周可投入：约 ' + String(profile.weeklyHours) + ' 小时')
  if (profile.preferOrder) lines.push('· 偏好顺序：' + profile.preferOrder)
  if (profile.dislikes.length) lines.push('· 明确不要：' + profile.dislikes.join('、'))

  lines.push(
    '',
    '（这些是他自己说的，用它们决定从哪讲、讲多深；不要把这些字段念出来，也不要说"根据你的画像"。）',
    '',
  )
  return lines.join('\n')
}
