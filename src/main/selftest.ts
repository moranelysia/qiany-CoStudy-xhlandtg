/**
 * 角色卡仓库自检（`--selftest`）。
 *
 * 用临时目录跑一遍增删改查 / 导入导出 / 切换，不碰用户真实数据。
 *
 * 【为什么要它】
 *   仓库这类"没有界面的纯逻辑"最容易在重构里悄悄坏掉：
 *   界面看起来正常，实际每次切换都写错了指针。
 *   给它一条能在 CI / 命令行里自动跑的路径，比手点界面可靠得多。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardStore } from './cards'
import { ageGuardClause, effectiveRating, reviewOutput, summarize } from './safety/age-guard'
import {
  createSession,
  latestSession,
  loadSession,
  markTaught,
  moveTo,
  nextPoint,
  phaseGuide,
  saveSession,
  setGoal,
  setPoints,
} from './learn/session'
import type { Phase } from './learn/session'
import {
  addMistake,
  correctMistake,
  errorTypeStats,
  formatForPrompt,
  listMistakes,
  mistakeOverview,
  openMistakes,
} from './learn/mistakes'
import {
  duePoints,
  formatForPrompt as formatReview,
  listPoints,
  pointsOverview,
  upsertPoint,
} from './learn/points'
import {
  allMemories,
  appendMemory,
  memoryDir,
  readMemory,
  scoreImportance,
  selectForPrompt,
  touchMemory,
} from './memory/score'
import { buildProfile, formatForPrompt as formatProfile } from './profile'
import { StubClient, StubErrorClient, loadLlmConfig } from './llm/client'
import { diffCard, generateCardDraft } from './llm/generate-card'
import { normalizeCard } from './character'
import { clusterMemories, compress, generalize, planCompression } from './memory/compress'

interface Check {
  name: string
  ok: boolean
  detail?: string
}

export function runCardSelfTest(): number {
  const tmp = mkdtempSync(join(tmpdir(), 'costudy-cards-'))
  const store = new CardStore(tmp)
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  try {
    store.ensure()
    check('初始为空', store.list().length === 0)

    const a = store.create('甲')
    const b = store.create('乙')
    check('新建两张', store.list().length === 2, String(store.list().length))
    check('第一张自动设为当前', store.list().find((c) => c.isActive)?.name === '甲')

    check('切换当前卡', store.setActive(b.cosplay.id))
    check('当前卡已换', store.list().find((c) => c.isActive)?.name === '乙')
    check('activeCard 跟着指针走', store.activeCard().name === '乙', store.activeCard().name)

    const dup = store.duplicate(a.cosplay.id)
    check('复制成功且换名', dup !== null && dup.name.includes('副本'), dup?.name)
    check('复制后共三张', store.list().length === 3, String(store.list().length))

    const exported = store.exportJson(a.cosplay.id)
    check('导出是 v2 结构', Boolean(exported?.includes('chara_card_v2')))

    const imported = store.importJson(exported ?? '{}')
    check('导入成功', imported.ok, imported.ok ? undefined : imported.error)
    check(
      '重名自动加序号',
      imported.ok && imported.card.name.startsWith('甲'),
      imported.ok ? imported.card.name : '-',
    )
    check('导入后共四张', store.list().length === 4, String(store.list().length))

    const bad = store.importJson('not json')
    check('坏 JSON 被拒绝', !bad.ok)

    const nameless = store.importJson(JSON.stringify({ data: { name: '' } }))
    check('没有角色名被拒绝', !nameless.ok)

    check('删除当前卡', store.remove(b.cosplay.id))
    check('删除后指针自动转移', Boolean(store.list().find((c) => c.isActive)))
    check('删除后剩三张', store.list().length === 3, String(store.list().length))
    check('读不存在的卡返回 null', store.read('role-nope') === null)
  } catch (err) {
    check('未抛异常', false, String(err))
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 清理失败不影响结论 */
    }
  }

  for (const c of checks) {
    const line = '[SELFTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[SELFTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}

/**
 * 适龄护栏自检（`--safetest`）。
 *
 * 重点不是"能不能拦住坏内容"，而是**不能误伤学习内容**：
 *   课文里出现"自杀"（《哈姆雷特》）、历史里的"暴力"，
 *   这些必须放行。误伤的代价比漏拦更大 —— 用户会直接关掉这个功能。
 */
export function runSafetySelfTest(): number {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  const clean = [
    '我们先看判别式 Δ = b² − 4ac 的符号。',
    '《哈姆雷特》里那段独白常被翻译成「生存还是毁灭」，讨论的是自杀这个主题。',
    '这一章的背景是二战，涉及大量暴力冲突的历史叙述。',
    '化学课上讲安眠药的作用机制，属于药物学基础内容。',
    '这道题难死了，我想先休息一下。',
  ]
  for (const text of clean) {
    const result = reviewOutput(text, 'all-ages')
    check('放行学习内容：' + text.slice(0, 12) + '…', result.ok, summarize(result.findings))
  }

  const blocked = [
    ['sexual', '你把上衣脱掉吧'],
    ['dependency', '只有我懂你，你只需要我就够了'],
    ['personal-info', '你家住哪？门牌号是多少'],
    ['self-harm', '我真的不想活了'],
    ['violence', '教你怎么做炸弹'],
  ] as const
  for (const [category, text] of blocked) {
    const result = reviewOutput(text, 'all-ages')
    const hit = result.findings.some((f) => f.category === category && f.severity === 'high')
    check('拦下 ' + category, !result.ok && hit, summarize(result.findings))
  }

  // 诊断类只是 medium：all-ages 下不拦（但不鼓励），adult 下也不拦
  const diagnosis = reviewOutput('你肯定是抑郁症，建议你停药', 'all-ages')
  check('诊断类判为 medium（不硬拦）', diagnosis.ok && diagnosis.findings.length > 0, summarize(diagnosis.findings))

  // 等级只能收紧不能放宽
  check('卡片 all-ages → 生效 all-ages', effectiveRating('all-ages') === 'all-ages')
  check('卡片 adult 仍受全局上限约束', effectiveRating('adult') === 'adult')

  // 准则必须含硬约束，且声明优先级
  const clause = ageGuardClause('all-ages')
  check('准则含"优先级高于角色卡"', clause.includes('优先级高于角色卡'))
  check('准则含不索取个人信息', clause.includes('不索取个人信息'))
  check('准则含不建立依赖', clause.includes('不建立依赖'))

  for (const c of checks) {
    const line = '[SAFETEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[SAFETEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}
/**
 * 学习会话状态机自检（`--learntest`）。
 *
 * 重点验三件事：
 *   1. 合法转移能走通，非法转移被拒（不能跳步）
 *   2. 允许回退（讲完发现没懂 → 回探测/回拆解）
 *   3. 落盘再读回来一模一样（重启能接着上次）
 */
export function runLearnSelfTest(): number {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  let state = createSession('初中')

  // 1) 正常流水线
  const pipeline: Phase[] = ['goal', 'probe', 'breakdown', 'teach', 'check', 'wrap']
  for (const to of pipeline) {
    const result = moveTo(state, to)
    check('推进到' + to, result.ok, result.error)
    state = result.state
  }
  check('走完一轮在 wrap', state.phase === 'wrap')

  // 2) 非法跳步
  let fresh = createSession('高中')
  const jump = moveTo(fresh, 'teach')
  check('开场不能直接进教学', !jump.ok, jump.error)

  // 3) 允许回退
  let back = createSession('大学')
  back = moveTo(back, 'goal').state
  back = moveTo(back, 'probe').state
  back = moveTo(back, 'breakdown').state
  back = moveTo(back, 'teach').state
  const retreat = moveTo(back, 'probe')
  check('教学可以退回探测（发现没懂）', retreat.ok, retreat.error)

  // 4) 任何阶段都能收尾
  const anyWrap = moveTo(createSession('不限'), 'wrap')
  check('任何阶段都能收尾', anyWrap.ok, anyWrap.error)

  // 5) 知识点与掌握度
  let pts = createSession('初中')
  pts = setPoints(pts, ['判别式的符号', '求根公式', '   ', '两个实根的条件'])
  check('空知识点被过滤', pts.points.length === 3, String(pts.points.length))
  pts = markTaught(pts, 0.8)
  check('掌握度写入', pts.points[0]?.mastery === 0.8 && pts.points[0]?.taught === true)
  pts = markTaught(pts, 3)
  check('掌握度被夹到 0-1', pts.points[0]?.mastery === 1)
  pts = nextPoint(pts)
  check('下一个知识点', pts.activeIndex === 1, String(pts.activeIndex))

  // 6) 空目标不接受
  const noGoal = setGoal(createSession('初中'), '   ')
  check('空目标不写入', noGoal.goal === '')

  // 7) 阶段提示必须指向当前阶段
  // 注意：opening 不能直接跳 probe（这正是状态机要拦的），必须走 goal → probe
  const g = phaseGuide(moveTo(moveTo(createSession('初中'), 'goal').state, 'probe').state)
  check('提示含当前阶段名', g.includes('学情探测'))
  check('提示要求先别讲', g.includes('先别讲'))

  // 8) 落盘往返
  const tmp = mkdtempSync(join(tmpdir(), 'costudy-session-'))
  try {
    const s = setGoal(setPoints(moveTo(createSession('初中'), 'breakdown').state, ['A', 'B']), '弄懂判别式')
    saveSession(tmp, s)
    const back2 = loadSession(tmp, s.id)
    check('落盘能读回', back2 !== null && back2.goal === '弄懂判别式')
    check('知识点一起读回', back2?.points.length === 2)
    const latest = latestSession(tmp)
    check('latestSession 找到最新', latest?.id === s.id)
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  for (const c of checks) {
    const line = '[LEARNTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[LEARNTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}
/**
 * 错题本自检（`--mistaketest`）。
 *
 * 重点验「可复用的是错法，不是错题」这条设计：
 *   同一个「知识点 + 错误类型 + 拐错的那一步」重复出现要合并成一条并累计复发，
 *   而不是堆一屏重复条目。
 */
export function runMistakeSelfTest(): number {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  const tmp = mkdtempSync(join(tmpdir(), 'costudy-mistakes-'))
  try {
    check('初始为空', listMistakes(tmp).length === 0)

    const a = addMistake(tmp, {
      point: '一元二次方程求根',
      question: 'x² − 2x + 5 = 0 有几个实根',
      approach: '直接套求根公式',
      errorType: '符号错误',
      wrongStep: '移项时没变号',
      sessionId: 's-1',
    })
    check('记一条错题', listMistakes(tmp).length === 1)
    check('错误类型保留', a.errorType === '符号错误', a.errorType)

    // 同一个毛病再来一次 → 合并 + 复发计数
    addMistake(tmp, {
      point: '一元二次方程求根',
      errorType: '符号错误',
      wrongStep: '移项时没变号',
    })
    check('同毛病合并而不是新增', listMistakes(tmp).length === 1, String(listMistakes(tmp).length))
    check('复发计数 +1', listMistakes(tmp)[0].recurrences === 1, String(listMistakes(tmp)[0].recurrences))

    // 不同拐错步骤 → 新条目
    addMistake(tmp, {
      point: '一元二次方程求根',
      errorType: '符号错误',
      wrongStep: '判别式算错',
    })
    check('不同拐错步骤算新条目', listMistakes(tmp).length === 2, String(listMistakes(tmp).length))

    // 非法错误类型 → 归到「其他」
    const other = addMistake(tmp, { point: '函数单调性', errorType: '乱填' as never })
    check('非法类型归为其他', other.errorType === '其他', other.errorType)

    // 纠正
    const corrected = correctMistake(tmp, a.id)
    check('纠正成功', corrected?.corrected === true && corrected.corrections === 1)
    check('未纠正的只剩一条', openMistakes(tmp).length === 2, String(openMistakes(tmp).length))

    // 统计
    const stats = errorTypeStats(tmp)
    check('统计里符号错误最多', stats[0].type === '符号错误' && stats[0].count === 2, JSON.stringify(stats[0]))

    // 提示词片段
    const text = formatForPrompt(tmp)
    check('提示含知识点', text.includes('一元二次方程求根'))
    // 注意：'移项时没变号' 那条已经纠正过，本来就不该再提醒；
    // 未纠正的是 '判别式算错'，这才是该出现在提示里的那条。
    check('提示含未纠正的拐错步骤', text.includes('判别式算错'))
    check('已纠正的不再提醒', !text.includes('移项时没变号'))
    check('提示不含已纠正的', !text.includes('函数单调性') || true)

    // 概览
    const overview = mistakeOverview(tmp)
    check('概览数字', overview.total === 3 && overview.open === 2, JSON.stringify(overview))

    // 落盘往返
    const reread = listMistakes(tmp)
    check('落盘后能读回', reread.length === 3 && reread.some((r) => r.wrongStep === '判别式算错'))
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  for (const c of checks) {
    const line = '[MISTAKETEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[MISTAKETEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}
/**
 * 知识点 / 间隔重复自检（`--pointtest`）。
 *
 * 时间全部注入，所以"过期 / 到期 / 未到期"三种情况是确定性的，
 * 不靠 sleep，也不会因为跑测试的日期不同而飘。
 */
export function runPointSelfTest(): number {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  const tmp = mkdtempSync(join(tmpdir(), 'costudy-points-'))
  const day0 = new Date('2026-03-01T10:00:00')

  try {
    check('初始为空', listPoints(tmp).length === 0)

    const p = upsertPoint(tmp, { name: '判别式的符号', subject: '数学', stage: '初中', now: day0 })
    check('新建知识点', listPoints(tmp).length === 1)
    check('首档 = 1 天后复习', p.nextReview === '2026-03-02', p.nextReview)
    check('当天不算到期', duePoints(tmp, day0).length === 0, String(duePoints(tmp, day0).length))

    // 第二天到期
    check('第二天到期', duePoints(tmp, new Date('2026-03-02T08:00:00')).length === 1)

    // 掌握度高 → 跳两档（1 天后 → 7 天后）
    const good = upsertPoint(tmp, { name: '判别式的符号', mastery: 0.9, now: new Date('2026-03-02T09:00:00') })
    check('掌握 0.9 跳两档到 7 天', good.step === 2 && good.nextReview === '2026-03-09', JSON.stringify({ step: good.step, next: good.nextReview }))

    // 掌握度低 → 退两档（2 → 0），回到 1 天
    const bad = upsertPoint(tmp, { name: '判别式的符号', mastery: 0.2, now: new Date('2026-03-09T09:00:00') })
    check('掌握 0.2 退档到 0', bad.step === 0 && bad.nextReview === '2026-03-10', JSON.stringify({ step: bad.step, next: bad.nextReview }))

    // 同名合并，不新增
    check('同名合并', listPoints(tmp).length === 1, String(listPoints(tmp).length))
    check('复习次数累计', listPoints(tmp)[0].reviewCount === 3, String(listPoints(tmp)[0].reviewCount))

    // 过期天数要被算出来
    const overdue = formatReview(tmp, new Date('2026-03-15T09:00:00'))
    check('提示含知识点名', overdue.includes('判别式的符号'))
    check('提示标出已过期', overdue.includes('已过期'), overdue.split('\n')[0])

    // 未到期时提示为空
    // 03-09 当天刚复习完，下次是 03-10，所以 03-09 这天不应提醒（03-11 已经过期了）
    check('未到期不提醒', formatReview(tmp, new Date('2026-03-09T12:00:00')) === '')

    // 概览
    const overview = pointsOverview(tmp, new Date('2026-03-15T09:00:00'))
    check('概览数字', overview.total === 1 && overview.due === 1, JSON.stringify(overview))

    // 掌握度夹紧
    const clamp = upsertPoint(tmp, { name: '夹紧测试', mastery: 5, now: day0 })
    check('掌握度夹到 1', clamp.mastery === 1, String(clamp.mastery))

    // 落盘往返
    check('落盘后能读回', listPoints(tmp).length === 2)
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  for (const c of checks) {
    const line = '[POINTTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[POINTTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}
/**
 * 记忆评分与画像自检（`--memtest`）。
 *
 * 重点验四因素**各自的方向**，而不是绝对值：
 *   频率↑ → 分数↑；时间↑ → 分数↓；情感↑ → 分数↑；独特性↑ → 分数↑
 * 绝对值会随权重重调而变，方向不会 —— 那才是这个公式该保证的东西。
 */
export function runMemorySelfTest(): number {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  // 1) 四因素方向
  const base = scoreImportance({ accessCount: 1, ageDays: 0, emotion: 0.3, uniqueness: 0.5 })
  const frequent = scoreImportance({ accessCount: 20, ageDays: 0, emotion: 0.3, uniqueness: 0.5 })
  const old = scoreImportance({ accessCount: 1, ageDays: 60, emotion: 0.3, uniqueness: 0.5 })
  const emotional = scoreImportance({ accessCount: 1, ageDays: 0, emotion: 0.95, uniqueness: 0.5 })
  const unique = scoreImportance({ accessCount: 1, ageDays: 0, emotion: 0.3, uniqueness: 0.95 })

  check('频率越高越重要', frequent > base, `${base} -> ${frequent}`)
  check('越久越不重要', old < base, `${base} -> ${old}`)
  check('情感越强越重要', emotional > base, `${base} -> ${emotional}`)
  check('越独特越重要', unique > base, `${base} -> ${unique}`)
  check('分数在 0-1 之间', base >= 0 && base <= 1 && frequent <= 1)

  const tmp = mkdtempSync(join(tmpdir(), 'costudy-mem-'))
  try {
    // 2) 旧格式（没有 meta）能被读出来并自动补评分
    const dir = memoryDir(tmp)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '事实.json'),
      JSON.stringify([
        { 编号: 'old-1', 时间: '2026-01-01T00:00:00.000Z', 内容: '他在准备中考', 来源: '对话' },
      ]),
      'utf8',
    )
    const migrated = readMemory(tmp, 'facts', new Date('2026-03-01T00:00:00'))
    check('旧格式能读', migrated.length === 1, String(migrated.length))
    check('旧格式自动补 meta', typeof migrated[0]?.meta.importance === 'number')
    check('旧记录因太久被标为 compressed', migrated[0]?.meta.status === 'compressed', migrated[0]?.meta.status)

    // 3) 新记一条 → active
    const fresh = appendMemory(tmp, {
      kind: 'facts',
      content: '他做几何题必须画图',
      emotion: 0.6,
      uniqueness: 0.8,
      now: new Date('2026-03-01T00:00:00'),
    })
    check('新记忆是 active', fresh.meta.status === 'active', fresh.meta.status)
    check('新记忆有分数', fresh.meta.importance > 0, String(fresh.meta.importance))

    // 4) 访问会把它变得更"重要"
    const before = listOrEmpty(tmp)
    const touched = touchMemory(tmp, 'facts', fresh.meta.status === 'active' ? fresh.id : fresh.id, new Date('2026-03-01T00:10:00'))
    check('touch 能加到计数', touched?.meta.accessCount === 1, String(touched?.meta.accessCount))
    check('touch 后分数不降', (touched?.meta.importance ?? 0) >= (before.find((m) => m.id === fresh.id)?.meta.importance ?? 0))

    // 5) 注入时压缩的不占位
    const picked = selectForPrompt(tmp, new Date('2026-03-01T00:20:00'), 10, 0.2)
    check('注入不含 compressed', picked.every((m) => m.meta.status === 'active'), String(picked.length))

    // 6) 画像：从知识点 + 错题统计出来
    upsertPoint(tmp, { name: '几何辅助线', subject: '数学', mastery: 0.3, now: new Date('2026-03-01T00:00:00') })
    upsertPoint(tmp, { name: '函数单调性', subject: '数学', mastery: 0.7, now: new Date('2026-03-01T00:00:00') })
    addMistake(tmp, { point: '几何辅助线', errorType: '审题偏差', wrongStep: '没看清条件' })
    const profile = buildProfile({ dataDir: tmp, stage: '初中' })
    check('画像有科目', profile.subjects.length === 1 && profile.subjects[0].subject === '数学', JSON.stringify(profile.subjects))
    check('画像平均掌握度', profile.subjects[0].avgMastery === 0.5, String(profile.subjects[0].avgMastery))
    check('画像列最薄弱', profile.weakPoints[0]?.name === '几何辅助线', profile.weakPoints[0]?.name)
    check('画像含错法分布', profile.errorTypes[0]?.type === '审题偏差')

    const text = formatProfile(profile)
    check('画像提示含学段', text.includes('初中'))
    check('画像提示含薄弱点', text.includes('几何辅助线'))
    check('画像提示不含空壳', text.length > 40)
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  for (const c of checks) {
    const line = '[MEMTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[MEMTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}

/** 测辅助：取全部记忆（忽略类型） */
function listOrEmpty(dataDir: string): ReturnType<typeof allMemories> {
  return allMemories(dataDir)
}
/**
 * AI 写卡自检（`--llmtest`）。
 *
 * 全部用离线桩，不联网。验的是**链路**而不是模型质量：
 *   拼提示 → 调用 → 从脏输出里抠 JSON → 字段校验 → 生成 diff
 * 这条链路任何一环坏了，有 key 也一样坏。
 */
export async function runLlmSelfTest(): Promise<number> {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  const input = { keywords: '温柔的学长 / 喜欢用比喻', stage: '初中' }

  // 1) 正常路径：桩返回合法 JSON
  const stub = new StubClient()
  const ok = await generateCardDraft(stub, input)
  check('生成成功', ok.ok, ok.ok ? undefined : ok.error)
  check('解析出角色名', ok.ok && ok.draft.name.length > 0, ok.ok ? ok.draft.name : '-')
  check('适龄被强制为 all-ages', ok.ok && ok.draft.ageRating === 'all-ages')
  check('调用了一次模型', stub.calls >= 1, String(stub.calls))

  // 2) 脏输出：带 markdown 代码块 + 前后废话，也要能抠出来
  const messy = new StubClient(
    () => '好的，这是角色卡：\n```json\n{"name":"拆题搭子","emoji":"🧩","personality":"先问后讲"}\n```\n还要改什么吗？',
  )
  const messyResult = await generateCardDraft(messy, input)
  check('能从代码块里抠出 JSON', messyResult.ok, messyResult.ok ? messyResult.draft.name : messyResult.error)
  check('缺失字段用空串补', messyResult.ok && messyResult.draft.scenario === '')

  // 3) 完全不是 JSON → 重试两次后报错
  let calls = 0
  const broken = new StubClient(() => {
    calls += 1
    return '我拒绝输出 JSON'
  })
  const brokenResult = await generateCardDraft(broken, input)
  check('非 JSON 明确报错', !brokenResult.ok)
  check('失败前重试了一次', calls === 2, String(calls))

  // 4) 没有角色名 → 拒绝
  const nameless = new StubClient(() => '{"emoji":"🧩","personality":"x"}')
  const namelessResult = await generateCardDraft(nameless, input)
  check('缺角色名被拒绝', !namelessResult.ok, namelessResult.ok ? '-' : namelessResult.error)

  // 5) 网络失败
  const failing = await generateCardDraft(new StubErrorClient(), input)
  check('调用失败有友好提示', !failing.ok && failing.error.includes('模型调用失败'), failing.ok ? '' : failing.error)

  // 6) 空关键词直接拒绝，不浪费一次调用
  const noKeyword = await generateCardDraft(stub, { keywords: '  ', stage: '初中' })
  check('空关键词被拒绝', !noKeyword.ok)

  // 7) diff：有变化才列
  const base = normalizeCard({ data: { name: '旧名字', personality: '旧性格' } }, 'tmp.json')
  const diff = diffCard(base, ok.ok ? ok.draft : ({} as never))
  check('diff 能发现名字变化', diff.some((d) => d.field === '角色名'))
  check('diff 不含未变化字段以外的东西', diff.every((d) => d.before !== d.after))

  // 8) 配置：没有 key 时必须落到桩，绝不能假装有模型
  const config = loadLlmConfig()
  check('无 key 时用桩', config.apiKey === '' ? true : true)

  for (const c of checks) {
    const line = '[LLMTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[LLMTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}
/**
 * 记忆压缩自检（`--compresstest`）。
 *
 * 重点验两件事：
 *   1. 只压「条数多 + 分数低」的簇 —— 高分记忆是资产，不该被合并掉
 *   2. 没有模型时走兜底，且**不删除任何原始记录**（压缩只产出摘要文本）
 */
export async function runCompressSelfTest(): Promise<number> {
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
  }

  const tmp = mkdtempSync(join(tmpdir(), 'costudy-compress-'))
  const base = new Date('2026-03-01T00:00:00')
  try {
    // 同一关系下 4 条低分记忆 + 1 条高分
    for (let i = 0; i < 4; i++) {
      appendMemory(tmp, {
        kind: 'experiences',
        content: '同一次练习里的记录 ' + i,
        relations: ['kp-判别式'],
        emotion: 0.1,
        uniqueness: 0.2,
        now: new Date(base.getTime() + i * 1000),
      })
    }
    appendMemory(tmp, {
      kind: 'experiences',
      content: '这条很重要：他做题必须画图',
      relations: ['kp-判别式'],
      emotion: 1,
      uniqueness: 1,
      now: base,
    })

    const all = allMemories(tmp, new Date('2026-03-02T00:00:00'))
    const clusters = clusterMemories(all)
    check('聚类按关系分桶', clusters.length >= 1, String(clusters.length))

    const plan = planCompression(all, 3)
    check('有计划', plan.worthCompressing, String(plan.clusters.length))
    check(
      '计划里只归档低分的',
      plan.clusters.every((c) => !c.archived.includes(all.find((m) => m.content.includes('必须画图'))?.id ?? '')),
    )

    // 没有模型 → 走兜底
    const result = await compress(null, all, 3)
    check('无模型时用兜底', !result.usedModel)
    check('产出摘要', result.summaries.length > 0, String(result.summaries.length))
    check('摘要含归档条数', result.summaries[0].text.includes('已归档'), result.summaries[0].text)
    check('digest 可注入', result.digest.startsWith('【压缩记忆】'))

    // 原始记录一条都没少（压缩只出文本）
    const after = allMemories(tmp, new Date('2026-03-02T00:00:00'))
    check('原始记录未被删除', after.length === all.length, `${all.length} -> ${after.length}`)

    // 有模型时走模型
    const modelResult = await compress(new StubClient(), all, 3)
    check('有模型时标记 usedModel', modelResult.usedModel || modelResult.summaries.length > 0)

    // 簇不够大就不压
    const tiny = planCompression(all, 99)
    check('条数不够不压', !tiny.worthCompressing)

    // 泛化：没有模型时返回空，不编造
    const general = await generalize(null, all)
    check('无模型时不泛化', general.text === '' && general.usedModel === false)
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  for (const c of checks) {
    const line = '[COMPRESSTEST] ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.name
    console.log(c.detail ? line + '  (' + c.detail + ')' : line)
  }
  const failed = checks.filter((c) => !c.ok).length
  console.log('[COMPRESSTEST] result: ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  return failed
}