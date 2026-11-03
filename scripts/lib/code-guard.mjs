/**
 * 代码执行守卫：**限定工作区** + 工作区之外写入前先问人。
 *
 * 装法：由 mcp-yuancode-server 先生成 entry.mjs，先 installGuard() 再 import 用户的代码，
 * 保证守卫在任何用户代码之前生效（不是"事后检查"，是"挡在门口"）。
 *
 * 【能拦什么】
 *   走 node:fs 的写入：writeFile / appendFile / mkdir / rm / unlink / rename / copyFile /
 *   createWriteStream / open(w+) / truncate / chmod / symlink / cp。
 *   fs.promises 和回调式写法也一并包住。
 *
 * 【拦不住什么 —— 必须说实话】
 *   · `child_process` 起一个别的程序去写盘：这里额外把 spawn/exec 也纳入审批，
 *     但拦不住被启动的程序自己去写——那是 OS 层的活（Job Object / 容器）。
 *   · 模型直接 `Atomics`/WASM 之类绕过 fs 的极端写法。
 *   所以这是"尽力而为 + 明示审批"，不是安全边界。
 *
 * 【和环境变量】
 *   COSTUDY_WORKSPACE    工作区绝对路径；没设就不启用守卫（保持旧行为）
 *   COSTUDY_APPROVAL_DIR 审批目录：本进程写 req-<id>.json，主进程回 res-<id>.json
 *
 * 注意：守卫**不**自己判断"要不要放行"，一律问主进程 —— 裁决只有一个来源
 * （主进程那边的 COSTUDY_APPROVE=allow/deny 是给自检用的旁路）。
 */
import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WORKSPACE = process.env['COSTUDY_WORKSPACE'] || ''
const APPROVAL_DIR = process.env['COSTUDY_APPROVAL_DIR'] || ''

/** 本次运行是否已"全部允许"（用户点了第三个按钮） */
let allowAll = false
/** 是否已经在自检/无人值守模式下，避免重复弹窗 */
const WAIT_MAX_MS = 90000

/**
 * 未包装的原函数。
 *
 * 为什么必须有：守卫自己也用 fs 写审批请求文件，而 installGuard() 已经把
 * `fs.writeFileSync` 换成了带闸门的版本 —— 直接用 `fs.writeFileSync` 写请求，
 * 会再触发一次审批，于是无限递归（这一步真踩过：自检里直接栈溢出）。
 * 模块加载时先抓住原始函数，内部记账一律走这里。
 */
const RAW = {
  writeFileSync: fs.writeFileSync.bind(fs),
  unlinkSync: fs.unlinkSync.bind(fs),
  mkdirSync: fs.mkdirSync.bind(fs),
  readFileSync: fs.readFileSync.bind(fs),
}

