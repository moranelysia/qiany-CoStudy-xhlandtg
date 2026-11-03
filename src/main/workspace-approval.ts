/**
 * 工作区写入审批（主进程这一侧）。
 *
 * 【怎么串起来的】
 *   跑代码的子进程 → 守卫发现"要写工作区外" → 写 `req-<id>.json` 然后**同步阻塞**
 *   → 这里轮询到请求 → 弹一个模态框 → 把人点的结果写成 `res-<id>.json`
 *   → 子进程读回裁决，放行或抛错。
 *
 * 为什么要文件握手而不是 IPC：
 *   子进程里 `fs.writeFileSync` 是**同步**接口，守卫必须能同步等一个结果；
 *   Node 子进程之间没有同步 IPC。文件 + `Atomics.wait` 是最简单可靠的一条。
 *
 * 【失败原则】
 *   没窗口、用户直接关窗、等超时 —— 一律**拒绝**（fail closed），不放行。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'

/** 固定目录：MCP 客户端的 env 只在启动时给一次，换来换去会反复重启子进程 */
let dir = ''
let workspaceRoot = ''
let timer: NodeJS.Timeout | null = null
/** 弹窗串行化：一次只问一个，避免同时弹好几个把用户搞懵 */
let chain: Promise<void> = Promise.resolve()

export function approvalDir(): string {
  if (!dir) dir = path.join(os.tmpdir(), 'costudy-approval-' + String(process.pid))
  return dir
}

function clearDir(): void {
  const d = approvalDir()
  try {
    fs.rmSync(d, { recursive: true, force: true })
  } catch {
    /* 忽略 */
  }
  try {
    fs.mkdirSync(d, { recursive: true })
  } catch {
    /* 忽略 */
  }
}

/** 开始一轮代码执行：清场 + 起轮询 */
export function beginApprovalSession(root: string): string {
  workspaceRoot = root
  clearDir()
  if (timer) clearInterval(timer)
  timer = setInterval(pump, 120)
  // 别让这个定时器把进程吊住（自检里 app.exit 时更明显）
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return approvalDir()
}

/** 结束这一轮：停轮询 + 清场 */
export function endApprovalSession(): void {
  if (timer) clearInterval(timer)
  timer = null
  clearDir()
}

function writeVerdict(id: string, allow: boolean, all: boolean): void {
  try {
    fs.writeFileSync(path.join(approvalDir(), 'res-' + id + '.json'), JSON.stringify({ allow, all }), 'utf8')
  } catch {
    /* 写不进去就是拒绝（子进程会超时） */
  }
}

function pump(): void {
  if (!dir && !approvalDir()) return
  let names: string[]
  try {
    names = fs.readdirSync(approvalDir())
  } catch {
    return
  }
  for (const name of names) {
    if (!name.startsWith('req-') || !name.endsWith('.json')) continue
    const file = path.join(approvalDir(), name)
    let req: { id?: string; op?: string; path?: string }
    try {
      req = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof req
    } catch {
      continue
    }
    // 先删请求文件：同一请求绝不能被弹两次
    try {
      fs.unlinkSync(file)
    } catch {
      /* 忽略 */
    }
    const id = String(req.id ?? '')
    if (!id) continue
    chain = chain.then(() => decide(id, String(req.op ?? '写入'), String(req.path ?? ''))).catch(() => {})
  }
}

async function decide(id: string, op: string, target: string): Promise<void> {
  const auto = (process.env['COSTUDY_APPROVE'] || '').toLowerCase()
  if (auto === 'allow') return writeVerdict(id, true, false)
  if (auto === 'deny') return writeVerdict(id, false, false)

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return writeVerdict(id, false, false) // 没窗口就是不问 = 不放行

  const isCmd = op.includes('外部程序')
  let response = 0
  try {
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['拒绝', '允许一次', '本次运行全部允许'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: isCmd ? '代码想执行外部程序' : '代码想写工作区之外',
      message: isCmd ? '有代码想启动一个外部程序' : '有代码想写工作区之外的位置',
      detail:
        (isCmd ? '程序：' : '目标：') + target + '\n' +
        (isCmd ? '' : '操作：' + op + '\n') +
        '工作区：' + (workspaceRoot || '（未设置）'),
    })
    response = res.response
  } catch {
    response = 0
  }
  writeVerdict(id, response >= 1, response === 2)
}
