/**
 * 「学什么」——当前学习主题。
 *
 * 【为什么要单独存一份】
 *   在此之前，伴学页的课程标题和目标写死在 data.js 的 LESSON 里
 *   （「数学 · 一元二次方程」），等于这个应用只会教一元二次方程。
 *   用户要的是"全年龄段、全方面"：学段、科目、今天的目标都应该由学习者自己定。
 *
 * 存放位置：记忆/学习主题.json。和角色卡、知识点分开 —— 它属于"学习者"，不属于某个角色。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface StudyTopic {
  /** 学段：小学 / 初中 / 高中 / 大学 / 成人自学 / 不限 */
  stage: string
  /** 课程或主题，例如「数学 · 一元二次方程」「英语 · 现在完成时」 */
  course: string
  /** 今天的目标，一句话 */
  goal: string
  updatedAt: string
}

const FILE_NAME = '学习主题.json'

const DEFAULTS: Omit<StudyTopic, 'updatedAt'> = {
  stage: '高中',
  course: '数学 · 一元二次方程',
  goal: '弄懂求根公式是怎么来的，能自己解出带分数根的题',
}

function topicFile(dataDir: string): string {
  return path.join(dataDir, FILE_NAME)
}

export function readTopic(dataDir: string): StudyTopic {
  const empty: StudyTopic = { ...DEFAULTS, updatedAt: '' }
  try {
    const raw = fs.readFileSync(topicFile(dataDir), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<StudyTopic> | null
    if (!parsed || typeof parsed !== 'object') return empty
    return {
      stage: typeof parsed.stage === 'string' && parsed.stage ? parsed.stage : DEFAULTS.stage,
      course: typeof parsed.course === 'string' && parsed.course ? parsed.course : DEFAULTS.course,
      goal: typeof parsed.goal === 'string' && parsed.goal ? parsed.goal : DEFAULTS.goal,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return empty
  }
}

export function writeTopic(dataDir: string, patch: Partial<StudyTopic>): StudyTopic {
  const current = readTopic(dataDir)
  const next: StudyTopic = {
    stage: (patch.stage ?? current.stage).trim() || DEFAULTS.stage,
    course: (patch.course ?? current.course).trim() || DEFAULTS.course,
    goal: (patch.goal ?? current.goal).trim() || DEFAULTS.goal,
    updatedAt: new Date().toISOString(),
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(topicFile(dataDir), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* 写不进去也不该让界面崩，返回内存里的值即可 */
  }
  return next
}