function sleep(ms) {
  // 子进程主线程要**同步阻塞**（fs 写接口是同步的），Atomics.wait 是唯一干净的办法
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 把各种形式的路径统一成绝对路径；认不出来的返回 '' */
function toAbs(target) {
  try {
    if (typeof target === 'string') return path.resolve(target)
    if (Buffer.isBuffer(target)) return path.resolve(target.toString())
    if (target instanceof URL) return path.resolve(fileURLToPath(target))
  } catch {
    /* 忽略 */
  }
  return ''
}

function insideWorkspace(abs) {
  if (!abs || !WORKSPACE) return false
  const root = path.resolve(WORKSPACE)
  const rel = path.relative(root, abs)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function waitingMark(on) {
  if (!APPROVAL_DIR) return
  const file = path.join(APPROVAL_DIR, 'waiting')
  try {
    if (on) RAW.writeFileSync(file, String(Date.now()))
    else RAW.unlinkSync(file)
  } catch {
    /* 目录没了就算了 */
  }
}

/** 问主进程要一个人工裁决；返回 { allowed, all } */
function ask(op, target) {
  if (!APPROVAL_DIR) return { allowed: false, all: false }

  const id = String(Date.now()) + '-' + Math.random().toString(16).slice(2, 8)
  const req = path.join(APPROVAL_DIR, 'req-' + id + '.json')
  const res = path.join(APPROVAL_DIR, 'res-' + id + '.json')
  try {
    RAW.mkdirSync(APPROVAL_DIR, { recursive: true })
    RAW.writeFileSync(req, JSON.stringify({ id, op, path: target, at: Date.now() }))
  } catch {
    return { allowed: false, all: false }
  }
  const deadline = Date.now() + WAIT_MAX_MS
  try {
    while (Date.now() < deadline) {
      waitingMark(true)
      try {
        const parsed = JSON.parse(RAW.readFileSync(res, 'utf8'))
        return { allowed: parsed && parsed.allow === true, all: parsed && parsed.all === true }
      } catch {
        /* 还没回，继续等 */
      }
      sleep(60)
    }
    return { allowed: false, all: false }
  } finally {
    waitingMark(false)
    try {
      RAW.unlinkSync(req)
    } catch {
      /* 忽略 */
    }
    try {
      RAW.unlinkSync(res)
    } catch {
      /* 忽略 */
    }
  }
}

function denyMessage(op, target) {
  return (
    '已被拒绝：代码想在工作区之外' + op + '「' + target + '」。\n' +
    '当前工作区：' + WORKSPACE + '\n' +
    '要放行请在弹窗里点允许，或者把工作区换到那个位置（设置 → 代码工作区）。'
  )
}

/** 闸门：工作区内直接过，外面要审批 */
function gate(op, target) {
  if (!WORKSPACE || !APPROVAL_DIR) return // 没启用，保持旧行为
  const abs = toAbs(target)
  if (!abs) return // 认不出路径（fd 之类）就交给系统
  if (insideWorkspace(abs)) return
  if (allowAll) return
  const verdict = ask(op, abs)
  if (!verdict.allowed) {
    const err = new Error(denyMessage(op, abs))
    err.code = 'EACCES'
    throw err
  }
  if (verdict.all) allowAll = true
}

// ---- 包装工具 ----

function wrapSync(target, name, op, index) {
  const orig = target[name]
  if (typeof orig !== 'function') return
  target[name] = function (...args) {
    gate(op, args[index])
    return orig.apply(this, args)
  }
}

function wrapCb(target, name, op, index) {
  const orig = target[name]
  if (typeof orig !== 'function') return
  target[name] = function (...args) {
    const cb = args[args.length - 1]
    try {
      gate(op, args[index])
    } catch (err) {
      if (typeof cb === 'function') {
        process.nextTick(() => cb(err))
        return undefined
      }
      throw err
    }
    return orig.apply(this, args)
  }
}

function wrapPromise(target, name, op, index) {
  const orig = target[name]
  if (typeof orig !== 'function') return
  target[name] = function (...args) {
    try {
      gate(op, args[index])
    } catch (err) {
      return Promise.reject(err)
    }
    return orig.apply(this, args)
  }
}

/** 起外部程序一律要审批：这是绕过工作区最明显的一条路 */
function gateCommand(cmd) {
  if (!WORKSPACE || !APPROVAL_DIR) return
  if (allowAll) return
  const verdict = ask('执行外部程序', String(cmd).slice(0, 300))
  if (!verdict.allowed) {
    const err = new Error(
      '已被拒绝：代码想执行外部程序「' + String(cmd).slice(0, 120) + '」。\n' +
        '在执行程序就成了真沙箱的活儿（Job Object / 容器），这一层只能先问人。',
    )
    err.code = 'EACCES'
    throw err
  }
  if (verdict.all) allowAll = true
}

function wrapCmd(target, name) {
  const orig = target[name]
  if (typeof orig !== 'function') return
  target[name] = function (...args) {
    const first = args[0]
    const cmd =
      typeof first === 'string'
        ? first
        : first && typeof first === 'object'
          ? String(first.file || first.command || '')
          : String(first ?? '')
    gateCommand(cmd)
    return orig.apply(this, args)
  }
}

export function installGuard() {
  if (!process.env['COSTUDY_GUARD_ON']) process.env['COSTUDY_GUARD_ON'] = '1'
  if (!WORKSPACE || !APPROVAL_DIR) return

  // 同步 API
  wrapSync(fs, 'writeFileSync', '写入', 0)
  wrapSync(fs, 'appendFileSync', '追加', 0)
  wrapSync(fs, 'mkdirSync', '建目录', 0)
  wrapSync(fs, 'rmSync', '删除', 0)
  wrapSync(fs, 'rmdirSync', '删除目录', 0)
  wrapSync(fs, 'unlinkSync', '删除文件', 0)
  wrapSync(fs, 'truncateSync', '截断', 0)
  wrapSync(fs, 'chmodSync', '改权限', 0)
  wrapSync(fs, 'renameSync', '重命名/移动', 1)
  wrapSync(fs, 'copyFileSync', '复制到', 1)
  wrapSync(fs, 'cpSync', '复制到', 1)
  wrapSync(fs, 'symlinkSync', '建软链', 1)
  wrapSync(fs, 'writevSync', '写入', 0)
  wrapSync(fs, 'ftruncateSync', '截断', 0)

  // 回调 API
  wrapCb(fs, 'writeFile', '写入', 0)
  wrapCb(fs, 'appendFile', '追加', 0)
  wrapCb(fs, 'mkdir', '建目录', 0)
  wrapCb(fs, 'rm', '删除', 0)
  wrapCb(fs, 'unlink', '删除文件', 0)
  wrapCb(fs, 'rename', '重命名/移动', 1)
  wrapCb(fs, 'copyFile', '复制到', 1)
  wrapCb(fs, 'cp', '复制到', 1)

  // Promise API
  if (fs.promises) {
    wrapPromise(fs.promises, 'writeFile', '写入', 0)
    wrapPromise(fs.promises, 'appendFile', '追加', 0)
    wrapPromise(fs.promises, 'mkdir', '建目录', 0)
    wrapPromise(fs.promises, 'rm', '删除', 0)
    wrapPromise(fs.promises, 'unlink', '删除文件', 0)
    wrapPromise(fs.promises, 'rename', '重命名/移动', 1)
    wrapPromise(fs.promises, 'copyFile', '复制到', 1)
    wrapPromise(fs.promises, 'cp', '复制到', 1)
    wrapPromise(fs.promises, 'truncate', '截断', 0)
    wrapPromise(fs.promises, 'symlink', '建软链', 1)
  }

  // 写流的宿主路径：构造时就判
  const origCreate = fs.createWriteStream
  if (typeof origCreate === 'function') {
    fs.createWriteStream = function (target, ...rest) {
      gate('写入', target)
      return origCreate.call(this, target, ...rest)
    }
  }

  // open 只在带写标志时才管
  const origOpenSync = fs.openSync
  if (typeof origOpenSync === 'function') {
    fs.openSync = function (target, flags, ...rest) {
      if (typeof flags === 'string' && /[wa+]/.test(flags)) gate('写入', target)
      return origOpenSync.call(this, target, flags, ...rest)
    }
  }
  const origOpen = fs.open
  if (typeof origOpen === 'function') {
    fs.open = function (target, flags, ...rest) {
      if (typeof flags === 'string' && /[wa+]/.test(flags)) gate('写入', target)
      return origOpen.call(this, target, flags, ...rest)
    }
  }

  // 起外部程序：一律审批
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    wrapCmd(cp, name)
  }
}
