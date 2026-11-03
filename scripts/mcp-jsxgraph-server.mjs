/**
 * MCP 服务：数学作图（纯 SVG，零依赖）。
 *
 * 【为什么自己生成 SVG 而不是在跑 JSXGraph】
 *   JSXGraph 需要 DOM/canvas，在 Node 子进程里要额外装 jsdom，几 MB 的依赖只为画一条曲线。
 *   而 SVG 本身就是文本 —— 直接拼字符串，返回给模型/界面都能用，还能被渲染端当图片显示。
 *
 * 【刻度规则（和界面上图表保持一致）】
 *   · 三角函数（sin/cos/tan）：横轴用 π 的倍数标注
 *   · 纵轴一律写普通数字：整数就写整数，半整数写 0.5 —— **不用带分数**（4½ 这种）
 */
import process from 'node:process'
import { plotGeometry } from './lib/geometry.mjs'

const W = 640
const H = 400
const PAD = 36

const PI = Math.PI

function isTrig(expr) {
  return /Math\.(sin|cos|tan)/.test(expr)
}

function compile(expr) {
  // 只允许数学表达式：数字、x、四则、括号、Math.* / 常见函数名
  if (!/^[\w\s+\-*/().,^]*$/.test(expr)) throw new Error('表达式里出现了不允许的字符')
  // eslint-disable-next-line no-new-func
  return new Function('x', 'return ' + expr)
}

/** 采样：先粗采样找不连续（tan 的渐近线），断点处断开路径 */
function sample(fn, x0, x1, steps) {
  const points = []
  let prev = null
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    let y
    try {
      y = fn(x)
    } catch {
      y = NaN
    }
    if (!Number.isFinite(y)) {
      points.push({ x, y: NaN })
      prev = null
      continue
    }
    // 跳变检测：相邻两点纵向距离过大就当断点（tan 的 ±∞）
    if (prev !== null && Math.abs(y - prev) > 20) {
      points.push({ x, y: NaN })
    }
    points.push({ x, y })
    prev = y
  }
  return points
}

/**
 * 纵轴刻度写法：**只写普通数字**。
 *
 * 老实现有两个错：
 *   1. `niceYLabel(2)` 会算出 half=4 然后返回 "4½" —— 它把"0.5 的倍数"当成了整数部分，
 *      于是纵轴上 2 被写成 4½、1 被写成 2½。图上数字和真实值对不上，比不标还糟。
 *   2. 用带分数（4½ / 2½）当刻度：学生看的是一个"分数计数器"，不是坐标值。
 * 现在的规则：整数就写整数（能表示整数就表示整数），半整数写 0.5 / 1.5，其余保留两位小数。
 */
/**
 * 挑一个"好看的"刻度步长：1 / 2 / 5 × 10^n。
 * 目的：刻度等距、且尽量落在整数上（能表示整数就表示整数）。
 */
function niceStep(span) {
  // 目标 6 格：±3.2 的视窗会得到步长 1（刻度 −3…3，全是整数），±4.5 会得到 2
  const raw = Math.abs(span) / 6
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  const m = n <= 1.2 ? 1 : n <= 2.5 ? 2 : n <= 6 ? 5 : 10
  return m * p
}

function niceYLabel(v) {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a < 1e-9) return '0'
  if (Math.abs(a - Math.round(a)) < 1e-9) return sign + String(Math.round(a))
  const two = Math.round(a * 100) / 100
  return sign + String(two)
}

function piLabel(k) {
  if (k === 0) return '0'
  const sign = k < 0 ? '−' : ''
  const abs = Math.abs(k)
  const num = abs.toFixed(2).replace(/\.?0+$/, '')
  if (num === '1') return sign + 'π'
  return sign + num + 'π'
}

