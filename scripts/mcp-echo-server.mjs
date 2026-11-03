/**
 * 假的 MCP 服务，只用来验证宿主协议层（不涉及 JSXGraph）。
 *
 * 跑法：node scripts/mcp-echo-server.mjs
 * 行为：握手 → 响应 tools/list（echo + add）→ 响应 tools/call
 *
 * 之所以先写这个：MCP 出问题时，要能分清是"协议层坏了"还是"具体服务坏了"。
 * 有了 echo 服务，协议层可以单独验。
 */
import process from 'node:process'

const TOOLS = [
  {
    name: 'echo',
    description: '把输入原样返回，用于连通性测试',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
  },
  {
    name: 'add',
    description: '两个数相加',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function fail(id, message, code = -32601) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line) handle(line)
    index = buffer.indexOf('\n')
  }
})

function handle(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const id = msg.id
  const method = msg.method
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-echo', version: '0.0.1' },
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
    if (name === 'echo') {
      reply(id, { content: [{ type: 'text', text: String(args.text ?? '') }] })
      return
    }
    if (name === 'add') {
      const sum = Number(args.a ?? 0) + Number(args.b ?? 0)
      reply(id, { content: [{ type: 'text', text: String(sum) }] })
      return
    }
    fail(id, '没有这个工具：' + String(name))
    return
  }
  fail(id, '不认识的方法：' + String(method))
}
