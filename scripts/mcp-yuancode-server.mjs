/**
 * MCP 服务：代码执行（yuancode）。
 *
 * 【它到底隔离到什么程度 —— 必须说实话】
 *   这不是安全沙箱，是"尽力而为的隔离"：
 *     · 独立子进程（崩了不影响主进程）
 *     · 超时强杀（默认 3 秒，最多 10 秒）
 *     · 内存上限 128MB
 *     · cwd 放在 记忆/代码沙箱/，相对路径写文件不会污染项目目录
 *   但它**不能**阻止代码读你的磁盘、发网络请求。所以：
 *     · 该工具权限是 exec —— 只有 work 模式才给模型看见
 *     · 生成的代码由用户自己确认，只适合"学算法、验证一段逻辑"
 *   以后要真沙箱得靠 Windows Job Object / 容器，不是这一版的范围。
 *
 * 【只支持 JavaScript】
 *   这台机器上一定有 node（我们自己在用），Python 不一定有。先做好一个。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MAX_OUTPUT = 4000
const DEFAULT_TIMEOUT = 3000
const HARD_TIMEOUT = 10000

/** 守卫模块的绝对路径：先装它，再 import 用户代码 */
const GUARD_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'code-guard.mjs')

/**
 * 代码跑在哪个目录。
 *
 * 2026-11-02 起：优先用用户设的**工作区**（COSTUDY_WORKSPACE），
 * 相对路径的读写就落在那儿；没设才退回旧的 `记忆/代码沙箱`。
 */
function sandboxDir() {
  const ws = (process.env['COSTUDY_WORKSPACE'] || '').trim()
  const dir = ws
    ? path.resolve(ws)
    : path.join(process.env['COSTUDY_DATA_DIR'] || process.cwd(), '代码沙箱')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* 建不出来就用 cwd */
  }
  return dir
}

/** 把用户代码包一层：守卫先跑，再执行代码本身 */
function writeEntry(jobDir, source) {
  const snippet = path.join(jobDir, 'snippet.mjs')
  fs.writeFileSync(snippet, source, 'utf8')
  const entry = path.join(jobDir, 'entry.mjs')
  fs.writeFileSync(
    entry,
    'import { installGuard } from ' + JSON.stringify(pathToFileURL(GUARD_FILE).href) + '\n' +
      'installGuard()\n' +
      'await import(' + JSON.stringify(pathToFileURL(snippet).href) + ')\n',
    'utf8',
  )
  return entry
}

/** 有人在等你点"允许"吗？——等审批的时间不算代码的执行时间 */
function waitingForApproval(approvalDir) {
  if (!approvalDir) return false
  try {
    const st = fs.statSync(path.join(approvalDir, 'waiting'))
    return Date.now() - st.mtimeMs < 2000
  } catch {
    return false
  }
}

/** 把用户/模型给的代码跑起来，返回 stdout/stderr/退出码 */
export function runCode({ code, timeoutMs }) {
  const source = String(code ?? '')
  if (!source.trim()) throw new Error('缺少 code')
  if (source.length > 20000) throw new Error('代码太长（上限 2 万字符）')

  const timeout = Math.min(HARD_TIMEOUT, Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT))
  const dir = sandboxDir()
  const approvalDir = process.env['COSTUDY_APPROVAL_DIR'] || ''

  return new Promise((resolve) => {
    let jobDir = ''
    let entry = ''
    try {
      jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'costudy-snippet-'))
      entry = writeEntry(jobDir, source)
    } catch (err) {
      resolve({ ok: false, text: '写临时文件失败：' + (err && err.message ? err.message : String(err)) })
      return
    }

    const child = spawn(process.execPath, ['--max-old-space-size=128', entry], {
      cwd: dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let out = ''
    let err = ''
    let killed = false
    let done = false
    let deadline = Date.now() + timeout
    // 用 ticker 而不是 setTimeout：弹窗等用户点头的时候，时间要停住
    const ticker = setInterval(() => {
      if (done) return
      if (waitingForApproval(approvalDir)) {
        deadline = Date.now() + 100
        return
      }
      if (Date.now() >= deadline) {
        killed = true
        try {
          child.kill('SIGKILL')
        } catch {
          /* 忽略 */
        }
      }
    }, 100)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (out.length < MAX_OUTPUT * 2) out += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      if (err.length < MAX_OUTPUT * 2) err += chunk
    })

    const finish = (code2) => {
      done = true
      clearInterval(ticker)
      try {
        fs.rmSync(jobDir, { recursive: true, force: true })
      } catch {
        /* 删不掉留着也无所谓 */
      }
      const trim = (s) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n…（输出太长，已截断）' : s)
      const parts = []
      if (out.trim()) parts.push(trim(out.trimEnd()))
      if (err.trim()) parts.push('stderr:\n' + trim(err.trimEnd()))
      if (killed) parts.push('（超时 ' + timeout + 'ms 被强制终止）')
      if (!parts.length) parts.push('（没有任何输出，退出码 ' + String(code2) + '）')
      resolve({ ok: !killed && code2 === 0, text: parts.join('\n') })
    }

    child.on('close', (code2) => finish(code2 ?? -1))
    child.on('error', (e) => {
      done = true
      clearInterval(ticker)
      try {
        fs.rmSync(jobDir, { recursive: true, force: true })
      } catch {
        /* 忽略 */
      }
      resolve({ ok: false, text: '启动失败：' + e.message })
    })
  })
}

const TOOLS = [
  {
    name: 'run_code',
    description:
      '运行一段 JavaScript（Node 环境）并返回输出。适合验证算法、算数值、跑一段逻辑。注意：3 秒超时、128MB 内存上限，不支持 Python。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要运行的 JS 代码，用 console.log 打印结果' },
        timeoutMs: { type: 'number', description: '超时毫秒，默认 3000，最多 10000' },
      },
      required: ['code'],
    },
  },
]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function fail(id, message, code = -32603) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let i = buffer.indexOf('\n')
  while (i >= 0) {
    const line = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (line) handle(line)
    i = buffer.indexOf('\n')
  }
})

function handle(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method } = msg
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-yuancode', version: '0.1.0' },
    })
    return
  }
  if (method === 'notifications/initialized') return
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const name = msg.params?.name
    const args = msg.params?.arguments ?? {}
    if (name !== 'run_code') {
      fail(id, '没有这个工具：' + String(name), -32601)
      return
    }
    runCode(args).then(
      (res) => reply(id, { content: [{ type: 'text', text: res.text }], isError: !res.ok }),
      (err) => fail(id, err && err.message ? err.message : String(err)),
    )
    return
  }
  fail(id, '不认识的方法：' + String(method), -32601)
}
