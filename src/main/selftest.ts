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