export function plotFunction({ expr, xmin = -7.2, xmax = 7.2, ymin = -3.2, ymax = 3.2 }) {
  if (!expr) throw new Error('缺少 expr')
  const fn = compile(String(expr))
  const trig = isTrig(String(expr))
  const steps = 1400
  const pts = sample(fn, xmin, xmax, steps)

  const sx = (x) => PAD + ((x - xmin) / (xmax - xmin)) * (W - PAD * 2)
  const sy = (y) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - PAD * 2)

  let path = ''
  let started = false
  for (const p of pts) {
    if (!Number.isFinite(p.y) || p.y < ymin - 5 || p.y > ymax + 5) {
      started = false
      continue
    }
    const cmd = started ? 'L' : 'M'
    path += cmd + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1) + ' '
    started = true
  }

  const axisY = Math.max(PAD, Math.min(H - PAD, sy(0)))
  const axisX = Math.max(PAD, Math.min(W - PAD, sx(0)))

  let ticks = ''
  if (trig) {
    // π 的倍数标注，不出现整数
    for (let k = Math.ceil(xmin / (PI / 2)); k * (PI / 2) <= xmax; k++) {
      if (k === 0) continue
      const x = sx(k * (PI / 2))
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + (axisY - 3) + '" x2="' + x.toFixed(1) + '" y2="' + (axisY + 3) + '" stroke="#c9d4e0"/>'
      ticks += '<text x="' + x.toFixed(1) + '" y="' + (axisY + 16) + '" font-size="11" fill="#5a6a7a" text-anchor="middle">' + piLabel(k / 2) + '</text>'
    }
  } else {
    for (let v = Math.ceil(xmin); v <= xmax; v++) {
      if (v === 0) continue
      const x = sx(v)
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + (axisY - 3) + '" x2="' + x.toFixed(1) + '" y2="' + (axisY + 3) + '" stroke="#c9d4e0"/>'
      ticks += '<text x="' + x.toFixed(1) + '" y="' + (axisY + 16) + '" font-size="11" fill="#5a6a7a" text-anchor="middle">' + String(v).replace('-', '−') + '</text>'
    }
  }

  // 纵轴刻度：**等距**，步长按取值范围取"好看的数"（1 / 2 / 0.5 / 5…）。
  // 以前是手写死的 [1, -1, 2, -2, 0.5, -0.5]：间距一会儿 0.5、一会儿 1，读数反而慢。
  const step = niceStep(ymax - ymin)
  for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9) continue
    const y = sy(v)
    ticks += '<line x1="' + (axisX - 3) + '" y1="' + y.toFixed(1) + '" x2="' + (axisX + 3) + '" y2="' + y.toFixed(1) + '" stroke="#c9d4e0"/>'
    ticks += '<text x="' + (axisX - 8) + '" y="' + (y + 4).toFixed(1) + '" font-size="11" fill="#5a6a7a" text-anchor="end">' + niceYLabel(v) + '</text>'
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.72)"/>' +
    '<line x1="' + PAD + '" y1="' + axisY + '" x2="' + (W - PAD) + '" y2="' + axisY + '" stroke="#9aa8b6"/>' +
    '<line x1="' + axisX + '" y1="' + PAD + '" x2="' + axisX + '" y2="' + (H - PAD) + '" stroke="#9aa8b6"/>' +
    ticks +
    '<path d="' + path.trim() + '" fill="none" stroke="#0a84ff" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<text x="' + (W - PAD) + '" y="' + (axisY - 8) + '" font-size="11" fill="#8a97a8" text-anchor="end">y = ' + String(expr).replace(/Math\./g, '') + '</text>' +
    '</svg>'

  return svg
}

const TOOLS = [
  {
    name: 'plot_function',
    description:
      '把一条函数曲线画成 SVG 图片。表达式用 JS 写法，自变量是 x，例如 Math.sin(2*x)、x*x-2、1/x。三角函数图会自动用 π 刻度。',
    inputSchema: {
      type: 'object',
      properties: {
        expr: { type: 'string', description: '函数表达式，例如 Math.sin(2*x)' },
        xmin: { type: 'number', description: '横轴左端，默认 -7.2' },
        xmax: { type: 'number', description: '横轴右端，默认 7.2' },
        ymin: { type: 'number', description: '纵轴下端，默认 -3.2' },
        ymax: { type: 'number', description: '纵轴上端，默认 3.2' },
      },
      required: ['expr'],
    },
  },
  {
    name: 'plot_geometry',
    description:
      '几何作图：点、线段、直线、圆、多边形（三角形等）、垂线、平行线，输出 SVG。坐标用普通直角坐标（例如 A(-2,0) 就写 x:-2,y:0）。画三角形就给它三个 point + 一个 polygon。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '图下方的一句话说明，可选' },
        objects: {
          type: 'array',
          description: '图元列表。kind 可选：point / segment / line / circle / polygon / perpendicular / parallel',
          items: { type: 'object' },
        },
      },
      required: ['objects'],
    },
  },  {
    name: 'plot_points',
    description: '把一组点画成散点图（SVG）。适合展示实验数据或离散取值。',
    inputSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          description: '点列表，每项是 [x, y]',
          items: { type: 'array', items: { type: 'number' } },
        },
      },
      required: ['points'],
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
      serverInfo: { name: 'mcp-jsxgraph', version: '0.1.0' },
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
    try {
      if (name === 'plot_function') {
        reply(id, { content: [{ type: 'text', text: plotFunction(args) }] })
        return
      }
      if (name === 'plot_geometry') {
        reply(id, { content: [{ type: 'text', text: plotGeometry(args) }] })
        return
      }
      if (name === 'plot_points') {
        const pts = Array.isArray(args.points) ? args.points : []
        let marks = ''
        for (const p of pts) {
          const x = Number(p?.[0])
          const y = Number(p?.[1])
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          const sx = PAD + ((x + 7.2) / 14.4) * (W - PAD * 2)
          const sy = H - PAD - ((y + 3.2) / 6.4) * (H - PAD * 2)
          marks += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="3.5" fill="#0a84ff"/>'
        }
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
          '<rect width="100%" height="100%" fill="rgba(255,255,255,0.72)"/>' + marks + '</svg>'
        reply(id, { content: [{ type: 'text', text: svg }] })
        return
      }
      fail(id, '没有这个工具：' + String(name))
    } catch (err) {
      fail(id, err instanceof Error ? err.message : String(err), -32603)
    }
    return
  }
  fail(id, '不认识的方法：' + String(method))
}
