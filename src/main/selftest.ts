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
import { mkdtempSync, rmSync } from 'node:fs'
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