/**
 * MCP 宿主 · 客户端（stdio 传输）。
 *
 * 【为什么自己写而不是用官方 SDK】
 *   我们只需要三个动作：启动子进程、列工具、调工具。官方 SDK 会带一批
 *   zod/依赖进来，而主进程是打包进 Electron 的，多一层依赖就多一份体积和
 *   版本风险。协议本身很简单：一串换行分隔的 JSON-RPC。
 *
 * 【协议要点】
 *   · 传输：stdin 写请求，stdout 读响应（每行一个 JSON）
 *   · 握手：initialize → notifications/initialized
 *   · 列表：tools/list → result.tools[]（name / description / inputSchema）
 *   · 调用：tools/call → result.content[]（一般是 [{type:'text', text}]）
 *
 * 【失败原则】
 *   不吞异常：超时、进程退出、JSON-RPC error 全部抛出去，让上层决定降级。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpCallResult {
  ok: boolean
  /** 拼好的文本结果（工具常见返回 [{type:'text'}]） */
  text: string
  raw?: unknown
  error?: string
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const PROTOCOL_VERSION = '2024-11-05'

export class McpClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, Pending>()
  private closed = false

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly options: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
  ) {}

  get running(): boolean {
    return Boolean(this.child) && !this.closed
  }

  /** 启动子进程并完成握手 */
  async start(): Promise<void> {
    if (this.child) return
    const child = spawn(this.command, this.args, {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
      windowsHide: true,
    })
    this.child = child
    this.closed = false

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onData(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      // 服务端的诊断输出，不当错误；但留痕方便排查
      const text = String(chunk).trim()
      if (text) console.log('[MCP:stderr] ' + text.slice(0, 400))
    })
    child.on('exit', (code) => {
      this.closed = true
      for (const [, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error('MCP 服务退出（code=' + String(code) + '）'))
      }
      this.pending.clear()
    })
    child.on('error', (err) => {
      this.closed = true
      console.log('[MCP:error] ' + err.message)
    })

    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'costudy', version: '0.1.0' },
    })
    this.notify('notifications/initialized', {})
  }

  /** 列工具 */
  async listTools(): Promise<McpTool[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpTool[] }
    const tools = Array.isArray(result?.tools) ? result.tools : []
    return tools.filter((t) => t && typeof t.name === 'string')
  }

  /** 调工具（`timeoutMs` 可覆盖：跑代码要等人工审批，默认 20s 不够） */
  async callTool(name: string, args: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<McpCallResult> {
    try {
      const result = (await this.request('tools/call', { name, arguments: args }, opts.timeoutMs)) as {
        content?: Array<{ type?: string; text?: string }>
        isError?: boolean
      }
      const parts = Array.isArray(result?.content) ? result.content : []
      const text = parts
        .filter((p) => p && typeof p.text === 'string')
        .map((p) => String(p.text))
        .join('\n')
      if (result?.isError) return { ok: false, text, raw: result, error: text || '工具返回错误' }
      return { ok: true, text, raw: result }
    } catch (err) {
      return { ok: false, text: '', error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** 关掉子进程 */
  stop(): void {
    if (!this.child) return
    try {
      this.child.stdin.end()
    } catch {
      /* 忽略 */
    }
    try {
      this.child.kill()
    } catch {
      /* 忽略 */
    }
    this.child = null
    this.closed = true
  }

  // ---- 内部 ----

  private onData(chunk: string): void {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) this.handleLine(line)
      index = this.buffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let msg: {
      id?: number
      result?: unknown
      error?: { message?: string; code?: number }
      method?: string
    }
    try {
      msg = JSON.parse(line) as typeof msg
    } catch {
      console.log('[MCP:bad-line] ' + line.slice(0, 200))
      return
    }
    if (typeof msg.id !== 'number') return // 服务端主动通知，忽略
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    clearTimeout(pending.timer)
    if (msg.error) {
      pending.reject(new Error(msg.error.message ?? 'JSON-RPC error ' + String(msg.error.code ?? '')))
      return
    }
    pending.resolve(msg.result)
  }

  private write(payload: Record<string, unknown>): void {
    if (!this.child || this.closed) throw new Error('MCP 服务未启动')
    this.child.stdin.write(JSON.stringify(payload) + '\n')
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: '2.0', method, params })
  }

  private request(method: string, params: Record<string, unknown>, timeoutOverride?: number): Promise<unknown> {
    const id = this.nextId++
    const timeoutMs = timeoutOverride ?? this.options.timeoutMs ?? 15000
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('MCP 请求超时：' + method))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }
}
