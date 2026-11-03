/**
 * 几何作图（MCP 服务的实现部分）。
 *
 * 【为什么单独一个文件】
 *   jsxgraph 服务的文件已经很长了，几何是一整套独立逻辑（图元 + 视野自适应），
 *   放一起会互相淹没。ESM 相对导入在子进程里照样能用。
 *
 * 【支持的图元】
 *   point / segment / line / circle / polygon / perpendicular / parallel
 *   够覆盖初高中作图题的绝大多数：画三角形、画高、垂直平分线、外接圆。
 *
 * 【视野】
 *   按所有图元的包围盒自动留白，不要求调用方算坐标范围 —— 模型算范围容易错。
 */
const W = 640
const H = 400
const PAD = 40

function collectPoints(objects) {
  const pts = []
  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y])
  }
  for (const o of objects) {
    const k = String(o?.kind ?? '')
    if (k === 'point') push(o.x, o.y)
    else if (k === 'segment' || k === 'line' || k === 'perpendicular' || k === 'parallel') {
      push(o.x1, o.y1)
      push(o.x2, o.y2)
    } else if (k === 'circle') {
      push(o.cx - o.r, o.cy - o.r)
      push(o.cx + o.r, o.cy + o.r)
    } else if (k === 'polygon' && Array.isArray(o.points)) {
      for (const p of o.points) push(Number(p?.[0]), Number(p?.[1]))
    }
  }
  return pts
}

function esc(text) {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function fmt(v) {
  return String(Math.round(v * 100) / 100).replace('-', '−')
}

export function plotGeometry({ objects }) {
  const list = Array.isArray(objects) ? objects : []
  if (!list.length) throw new Error('objects 不能为空')

  const pts = collectPoints(list)
  if (!pts.length) throw new Error('没有可画的点')

  // 视野：包围盒 + 20% 留白，保证图形不贴边
  let minX = Math.min(...pts.map((p) => p[0]))
  let maxX = Math.max(...pts.map((p) => p[0]))
  let minY = Math.min(...pts.map((p) => p[1]))
  let maxY = Math.max(...pts.map((p) => p[1]))
  const spanX = Math.max(maxX - minX, 2)
  const spanY = Math.max(maxY - minY, 2)
  const padX = spanX * 0.2
  const padY = spanY * 0.2
  minX -= padX
  maxX += padX
  minY -= padY
  maxY += padY
  // 保持长宽比，避免圆被画成椭圆
  const ratioW = (maxX - minX) / (maxY - minY)
  const boxRatio = (W - PAD * 2) / (H - PAD * 2)
  if (ratioW > boxRatio) {
    const needY = (maxX - minX) / boxRatio
    const mid = (minY + maxY) / 2
    minY = mid - needY / 2
    maxY = mid + needY / 2
  } else {
    const needX = (maxY - minY) * boxRatio
    const mid = (minX + maxX) / 2
    minX = mid - needX / 2
    maxX = mid + needX / 2
  }

  const sx = (x) => PAD + ((x - minX) / (maxX - minX)) * (W - PAD * 2)
  const sy = (y) => H - PAD - ((y - minY) / (maxY - minY)) * (H - PAD * 2)
  const scale = (W - PAD * 2) / (maxX - minX)

  // 坐标轴（只在视野里包含原点时画）
  let axes = ''
  if (minY <= 0 && maxY >= 0) {
    const y = sy(0)
    axes += '<line x1="' + PAD + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD) + '" y2="' + y.toFixed(1) + '" stroke="#c9d4e0" stroke-dasharray="4 4"/>'
  }
  if (minX <= 0 && maxX >= 0) {
    const x = sx(0)
    axes += '<line x1="' + x.toFixed(1) + '" y1="' + PAD + '" x2="' + x.toFixed(1) + '" y2="' + (H - PAD) + '" stroke="#c9d4e0" stroke-dasharray="4 4"/>'
  }

  let body = ''
  for (const o of list) {
    const k = String(o?.kind ?? '')
    if (k === 'point') {
      const x = sx(Number(o.x))
      const y = sy(Number(o.y))
      body += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.6" fill="#0a84ff"/>'
      if (o.label) {
        body += '<text x="' + (x + 8).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" font-size="13" font-weight="600" fill="#10151c">' + esc(o.label) + '</text>'
      }
    } else if (k === 'segment' || k === 'line') {
      let x1 = sx(Number(o.x1))
      let y1 = sy(Number(o.y1))
      let x2 = sx(Number(o.x2))
      let y2 = sy(Number(o.y2))
      if (k === 'line') {
        // 延长到画布边界
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.hypot(dx, dy) || 1
        const k2 = 2000 / len
        x1 -= dx * k2
        y1 -= dy * k2
        x2 += dx * k2
        y2 += dy * k2
      }
      body +=
        '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" stroke="' + (o.color ? esc(o.color) : '#0a84ff') + '" stroke-width="2"' + (o.dashed ? ' stroke-dasharray="6 5"' : '') + '/>'
    } else if (k === 'circle') {
      const cx = sx(Number(o.cx))
      const cy = sy(Number(o.cy))
      const r = Math.abs(Number(o.r)) * scale
      body += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="#0a84ff" stroke-width="2"/>'
    } else if (k === 'polygon' && Array.isArray(o.points)) {
      const d = o.points
        .map((p, i) => (i === 0 ? 'M' : 'L') + sx(Number(p[0])).toFixed(1) + ' ' + sy(Number(p[1])).toFixed(1))
        .join(' ')
      body += '<path d="' + d + ' Z" fill="rgba(10,132,255,0.08)" stroke="#0a84ff" stroke-width="2" stroke-linejoin="round"/>'
    } else if (k === 'perpendicular' || k === 'parallel') {
      // 过点 (px,py) 作 (x1,y1)-(x2,y2) 的垂线/平行线
      const dx = Number(o.x2) - Number(o.x1)
      const dy = Number(o.y2) - Number(o.y1)
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      const nx = k === 'perpendicular' ? -uy : ux
      const ny = k === 'perpendicular' ? ux : uy
      const px = Number(o.px)
      const py = Number(o.py)
      const t = 1000 / scale
      const x1 = sx(px - nx * t)
      const y1 = sy(py - ny * t)
      const x2 = sx(px + nx * t)
      const y2 = sy(py + ny * t)
      body +=
        '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" stroke="#7a5cd6" stroke-width="1.8" stroke-dasharray="6 5"/>'
    }
  }

  const title = String(arguments[0]?.title ?? '')
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.72)"/>' +
    axes +
    body +
    (title ? '<text x="' + PAD + '" y="' + (H - 10) + '" font-size="11" fill="#8a97a8">' + esc(title) + '</text>' : '') +
    '</svg>'
  )
}
