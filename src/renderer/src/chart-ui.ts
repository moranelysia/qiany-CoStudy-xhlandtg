/**
 * 画图（JSXGraph）：把模型写的 `[画图: {...}]` 变成真的图。
 *
 * 设计取舍：
 *   · 不接 MCP。我们的模型没有稳定的原生工具调用，走 MCP 要自己写工具循环 + 常驻进程，
 *     对"在对话里插一张图"这件事太重。JSXGraph 本身就是前端库，直接画即可。
 *   · 模型只输出一段**指令 JSON**，我们负责渲染。指令会随消息存进会话 jsonl
 *     （存指令不存位图，历史可重放、可改参数重画）。
 *   · 图型先对齐 mcp-server-jsxgraph 里最常用的五种。
 *
 * 指令格式：
 *   [画图: {"kind":"function","expr":"x^2-2x+5","domain":[-2,4]}]
 *   [画图: {"kind":"quadratic","a":1,"b":-2,"c":5}]
 *   [画图: {"kind":"geometry","points":[[0,0],[3,0],[1,2]],"polygon":true}]
 *   [画图: {"kind":"numberline","inequalities":["x > 2"]}]
 *   [画图: {"kind":"parametric","x":"cos(t)*3","y":"sin(t)*3","range":[0,6.283]}]
 */
export interface ChartSpec {
  kind: 'function' | 'quadratic' | 'geometry' | 'numberline' | 'parametric'
  expr?: string
  domain?: [number, number]
  a?: number
  b?: number
  c?: number
  points?: number[][]
  polygon?: boolean
  inequalities?: string[]
  x?: string
  y?: string
  range?: [number, number]
  title?: string
}

const MARKER = /\[画图\s*[:：]\s*(\{[\s\S]*?\})\s*\]/g

/** 从一段文本里拆出「文字段」与「图表段」 */
export type Segment = { type: 'text'; text: string } | { type: 'chart'; spec: ChartSpec }

export function splitCharts(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  MARKER.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = MARKER.exec(text)) !== null) {
    const before = text.slice(last, match.index)
    if (before.trim()) out.push({ type: 'text', text: before })
    try {
      const spec = JSON.parse(match[1]) as ChartSpec
      out.push({ type: 'chart', spec })
    } catch {
      // JSON 坏了就当普通文字留着，别让整条消息消失
      out.push({ type: 'text', text: match[0] })
    }
    last = match.index + match[0].length
  }

  const tail = text.slice(last)
  if (tail.trim()) out.push({ type: 'text', text: tail })
  return out.length ? out : [{ type: 'text', text }]
}

/** 把 JSXGraph 画进容器；失败就把错误写在容器里（不静默失败） */
export async function renderChart(spec: ChartSpec, host: HTMLElement): Promise<boolean> {
  try {
    const JXG = (await import('jsxgraph')) as unknown as {
      JSXGraph: { initBoard: (id: string, opts: Record<string, unknown>) => unknown }
    }
    const id = 'jxg-' + Math.random().toString(36).slice(2, 9)
    host.id = id
    host.style.width = '100%'
    host.style.minWidth = '280px'
    host.style.height = '300px'
    host.style.borderRadius = '14px'
    host.style.overflow = 'hidden'
    host.style.background = 'rgba(255,255,255,.72)'

    // 函数图用"扁"视窗（y 只取 ±3.5），否则 sin 这种振幅 1 的曲线会被压平
    const isFunctionLike = spec.kind === 'function' || spec.kind === 'quadratic' || spec.kind === 'parametric'
    const box = isFunctionLike ? [-6.8, 3.5, 6.8, -3.5] : [-6.8, 6.8, 6.8, -6.8]
    const board = JXG.JSXGraph.initBoard(id, {
      boundingbox: box,
      axis: true,
      showNavigation: false,
      showCopyright: false,
      keepaspect: true,
      pan: { enabled: true },
      zoom: { enabled: true },
    }) as unknown as Record<string, unknown>

    const fn = (name: string): ((x: number) => number) => {
      // eslint-disable-next-line no-new-func
      const f = new Function('x', 'return ' + name) as (x: number) => number
      return f
    }

    if (spec.kind === 'function' && spec.expr) {
      ;(board.create as (...a: unknown[]) => unknown)('functiongraph', [fn(spec.expr)], {
        strokeColor: '#0a84ff',
        strokeWidth: 2.5,
        // 每个像素都算一遍，避免高频振荡（如 sin 2x）被采样成折线
        lastArrow: false,
      })
    } else if (spec.kind === 'quadratic') {
      const a = spec.a ?? 1
      const b = spec.b ?? 0
      const c = spec.c ?? 0
      ;(board.create as (...a: unknown[]) => unknown)(
        'functiongraph',
        [(x: number) => a * x * x + b * x + c],
        { strokeColor: '#0a84ff', strokeWidth: 2.5 },
      )
      // 顶点
      const vx = a === 0 ? 0 : -b / (2 * a)
      const vy = a * vx * vx + b * vx + c
      ;(board.create as (...a: unknown[]) => unknown)('point', [vx, vy], {
        name: '顶点',
        fixed: true,
        color: '#ff3b30',
      })
    } else if (spec.kind === 'geometry' && spec.points?.length) {
      const pts = spec.points.map((p, i) =>
        (board.create as (...a: unknown[]) => unknown)('point', [p[0], p[1]], { name: String.fromCharCode(65 + i) }),
      )
      if (spec.polygon && pts.length >= 3) {
        ;(board.create as (...a: unknown[]) => unknown)('polygon', pts, { fillColor: '#0a84ff22' })
      } else {
        for (let i = 1; i < pts.length; i += 1) {
          ;(board.create as (...a: unknown[]) => unknown)('segment', [pts[i - 1], pts[i]], { strokeColor: '#0a84ff' })
        }
      }
    } else if (spec.kind === 'numberline' && spec.inequalities?.length) {
      // 数轴：把每条不等式画成一段线段 + 端点
      const axis = board.create as (...a: unknown[]) => unknown
      const from = -6
      const to = 6
      axis('segment', [[from, 0], [to, 0]], { strokeColor: '#10151c', strokeWidth: 2 })
      for (const raw of spec.inequalities) {
        const m = /x\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/.exec(raw)
        if (!m) continue
        const v = Number(m[2])
        const isGreater = m[1].startsWith('>')
        const solid = m[1].length === 2
        axis('segment', [[isGreater ? v : from, 0], [isGreater ? to : v, 0]], {
          strokeColor: '#0a84ff',
          strokeWidth: 5,
        })
        axis('point', [v, 0], {
          fixed: true,
          size: 3,
          strokeColor: '#0a84ff',
          fillColor: solid ? '#0a84ff' : '#ffffff',
          name: `x ${m[1]} ${v}`,
        })
      }
    } else if (spec.kind === 'parametric' && spec.x && spec.y) {
      const fx = fn(spec.x)
      const fy = fn(spec.y)
      ;(board.create as (...a: unknown[]) => unknown)('curve', [fx, fy], {
        strokeColor: '#0a84ff',
        strokeWidth: 2.5,
      })
    } else {
      host.textContent = '（这张图缺参数，没法画）'
      host.style.padding = '14px'
      host.style.fontSize = '12px'
      host.style.color = '#8a97a8'
      return false
    }
    return true
  } catch (err) {
    host.textContent = '画图失败：' + (err as Error).message
    host.style.padding = '14px'
    host.style.fontSize = '12px'
    host.style.color = '#c0392b'
    return false
  }
}
