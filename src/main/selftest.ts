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
