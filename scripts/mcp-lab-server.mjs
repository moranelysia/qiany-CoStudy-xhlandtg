/**
 * 实验演示 MCP 服务（物理 / 化学）。
 *
 * 为什么单独一个服务：物理化学的实验图不是"函数曲线"——
 * 单摆要画绳和球、斜面要画地面和方块、电路要画电池和电阻、
 * 滴定要画 pH 曲线，这些用 plot_function 那种坐标轴画不出来。
 *
 * 设计上的两条克制：
 *   1. **数值全部按公式算**（T=2π√(L/g)、a=g(sinθ−μcosθ)、I=E/(R1+R2)、酸碱滴定 pH），
 *      不是摆一张示意图了事 —— 图和数必须自洽。
 *   2. 纯 SVG、零依赖、不做动画。「交互」交给界面（参数由模型或用户改，
 *      改一次重画一张），而不是在这里写一个物理引擎。
 *
 * 跑法：node scripts/mcp-lab-server.mjs（由 mcp-host/client.ts 以 stdio 启动）
 */
import process from 'node:process'
import { circuitSpec, renderCircuit } from './lib/circuit.mjs'
import {
  renderApparatus,
  renderEM,
  renderForces,
  renderLens,
  renderMitosis,
  experimentCatalog,
  renderPlaneMirror,
  renderRefraction,
  scienceSpec,
} from './lib/science.mjs'

const W = 640
const H = 400
const INK = '#10151c'
const LABEL = 'rgba(58,70,86,0.72)'
const ACCENT = '#0a7ae6'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** 数字收成最多两位小数，去掉没意义的零 */
const num = (n, d = 2) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const p = 10 ** d
  return String(Math.round(v * p) / p)
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function frame(inner, caption) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.9)"/>' +
    inner +
    (caption
      ? '<text x="' + W / 2 + '" y="' + (H - 14) + '" text-anchor="middle" font-size="15" fill="' + LABEL + '">' + esc(caption) + '</text>'
      : '') +
    '</svg>'
  )
}

function text(x, y, content, opts = {}) {
  return (
    '<text x="' + x + '" y="' + y + '" font-size="' + (opts.size ?? 15) + '" fill="' + (opts.fill ?? INK) +
    '"' + (opts.anchor ? ' text-anchor="' + opts.anchor + '"' : '') +
    (opts.weight ? ' font-weight="' + opts.weight + '"' : '') + '>' + esc(content) + '</text>'
  )
}

/* ---------------- 单摆 ---------------- */
function pendulum(p) {
  const L = clamp(Number(p.L ?? 1), 0.1, 5)
  const theta0 = clamp(Number(p.theta0 ?? 20), 1, 60)
  const g = clamp(Number(p.g ?? 9.8), 0.5, 30)
  const T = 2 * Math.PI * Math.sqrt(L / g)
  const th = (theta0 * Math.PI) / 180
  const px = 320
  const py = 70
  const len = 210
  const bx = px + len * Math.sin(th)
  const by = py + len * Math.cos(th)
  const parts = [
    '<line x1="220" y1="' + py + '" x2="420" y2="' + py + '" stroke="' + INK + '" stroke-width="3"/>',
    '<line x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + (py + len) + '" stroke="rgba(120,148,178,.5)" stroke-width="1.5" stroke-dasharray="5 6"/>',
    '<line x1="' + px + '" y1="' + py + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '" stroke="' + INK + '" stroke-width="2"/>',
    '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="15" fill="' + ACCENT + '" opacity="0.85"/>',
    '<circle cx="' + px + '" cy="' + py + '" r="4" fill="' + INK + '"/>',
    '<path d="M ' + px + ' ' + (py + 60) + ' A 60 60 0 0 1 ' + (px + 60 * Math.sin(th)).toFixed(1) + ' ' + (py + 60 * Math.cos(th)).toFixed(1) +
      '" fill="none" stroke="' + ACCENT + '" stroke-width="1.6"/>',
    text(px + 74, py + 66, 'θ₀=' + theta0 + '°', { size: 13, fill: ACCENT }),
    text(bx + 22, by + 5, 'm', { size: 14, fill: LABEL }),
    text((px + bx) / 2 - 26, (py + by) / 2, 'L=' + num(L) + 'm', { size: 13, fill: LABEL }),
    text(320, 340, '周期 T = 2π√(L/g) = ' + num(T, 3) + ' s', { size: 18, anchor: 'middle', weight: 600 }),
    text(320, 366, '摆长 ' + num(L) + ' m ｜ 重力加速度 ' + num(g) + ' m/s²（小角度近似）', { size: 13, anchor: 'middle', fill: LABEL }),
  ]
  return { svg: frame(parts.join(''), '单摆：摆动周期与摆长成正比'), summary: 'T=' + num(T, 3) + 's' }
}

/* ---------------- 斜面 ---------------- */
function incline(p) {
  const theta = clamp(Number(p.theta ?? 30), 1, 60)
  const mu = clamp(Number(p.mu ?? 0.2), 0, 1.5)
  const m = clamp(Number(p.m ?? 1), 0.1, 100)
  const g = clamp(Number(p.g ?? 9.8), 0.5, 30)
  const th = (theta * Math.PI) / 180
  const ax = 120
  const ay = 330
  const hyp = 380
  const bx = ax + hyp * Math.cos(th)
  const by = ay - hyp * Math.sin(th)
  const aRaw = g * (Math.sin(th) - mu * Math.cos(th))
  const a = Math.max(0, aRaw)
  const N = m * g * Math.cos(th)
  const fr = mu * N
  const tanMax = Math.tan(th)
  const moving = aRaw > 0.0001
  const parts = [
    '<polygon points="' + ax + ',' + ay + ' ' + bx.toFixed(1) + ',' + by.toFixed(1) + ' ' + bx.toFixed(1) + ',' + ay +
      '" fill="rgba(120,148,178,.14)" stroke="' + INK + '" stroke-width="2"/>',
    // 角度弧
    '<path d="M ' + (ax + 56) + ' ' + ay + ' A 56 56 0 0 0 ' + (ax + 56 * Math.cos(th)).toFixed(1) + ' ' + (ay - 56 * Math.sin(th)).toFixed(1) +
      '" fill="none" stroke="' + ACCENT + '" stroke-width="1.6"/>',
    text(ax + 66, ay - 8, 'θ=' + theta + '°', { size: 13, fill: ACCENT }),
    // 方块
    (() => {
      const cx = ax + hyp * 0.55 * Math.cos(th)
      const cy = ay - hyp * 0.55 * Math.sin(th)
      const s = 26
      const pts = [
        [cx - s * Math.cos(th) + s * Math.sin(th), cy + s * Math.sin(th) + s * Math.cos(th)],
        [cx + s * Math.cos(th) + s * Math.sin(th), cy - s * Math.sin(th) + s * Math.cos(th)],
        [cx + s * Math.cos(th) - s * Math.sin(th), cy - s * Math.sin(th) - s * Math.cos(th)],
        [cx - s * Math.cos(th) - s * Math.sin(th), cy + s * Math.sin(th) - s * Math.cos(th)],
      ]
      return (
        '<polygon points="' + pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') +
        '" fill="' + ACCENT + '" opacity="0.85"/>' +
        // 下滑方向箭头
        '<line x1="' + (cx + 40 * Math.cos(th)).toFixed(1) + '" y1="' + (cy - 40 * Math.sin(th)).toFixed(1) +
        '" x2="' + (cx + 95 * Math.cos(th)).toFixed(1) + '" y2="' + (cy - 95 * Math.sin(th)).toFixed(1) +
        '" stroke="#b42318" stroke-width="2.4" marker-end="url(#ar)"/>' +
        text(cx + 104 * Math.cos(th), cy - 100 * Math.sin(th), 'a=' + num(aRaw, 2) + ' m/s²', { size: 13, fill: '#b42318' })
      )
    })(),
    '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b42318"/></marker></defs>',
    text(320, 340, moving ? '沿斜面下滑加速度 a = g(sinθ − μcosθ) = ' + num(aRaw, 2) + ' m/s²' : '静止：μ = ' + num(mu) + ' ≥ tanθ = ' + num(tanMax, 2),
      { size: 18, anchor: 'middle', weight: 600 }),
    text(320, 366, '质量 ' + num(m) + ' kg ｜ 摩擦系数 μ=' + num(mu) + ' ｜ 支持力 N=' + num(N, 1) + ' N ｜ 摩擦力 ' + num(fr, 1) + ' N',
      { size: 13, anchor: 'middle', fill: LABEL }),
  ]
  return { svg: frame(parts.join(''), '斜面：重力沿斜面的分量与摩擦力'), summary: 'a=' + num(aRaw, 2) + 'm/s²' }
}

/* ---------------- 串联电路 ---------------- */
function circuit(p) {
  const E = clamp(Number(p.emf ?? 6), 0.1, 240)
  const r1 = clamp(Number(p.r1 ?? 10), 0.1, 10000)
  const r2 = clamp(Number(p.r2 ?? 20), 0.1, 10000)
  const I = E / (r1 + r2)
  const U1 = I * r1
  const U2 = I * r2
  const left = 110
  const right = 530
  const top = 90
  const bottom = 300
  const parts = [
    '<rect x="' + left + '" y="' + top + '" width="' + (right - left) + '" height="' + (bottom - top) +
      '" fill="none" stroke="' + INK + '" stroke-width="2.5" rx="14"/>',
    // 电池（左边中间）
    '<line x1="' + left + '" y1="' + (top + 70) + '" x2="' + left + '" y2="' + (bottom - 70) + '" stroke="#fff" stroke-width="8"/>',
    '<line x1="' + (left - 14) + '" y1="' + (top + 90) + '" x2="' + (left + 14) + '" y2="' + (top + 90) + '" stroke="' + INK + '" stroke-width="4"/>',
    '<line x1="' + (left - 7) + '" y1="' + (bottom - 90) + '" x2="' + (left + 7) + '" y2="' + (bottom - 90) + '" stroke="' + INK + '" stroke-width="2.5"/>',
    text(left - 26, (top + bottom) / 2 + 5, 'E=' + num(E) + 'V', { size: 14, fill: ACCENT, anchor: 'end' }),
    // 两个电阻（上方横线上）
    '<rect x="' + (left + 70) + '" y="' + (top - 14) + '" width="86" height="28" fill="#fff" stroke="' + INK + '" stroke-width="2" rx="6"/>',
    '<rect x="' + (right - 156) + '" y="' + (top - 14) + '" width="86" height="28" fill="#fff" stroke="' + INK + '" stroke-width="2" rx="6"/>',
    text(left + 113, top + 38, 'R₁=' + num(r1) + 'Ω', { size: 14, anchor: 'middle', fill: LABEL }),
    text(right - 113, top + 38, 'R₂=' + num(r2) + 'Ω', { size: 14, anchor: 'middle', fill: LABEL }),
    // 电流方向
    '<line x1="' + (left + 180) + '" y1="' + (top - 40) + '" x2="' + (left + 260) + '" y2="' + (top - 40) +
      '" stroke="' + ACCENT + '" stroke-width="2.4" marker-end="url(#cur)"/>',
    text(left + 220, top - 50, 'I=' + num(I, 3) + 'A', { size: 14, anchor: 'middle', fill: ACCENT }),
    '<defs><marker id="cur" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + ACCENT + '"/></marker></defs>',
    text(320, 344, '串联：I = E/(R₁+R₂) = ' + num(I, 3) + ' A', { size: 18, anchor: 'middle', weight: 600 }),
    text(320, 368, 'U₁=' + num(U1, 2) + ' V ｜ U₂=' + num(U2, 2) + ' V ｜ 总电阻 ' + num(r1 + r2) + ' Ω', { size: 13, anchor: 'middle', fill: LABEL }),
  ]
  return { svg: frame(parts.join(''), '串联电路：电流处处相等，电压按电阻分配'), summary: 'I=' + num(I, 3) + 'A' }
}

/* ---------------- 酸碱滴定 ---------------- */
function titration(p) {
  const c = clamp(Number(p.acid ?? 0.1), 0.0001, 2) // 酸浓度 mol/L
  const v0 = clamp(Number(p.v0 ?? 20), 1, 200) // 酸的体积 mL
  const cb = clamp(Number(p.base ?? 0.1), 0.0001, 2) // 碱浓度
  const veq = (c * v0) / cb
  const vmax = veq * 2
  const ph = (v) => {
    const nA = (c * v0) / 1000
    const nB = (cb * v) / 1000
    const vt = (v0 + v) / 1000
    const diff = (nA - nB) / vt
    if (Math.abs(diff) < 1e-12) return 7
    if (diff > 0) return -Math.log10(Math.max(diff, 1e-14))
    return 14 + Math.log10(Math.max(-diff, 1e-14))
  }
  const x0 = 90
  const x1 = 560
  const y0 = 70
  const y1 = 310
  const sx = (v) => x0 + ((v / vmax) * (x1 - x0))
  const sy = (val) => y1 - (clamp(val, 0, 14) / 14) * (y1 - y0)
  let d = ''
  const steps = 400
  for (let i = 0; i <= steps; i += 1) {
    const v = (vmax * i) / steps
    d += (i ? 'L' : 'M') + sx(v).toFixed(1) + ' ' + sy(ph(v)).toFixed(1) + ' '
  }
  const parts = [
    '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="rgba(120,148,178,.7)" stroke-width="1.5"/>',
    '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="rgba(120,148,178,.7)" stroke-width="1.5"/>',
    text(x0 - 12, y0 + 4, 'pH 14', { size: 12, anchor: 'end', fill: LABEL }),
    text(x0 - 12, y1 + 4, '0', { size: 12, anchor: 'end', fill: LABEL }),
    text((x0 + x1) / 2, y1 + 26, '加入碱的体积 / mL', { size: 13, anchor: 'middle', fill: LABEL }),
    text(x0 - 4, (y0 + y1) / 2, 'pH', { size: 13, anchor: 'end', fill: LABEL }),
    '<line x1="' + sx(veq) + '" y1="' + y0 + '" x2="' + sx(veq) + '" y2="' + y1 + '" stroke="#b42318" stroke-width="1.4" stroke-dasharray="5 5"/>',
    '<path d="' + d.trim() + '" fill="none" stroke="' + ACCENT + '" stroke-width="2.6"/>',
    '<circle cx="' + sx(veq).toFixed(1) + '" cy="' + sy(7).toFixed(1) + '" r="5" fill="#b42318"/>',
    text(sx(veq) + 10, sy(7) - 10, '等当点 ' + num(veq, 2) + ' mL（pH 7）', { size: 13, fill: '#b42318' }),
    text(320, 350, '强酸 ' + num(c, 3) + ' mol/L ' + num(v0) + ' mL ↔ 强碱 ' + num(cb, 3) + ' mol/L', { size: 15, anchor: 'middle', weight: 600 }),
    text(320, 372, '等当点前 pH 由剩余酸决定，之后由过量碱决定（拐点处 pH 突变）', { size: 12, anchor: 'middle', fill: LABEL }),
  ]
  return { svg: frame(parts.join(''), '酸碱滴定：pH 随加入碱量的变化'), summary: 'Veq=' + num(veq, 2) + 'mL' }
}

/* ---------------- 导体棒切割磁感线（电磁感应） ---------------- */
function induction(p) {
  const B = clamp(Number(p.B ?? 0.5), 0.01, 20) // 磁感应强度 T
  const L = clamp(Number(p.L ?? 0.4), 0.01, 5) // 棒长（有效切割长度）m
  const v = clamp(Number(p.v ?? 2), 0.01, 100) // 速度 m/s
  const R = clamp(Number(p.R ?? 0.8), 0.01, 1000) // 回路电阻 Ω
  const emf = B * L * v
  const I = emf / R
  const F = B * I * L // 安培力（阻碍相对运动）
  const P = I * I * R
  const left = 150
  const right = 520
  const top = 150
  const bottom = 300
  const rodX = 450

  const marks = []
  for (let x = left + 26; x < right - 10; x += 48) {
    for (let y = top + 24; y < bottom - 6; y += 44) {
      marks.push('<path d="M ' + x + ' ' + y + ' l 10 10 M ' + (x + 10) + ' ' + y + ' l -10 10" stroke="rgba(10,90,170,.42)" stroke-width="1.4"/>')
    }
  }

  const parts = [
    '<rect x="' + left + '" y="' + top + '" width="' + (right - left) + '" height="' + (bottom - top) + '" fill="rgba(10,122,230,.04)" stroke="none"/>',
    marks.join(''),
    // 导轨
    '<line x1="' + left + '" y1="' + top + '" x2="' + right + '" y2="' + top + '" stroke="' + INK + '" stroke-width="3"/>',
    '<line x1="' + left + '" y1="' + bottom + '" x2="' + right + '" y2="' + bottom + '" stroke="' + INK + '" stroke-width="3"/>',
    '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + bottom + '" stroke="' + INK + '" stroke-width="2" stroke-dasharray="6 5"/>',
    // 电阻（左边）
    '<rect x="' + (left - 16) + '" y="' + (top + bottom) / 2 - 18 + '" width="32" height="36" fill="#fff" stroke="' + INK + '" stroke-width="2" rx="4"/>',
    text(left - 30, (top + bottom) / 2 + 5, 'R', { size: 14, anchor: 'end', fill: LABEL }),
    // 导体棒
    '<line x1="' + rodX + '" y1="' + top + '" x2="' + rodX + '" y2="' + bottom + '" stroke="#b42318" stroke-width="5" stroke-linecap="round"/>',
    text(rodX, top - 12, '导体棒 L=' + num(L) + 'm', { size: 13, anchor: 'middle', fill: '#b42318' }),
    // 速度
    '<line x1="' + (rodX + 8) + '" y1="' + (top + 34) + '" x2="' + (rodX + 78) + '" y2="' + (top + 34) + '" stroke="#0b7d5b" stroke-width="2.6" marker-end="url(#vhd)"/>',
    text(rodX + 44, top + 24, 'v=' + num(v) + ' m/s', { size: 13, anchor: 'middle', fill: '#0b7d5b' }),
    // 安培力（阻碍运动）
    '<line x1="' + (rodX - 8) + '" y1="' + (bottom - 30) + '" x2="' + (rodX - 76) + '" y2="' + (bottom - 30) + '" stroke="#8a5a00" stroke-width="2.4" marker-end="url(#fhd)"/>',
    text(rodX - 44, bottom - 40, 'F安=' + num(F, 3) + ' N', { size: 12.5, anchor: 'middle', fill: '#8a5a00' }),
    // 电流方向（右手定则：v 向右、B 垂直纸面内向 → 棒中电流由下往上）
    '<line x1="' + (rodX - 8) + '" y1="' + (bottom - 14) + '" x2="' + (rodX - 8) + '" y2="' + (top + 14) + '" stroke="' + ACCENT + '" stroke-width="2.2" marker-end="url(#ihd)"/>',
    text(rodX + 30, (top + bottom) / 2 + 34, 'I=' + num(I, 3) + ' A', { size: 13, anchor: 'start', fill: ACCENT }),
    '<defs>' +
      '<marker id="vhd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0b7d5b"/></marker>' +
      '<marker id="fhd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a5a00"/></marker>' +
      '<marker id="ihd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + ACCENT + '"/></marker>' +
      '</defs>',
    text(320, 340, 'ε = BLv = ' + num(emf, 3) + ' V ｜ I = ε/R = ' + num(I, 3) + ' A', { size: 18, anchor: 'middle', weight: 600 }),
    text(320, 366, 'B=' + num(B) + 'T（垂直纸面向里，× 表示） ｜ 安培力 F=BIL=' + num(F, 3) + 'N ｜ 电功率 I²R=' + num(P, 3) + 'W',
      { size: 12.5, anchor: 'middle', fill: LABEL }),
  ]
  return { svg: frame(parts.join(''), '导体棒切割磁感线：感应电动势 ε=BLv，安培力阻碍相对运动'), summary: 'ε=' + num(emf, 3) + 'V I=' + num(I, 3) + 'A' }
}

/* ---------------- 光合作用 ---------------- */
function photosynthesis(p) {
  // detail 必须**真的改变画面**：以前它只换了最下面一行说明，
  // 画出来的永远是"光反应 + 暗反应"全图 —— 模型说"单独给你看暗反应"，图却没变，
  // 学生按图回答就会答错（真实投诉）。现在三种模式各画各的。
  const raw = String(p.detail ?? 'both').toLowerCase()
  const detail = raw === 'light' ? 'light' : raw === 'dark' ? 'dark' : 'both'
  const cx = 360
  const cy = 176
  const showLight = detail === 'both' || detail === 'light'
  const showDark = detail === 'both' || detail === 'dark'
  const parts = [
    // 叶绿体
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="168" ry="104" fill="rgba(16,168,122,.10)" stroke="#0b7d5b" stroke-width="2.2"/>',
  ]

  if (showLight) {
    // 类囊体堆（基粒）+ 光反应标注
    for (let g = 0; g < 3; g += 1) {
      const gx = cx - 96 + g * 40
      for (let i = 0; i < 4; i += 1) {
        parts.push('<rect x="' + gx + '" y="' + (cy - 34 + i * 11) + '" width="30" height="7" rx="3.5" fill="#0f9c72" opacity="0.8"/>')
      }
    }
    parts.push(text(cx - 96, cy + 44, '类囊体膜（光反应）', { size: 11.5, fill: '#0b7d5b' }))
    // 输入：光、水
    parts.push(
      '<circle cx="70" cy="96" r="20" fill="#ffd60a" opacity="0.85"/>',
      text(70, 60, '光能', { size: 13, anchor: 'middle', fill: '#8a5a00' }),
      '<line x1="94" y1="96" x2="' + (cx - 168) + '" y2="' + (cy - 34) + '" stroke="#d9a400" stroke-width="2.2" marker-end="url(#ph1)"/>',
      text(122, 214, 'H₂O', { size: 15, anchor: 'middle', weight: 600 }),
      '<line x1="146" y1="208" x2="' + (cx - 166) + '" y2="' + (cy + 10) + '" stroke="#0a7ae6" stroke-width="2.2" marker-end="url(#ph2)"/>',
      // 输出：O₂
      '<line x1="' + (cx - 40) + '" y1="' + (cy - 96) + '" x2="' + (cx - 40) + '" y2="' + 78 + '" stroke="#0a7ae6" stroke-width="2.4" marker-end="url(#ph2)"/>',
      text(cx - 40, 62, 'O₂', { size: 15, anchor: 'middle', weight: 600, fill: ACCENT }),
      text(cx + 40, 62, '（O₂ 里的氧全部来自水）', { size: 11.5, anchor: 'middle', fill: LABEL }),
    )
    if (detail === 'light') {
      parts.push(text(cx, cy - 8, '[H] + ATP', { size: 13, anchor: 'middle', weight: 600, fill: '#0b7d5b' }))
    }
  }

  if (showDark) {
    // 基质 + 暗反应：CO₂ → C₃ → 糖类
    parts.push(
      // 基质标注：暗反应单独画时居放在椭圆内部，别贴着右边框被切掉
      text(
        detail === 'dark' ? cx - 30 : cx + 52,
        detail === 'dark' ? cy + 56 : cy + 44,
        detail === 'dark' ? '叶绿体基质（暗反应）' : '基质（暗反应）',
        { size: 11.5, anchor: detail === 'dark' ? 'middle' : 'start', fill: '#0b7d5b' },
      ),
      // CO₂ 挪到箭头左边、往上一点：原来 y=330 正好压住下面 342 那行方程式
      text(cx - 96, 292, 'CO₂', { size: 15, anchor: 'middle', weight: 600 }),
      '<line x1="' + (cx - 60) + '" y1="' + 316 + '" x2="' + (cx - 60) + '" y2="' + (cy + 96) + '" stroke="#6b7a8a" stroke-width="2.2" marker-end="url(#ph3)"/>',
      '<line x1="' + (cx + 166) + '" y1="' + (cy + 10) + '" x2="' + 566 + '" y2="' + (cy + 10) + '" stroke="#b26205" stroke-width="2.4" marker-end="url(#ph4)"/>',
      text(590, cy + 6, 'C₆H₁₂O₆', { size: 15, anchor: 'end', weight: 600, fill: '#b26205' }),
      text(590, cy + 26, '（糖类）', { size: 11.5, anchor: 'end', fill: LABEL }),
    )
    if (detail === 'dark') {
      // 单独看暗反应时，把卡尔文循环画出来。放右侧避开 CO₂ 那根竖箭头（x=cx-60）
      parts.push(
        text(cx + 76, cy - 6, 'C₅ + CO₂ → 2C₃', { size: 13, anchor: 'middle', weight: 600 }),
        text(cx + 76, cy + 16, '（卡尔文循环）', { size: 11.5, anchor: 'middle', fill: LABEL }),
      )
    }
  }

  parts.push(
    '<defs>' +
      '<marker id="ph1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d9a400"/></marker>' +
      '<marker id="ph2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0a7ae6"/></marker>' +
      '<marker id="ph3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7a8a"/></marker>' +
      '<marker id="ph4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b26205"/></marker>' +
      '</defs>',
    text(320, 342, '6CO₂ + 6H₂O —光能/叶绿体→ C₆H₁₂O₆ + 6O₂', { size: 17, anchor: 'middle', weight: 600 }),
    text(
      320,
      364,
      detail === 'light'
        ? '只画光反应：水的光解产生 O₂ 与 [H]、ATP'
        : detail === 'dark'
          ? '只画暗反应：CO₂ 被 C₅ 固定成 C₃，经卡尔文循环生成糖'
          : '光反应在类囊体膜上，暗反应在叶绿体基质里，两者靠 [H] 和 ATP 连接',
      { size: 12, anchor: 'middle', fill: LABEL },
    ),
  )
  const title = detail === 'light' ? '光合作用 · 只看光反应' : detail === 'dark' ? '光合作用 · 只看暗反应' : '光合作用：光反应 + 暗反应'
  return { svg: frame(parts.join(''), title), summary: 'detail=' + detail }
}

/* ---------------- 家族谱系图 ---------------- */
const PATTERNS = {
  AR: {
    name: '常染色体隐性',
    members: [
      { id: 'I1', gen: 1, sex: 'M', affected: false },
      { id: 'I2', gen: 1, sex: 'F', affected: false, carrier: true },
      { id: 'II1', gen: 2, sex: 'M', affected: true, parents: ['I1', 'I2'] },
      { id: 'II2', gen: 2, sex: 'F', affected: false, parents: ['I1', 'I2'] },
      { id: 'II3', gen: 2, sex: 'M', affected: false, carrier: true, parents: ['I1', 'I2'] },
    ],
    note: '父母都正常却生出患病孩子，且男女都可能患病 → 隐性且在常染色体上',
  },
  AD: {
    name: '常染色体显性',
    members: [
      { id: 'I1', gen: 1, sex: 'M', affected: true },
      { id: 'I2', gen: 1, sex: 'F', affected: false },
      { id: 'II1', gen: 2, sex: 'F', affected: true, parents: ['I1', 'I2'] },
      { id: 'II2', gen: 2, sex: 'M', affected: false, parents: ['I1', 'I2'] },
    ],
    note: '代代发病（连续遗传），男女患病机会均等 → 显性且在常染色体上',
  },
  XR: {
    name: '伴 X 隐性',
    members: [
      { id: 'I1', gen: 1, sex: 'M', affected: false },
      { id: 'I2', gen: 1, sex: 'F', affected: false, carrier: true },
      { id: 'II1', gen: 2, sex: 'M', affected: true, parents: ['I1', 'I2'] },
      { id: 'II2', gen: 2, sex: 'F', affected: false, parents: ['I1', 'I2'] },
    ],
    note: '母亲正常（携带者）而儿子患病、父亲正常 → 伴 X 隐性（交叉遗传）',
  },
  mito: {
    name: '母系遗传（线粒体）',
    members: [
      { id: 'I1', gen: 1, sex: 'F', affected: true },
      { id: 'I2', gen: 1, sex: 'M', affected: false },
      { id: 'II1', gen: 2, sex: 'M', affected: true, parents: ['I1', 'I2'] },
      { id: 'II2', gen: 2, sex: 'F', affected: true, parents: ['I1', 'I2'] },
    ],
    note: '母亲患病时子女全患病，父亲患病时子女都不患病 → 母系遗传',
  },
}

function pedigree(p) {
  const patternKey = String(p.pattern ?? 'AR').toUpperCase()
  const preset = PATTERNS[patternKey] || PATTERNS.AR
  const members = Array.isArray(p.members) && p.members.length ? p.members : preset.members
  const note = String(p.note ?? preset.note ?? '')

  const gens = [...new Set(members.map((m) => Number(m.gen) || 1))].sort((a, b) => a - b)
  const rowH = gens.length > 2 ? 88 : 104
  const top0 = gens.length > 2 ? 60 : 76
  const marginX = 90
  const W2 = W - marginX * 2

  // 每代按出现顺序横向平均铺开 —— 教学图不需要做交叉最小化
  // 先排"每代里谁在左谁在右"：用父母的位置做重心排序（两遍），能明显减少连线交叉。
  // 纯按出现顺序摆的话，多子女家庭一交叉就成蜘蛛网（用户提过）。
  const rows = new Map()
  for (const g of gens) rows.set(g, members.filter((m) => (Number(m.gen) || 1) === g))
  for (let pass = 0; pass < 2; pass += 1) {
    for (let gi = 1; gi < gens.length; gi += 1) {
      const row = rows.get(gens[gi])
      const prev = rows.get(gens[gi - 1])
      const idxOf = (id) => {
        const k = prev.findIndex((m) => m.id === id)
        return k >= 0 ? k : null
      }
      row.sort((a, b) => {
        const bary = (m) => {
          const ps = (Array.isArray(m.parents) ? m.parents : []).map(idxOf).filter((v) => v !== null)
          return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 1e9
        }
        return bary(a) - bary(b)
      })
    }
  }

  const pos = new Map()
  for (const g of gens) {
    const row = rows.get(g)
    const n = row.length
    const step = n > 1 ? Math.min(140, W2 / (n - 1)) : 0
    const startX = n > 1 ? marginX + (W2 - step * (n - 1)) / 2 : W / 2
    row.forEach((m, i) => {
      pos.set(m.id, { x: startX + step * i, y: top0 + (gens.indexOf(g) + 1) * rowH, m })
    })
  }

  const symbols = []
  const lines = []
  const R = 11
  const half = 10

  // 夫妻：任何一对共同父母 → 连一条横线
  const couples = new Map()
  for (const m of members) {
    const par = m.parents
    if (Array.isArray(par) && par.length === 2 && pos.has(par[0]) && pos.has(par[1])) {
      couples.set(par[0] + '|' + par[1], [par[0], par[1]])
    }
  }

  for (const m of members) {
    const point = pos.get(m.id)
    if (!point) continue
    const { x, y } = point
    if (m.sex === 'M') {
      symbols.push(
        '<rect x="' + (x - half) + '" y="' + (y - half) + '" width="20" height="20" rx="2" fill="' +
          (m.affected ? '#b42318' : '#ffffff') + '" stroke="#10151c" stroke-width="1.8"/>',
      )
    } else {
      symbols.push(
        '<circle cx="' + x + '" cy="' + y + '" r="' + R + '" fill="' + (m.affected ? '#b42318' : '#ffffff') +
          '" stroke="#10151c" stroke-width="1.8"/>',
      )
    }
    if (m.carrier) {
      symbols.push('<circle cx="' + x + '" cy="' + y + '" r="4" fill="#10151c"/>')
    }
    if (m.label) {
      symbols.push(text(x, y - 18, String(m.label), { size: 11.5, anchor: 'middle', fill: LABEL }))
    }
  }

  // 夫妻横线
  for (const [a, b] of couples.values()) {
    const pa = pos.get(a)
    const pb = pos.get(b)
    if (!pa || !pb) continue
    const y = pa.y
    const x1 = Math.min(pa.x, pb.x) + half
    const x2 = Math.max(pa.x, pb.x) - half
    lines.push('<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="#10151c" stroke-width="1.8"/>')
  }

  // 子女连线：从夫妻中点往下 → 横线 → 垂到每个孩子
  const busY = rowH * 0.5
  const groups = new Map()
  for (const m of members) {
    if (!Array.isArray(m.parents) || m.parents.length < 2) continue
    const key = m.parents[0] + '|' + m.parents[1]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(m)
  }
  for (const [key, kids] of groups) {
    const [a, b] = key.split('|')
    const pa = pos.get(a)
    const pb = pos.get(b)
    if (!pa || !pb) continue
    const midX = (pa.x + pb.x) / 2
    const dropY = pa.y + busY
    lines.push('<line x1="' + midX + '" y1="' + pa.y + '" x2="' + midX + '" y2="' + dropY + '" stroke="#10151c" stroke-width="1.8"/>')
    const xs = kids.map((k) => pos.get(k.id)?.x).filter((v) => typeof v === 'number')
    if (xs.length) {
      const minX = Math.min(midX, ...xs)
      const maxX = Math.max(midX, ...xs)
      lines.push('<line x1="' + minX + '" y1="' + dropY + '" x2="' + maxX + '" y2="' + dropY + '" stroke="#10151c" stroke-width="1.8"/>')
      for (const k of kids) {
        const kp = pos.get(k.id)
        if (!kp) continue
        lines.push('<line x1="' + kp.x + '" y1="' + dropY + '" x2="' + kp.x + '" y2="' + (kp.y - half) + '" stroke="#10151c" stroke-width="1.8"/>')
      }
    }
  }

  // 世代标号
  gens.forEach((g, i) => {
    const roman = 'Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ'.split(' ')[i] || String(i + 1)
    symbols.push(text(38, top0 + (i + 1) * rowH + 5, roman, { size: 15, weight: 600, fill: LABEL }))
  })

  const legendY = H - 58
  const parts = [
    lines.join(''),
    symbols.join(''),
    '<line x1="' + marginX + '" y1="' + (legendY - 24) + '" x2="' + (W - marginX) + '" y2="' + (legendY - 24) + '" stroke="rgba(120,148,178,.3)" stroke-width="1"/>',
    '<rect x="' + marginX + '" y="' + (legendY - 8) + '" width="16" height="16" rx="2" fill="#fff" stroke="#10151c" stroke-width="1.6"/>',
    text(marginX + 22, legendY + 5, '男', { size: 12, fill: LABEL }),
    '<circle cx="' + (marginX + 72) + '" cy="' + legendY + '" r="8" fill="#fff" stroke="#10151c" stroke-width="1.6"/>',
    text(marginX + 86, legendY + 5, '女', { size: 12, fill: LABEL }),
    '<rect x="' + (marginX + 128) + '" y="' + (legendY - 8) + '" width="16" height="16" rx="2" fill="#b42318" stroke="#10151c" stroke-width="1.6"/>',
    text(marginX + 150, legendY + 5, '患者', { size: 12, fill: LABEL }),
    '<circle cx="' + (marginX + 204) + '" cy="' + legendY + '" r="4" fill="#10151c"/>',
    text(marginX + 214, legendY + 5, '携带者', { size: 12, fill: LABEL }),
    // 判断依据单独一行：以前和左边图例挤在同一行，字叠在一起
    text(W / 2, H - 34, note, { size: 12.5, anchor: 'middle', fill: LABEL }),
  ]
  return {
    svg: frame(parts.join(''), '家族谱系图 · ' + (p.pattern ? preset.name : '自定义')),
    summary: 'members=' + members.length,
  }
}

/* ==================================================================
 * 自由绘图：通用场景语言
 * ==================================================================
 * 前面那些 kind 是**预设**（单摆/斜面/…），覆盖不了"学生明天问的另一张图"。
 * 真正要的是**画这种图的能力**：给一个足够好用的图元集合，模型自己摆。
 *
 * 场景是纯数据：
 *   { width, height, title, caption, elements: [ … ] }
 * 图元（type）：
 *   基础：rect / circle / ellipse / line / arrow / polygon / path / text
 *   教学专用（省得模型自己拼）：
 *     field    匀强磁场网格（kind:'into' 画 ×，'out' 画 •）
 *     resistor 电阻方块（带标签）
 *     battery  电源（长短极板 + 标签）
 *     coil     螺线管/线圈
 *     spring   弹簧
 *     grana    叶绿体基粒（类囊体堆）
 *     dimension 尺寸标注线（带两端小竖线 + 文字）
 * 通用属性：stroke / fill / sw(描边宽) / dash / opacity / rx
 *
 * 刻意不做的事：不在服务端算物理量 —— 数值由模型按公式算好写进 label/text，
 * 这样"图"和"话"里的数不会各说各的。
 */
const SCENE_TYPES = [
  'rect',
  'circle',
  'ellipse',
  'line',
  'arrow',
  'polygon',
  'path',
  'text',
  'field',
  'resistor',
  'battery',
  'coil',
  'spring',
  'grana',
  'dimension',
]

const n0 = (v, d = 0) => {
  const x = Number(v)
  if (!Number.isFinite(x)) return 0
  const p = 10 ** d
  return Math.round(x * p) / p
}

function frameAt(width, height, inner, caption) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.92)"/>' +
    '<defs>' +
    '<marker id="sc-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>' +
    '</defs>' +
    inner +
    (caption
      ? '<text x="' + width / 2 + '" y="' + (height - 12) + '" text-anchor="middle" font-size="14" fill="' + LABEL + '">' + esc(caption) + '</text>'
      : '') +
    '</svg>'
  )
}

/** 一个图元 → 一段 SVG。返回 { svg, warn } */
function element(e, i) {
  const t = String(e && e.type ? e.type : '').trim()
  const stroke = e && e.stroke ? String(e.stroke) : INK
  const fill = e && e.fill ? String(e.fill) : 'none'
  const sw = Number(e && e.sw ? e.sw : 2)
  const dash = e && e.dash ? ' stroke-dasharray="7 6"' : ''
  const op = e && typeof e.opacity === 'number' ? ' opacity="' + e.opacity + '"' : ''
  const common = ' stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + op
  switch (t) {
    case 'rect': {
      const rx = e.rx === undefined ? 4 : Number(e.rx)
      return { svg: '<rect x="' + n0(e.x) + '" y="' + n0(e.y) + '" width="' + n0(e.w) + '" height="' + n0(e.h) + '" rx="' + rx + '" fill="' + fill + '"' + common + '/>' }
    }
    case 'circle':
      return { svg: '<circle cx="' + n0(e.cx) + '" cy="' + n0(e.cy) + '" r="' + n0(e.r) + '" fill="' + fill + '"' + common + '/>' }
    case 'ellipse':
      return { svg: '<ellipse cx="' + n0(e.cx) + '" cy="' + n0(e.cy) + '" rx="' + n0(e.rx) + '" ry="' + n0(e.ry) + '" fill="' + fill + '"' + common + '/>' }
    case 'line':
      return {
        svg:
          '<line x1="' + n0(e.x1) + '" y1="' + n0(e.y1) + '" x2="' + n0(e.x2) + '" y2="' + n0(e.y2) + '"' + common +
          ' stroke-linecap="round"/>',
      }
    case 'arrow': {
      const c = e.color ? String(e.color) : stroke
      const line =
        '<line x1="' + n0(e.x1) + '" y1="' + n0(e.y1) + '" x2="' + n0(e.x2) + '" y2="' + n0(e.y2) +
        '" stroke="' + c + '" stroke-width="' + sw + '"' + dash + op + ' marker-end="url(#sc-a)" stroke-linecap="round"/>'
      let label = ''
      if (e.label) {
        const mx = (n0(e.x1) + n0(e.x2)) / 2
        const my = (n0(e.y1) + n0(e.y2)) / 2
        const dx = Number(e.labelDx ?? 0)
        const dy = Number(e.labelDy ?? -8)
        label = '<text x="' + n0(mx + dx) + '" y="' + n0(my + dy) + '" font-size="' + (e.labelSize ?? 13) +
          '" text-anchor="middle" fill="' + c + '">' + esc(e.label) + '</text>'
      }
      return { svg: '<g>' + line + label + '</g>' }
    }
    case 'polygon': {
      const pts = Array.isArray(e.points) ? e.points : []
      return {
        svg: '<polygon points="' + pts.map((p) => n0(Array.isArray(p) ? p[0] : p.x) + ',' + n0(Array.isArray(p) ? p[1] : p.y)).join(' ') +
          '" fill="' + fill + '"' + common + '/>',
      }
    }
    case 'path':
      return { svg: '<path d="' + esc(e.d) + '" fill="' + fill + '"' + common + '/>' }
    case 'text':
      return {
        svg: '<text x="' + n0(e.x) + '" y="' + n0(e.y) + '" font-size="' + Number(e.size ?? 14) +
          '" text-anchor="' + (e.anchor || 'start') + '"' + (e.weight ? ' font-weight="' + Number(e.weight) + '"' : '') +
          ' fill="' + (e.color ? String(e.color) : INK) + '">' + esc(e.text) + '</text>',
      }
    case 'field': {
      const x = n0(e.x); const y = n0(e.y); const w = n0(e.w); const h = n0(e.h)
      const step = Math.max(16, Number(e.step ?? 44))
      const into = String(e.kind ?? 'into') === 'into'
      let out = ''
      for (let px = x + step / 2; px < x + w; px += step) {
        for (let py = y + step / 2; py < y + h; py += step) {
          out += into
            ? '<path d="M ' + n0(px - 6) + ' ' + n0(py - 6) + ' l 12 12 M ' + n0(px + 6) + ' ' + n0(py - 6) + ' l -12 12" stroke="' + (e.color || 'rgba(10,90,170,.45)') + '" stroke-width="1.4"/>'
            : '<circle cx="' + n0(px) + '" cy="' + n0(py) + '" r="3.4" fill="' + (e.color || 'rgba(10,90,170,.45)') + '"/>'
        }
      }
      return { svg: out }
    }
    case 'resistor': {
      const x = n0(e.x); const y = n0(e.y); const w = n0(e.w ?? 64); const h = n0(e.h ?? 22)
      return {
        svg:
          '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#fff"' + common + '/>' +
          (e.label ? '<text x="' + n0(x + w / 2) + '" y="' + n0(y + h + 15) + '" font-size="12.5" text-anchor="middle" fill="' + LABEL + '">' + esc(e.label) + '</text>' : ''),
      }
    }
    case 'battery': {
      const x = n0(e.x); const y = n0(e.y); const len = n0(e.len ?? 40)
      const vertical = Boolean(e.vertical)
      const c = e.color ? String(e.color) : INK
      if (vertical) {
        return {
          svg:
            '<line x1="' + (x - 12) + '" y1="' + y + '" x2="' + (x + 12) + '" y2="' + y + '" stroke="' + c + '" stroke-width="3.4"/>' +
            '<line x1="' + (x - 6) + '" y1="' + (y + len) + '" x2="' + (x + 6) + '" y2="' + (y + len) + '" stroke="' + c + '" stroke-width="2.2"/>' +
            (e.label ? '<text x="' + (x + 18) + '" y="' + (y + len / 2 + 5) + '" font-size="13" fill="' + c + '">' + esc(e.label) + '</text>' : ''),
        }
      }
      return {
        svg:
          '<line x1="' + x + '" y1="' + (y - 12) + '" x2="' + x + '" y2="' + (y + 12) + '" stroke="' + c + '" stroke-width="3.4"/>' +
          '<line x1="' + (x + len) + '" y1="' + (y - 6) + '" x2="' + (x + len) + '" y2="' + (y + 6) + '" stroke="' + c + '" stroke-width="2.2"/>' +
          (e.label ? '<text x="' + n0(x + len / 2) + '" y="' + (y - 18) + '" font-size="13" text-anchor="middle" fill="' + c + '">' + esc(e.label) + '</text>' : ''),
      }
    }
    case 'coil': {
      const x = n0(e.x); const y = n0(e.y); const r = n0(e.r ?? 14); const turns = Math.max(1, Math.min(12, Number(e.turns ?? 4)))
      let d = 'M ' + x + ' ' + y
      for (let i = 0; i < turns; i += 1) d += ' a ' + r + ' ' + r + ' 0 0 1 0 ' + r * 2
      return { svg: '<path d="' + d + '" fill="none"' + common + '/>' }
    }
    case 'spring': {
      const x1 = n0(e.x1); const y1 = n0(e.y1); const x2 = n0(e.x2); const y2 = n0(e.y2)
      const coils = Math.max(2, Math.min(20, Number(e.coils ?? 8)))
      const amp = Number(e.amp ?? 8)
      const dx = (x2 - x1) / coils
      let d = 'M ' + x1 + ' ' + y1
      for (let i = 1; i <= coils; i += 1) {
        d += ' l ' + n0(dx / 2) + ' ' + (i % 2 ? -amp : amp) + ' l ' + n0(dx / 2) + ' ' + (i % 2 ? amp : -amp)
      }
      return { svg: '<path d="' + d + '" fill="none"' + common + '/>' }
    }
    case 'grana': {
      const x = n0(e.x); const y = n0(e.y); const stacks = Math.max(1, Number(e.stacks ?? 3))
      const per = Math.max(2, Number(e.per ?? 4)); const gap = n0(e.gap ?? 40); const bw = n0(e.bw ?? 26)
      const c = e.color ? String(e.color) : '#0f9c72'
      let out = ''
      for (let s = 0; s < stacks; s += 1) {
        for (let i = 0; i < per; i += 1) {
          out += '<rect x="' + n0(x + s * gap) + '" y="' + n0(y + i * 9) + '" width="' + bw + '" height="6" rx="3" fill="' + c + '" opacity="0.82"/>'
        }
      }
      return { svg: out }
    }
    case 'dimension': {
      const x1 = n0(e.x1); const y1 = n0(e.y1); const x2 = n0(e.x2); const y2 = n0(e.y2)
      const c = e.color ? String(e.color) : LABEL
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      return {
        svg:
          '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="1.4"/>' +
          '<line x1="' + x1 + '" y1="' + (y1 - 6) + '" x2="' + x1 + '" y2="' + (y1 + 6) + '" stroke="' + c + '" stroke-width="1.4"/>' +
          '<line x1="' + x2 + '" y1="' + (y2 - 6) + '" x2="' + x2 + '" y2="' + (y2 + 6) + '" stroke="' + c + '" stroke-width="1.4"/>' +
          (e.label ? '<text x="' + n0(midX) + '" y="' + n0(midY - 8) + '" font-size="12.5" text-anchor="middle" fill="' + c + '">' + esc(e.label) + '</text>' : ''),
      }
    }
    default:
      return { svg: '', warn: '第 ' + (i + 1) + ' 个图元类型不认识：' + (t || '(空)') }
  }
}

/** 自由场景 → SVG */
function drawScene(scene) {
  if (!scene || !Array.isArray(scene.elements) || !scene.elements.length) {
    return { error: 'scene.elements 不能为空（至少一个图元）' }
  }
  const width = clamp(Number(scene.width ?? 640), 200, 2000)
  const height = clamp(Number(scene.height ?? 400), 160, 2000)
  const parts = []
  const warns = []
  const counts = {}
  scene.elements.forEach((e, i) => {
    const r = element(e, i)
    if (r.warn) warns.push(r.warn)
    if (r.svg) parts.push(r.svg)
    const t = String((e && e.type) || '?')
    counts[t] = (counts[t] || 0) + 1
  })
  if (!parts.length) return { error: '没有一个图元画得出来：' + warns.join('；') }
  let head = ''
  if (scene.title) {
    head = '<text x="' + width / 2 + '" y="30" text-anchor="middle" font-size="17" font-weight="600" fill="' + INK + '">' + esc(scene.title) + '</text>'
  }
  const svg = frameAt(width, height, head + parts.join(''), scene.caption)
  return {
    svg,
    summary: Object.entries(counts).map(([k, v]) => k + '×' + v).join(' ') + (warns.length ? ' ｜ 警告：' + warns.join('；') : ''),
    warns,
  }
}

/** 给模型看的图元说明书 */
function diagramSpec() {
  return [
    'draw_diagram 的场景格式：{ width, height, title, caption, elements: [图元…] }（默认 640×400）',
    '可用图元如下（按需要挑几个摆就行，不必全用）：',
    '图元通用属性：stroke 颜色、fill 填充、sw 描边宽、dash 虚线、opacity、rx 圆角',
    'rect          { x, y, w, h, rx? }',
    'circle        { cx, cy, r }',
    'ellipse       { cx, cy, rx, ry }',
    'line          { x1, y1, x2, y2 }',
    'arrow         { x1, y1, x2, y2, label?, labelDx?, labelDy?, color? }  箭头，可带文字',
    'polygon       { points: [[x,y],…] }',
    'path          { d }  （SVG path 语法，弧线/曲线用）',
    'text          { x, y, text, size?, anchor?: start|middle|end, weight?, color? }',
    'field         { x, y, w, h, kind: into|out, step? }  匀强磁场网格（× 进去 / • 出来）',
    'resistor      { x, y, w?, h?, label? }  电阻方块',
    'battery       { x, y, len?, vertical?, label? }  电源（长正短负）',
    'coil          { x, y, r?, turns? }  线圈/螺线管',
    'spring        { x1, y1, x2, y2, coils?, amp? }  弹簧',
    'grana         { x, y, stacks?, per?, gap? }  叶绿体基粒（类囊体堆）',
    'dimension     { x1, y1, x2, y2, label? }  尺寸标注',
    '',
    '用法示例（导体棒切割磁感线）：',
    '{"width":640,"height":400,"caption":"导体棒切割磁感线",',
    ' "elements":[',
    '  {"type":"field","x":110,"y":150,"w":430,"h":160,"kind":"into"},',
    '  {"type":"line","x1":110,"y1":150,"x2":540,"y2":150,"sw":3},',
    '  {"type":"line","x1":110,"y1":310,"x2":540,"y2":310,"sw":3},',
    '  {"type":"line","x1":110,"y1":150,"x2":110,"y2":310,"dash":true},',
    '  {"type":"resistor","x":94,"y":212,"w":32,"h":36,"label":"R=0.8Ω"},',
    '  {"type":"line","x1":450,"y1":150,"x2":450,"y2":310,"stroke":"#b42318","sw":5},',
    '  {"type":"arrow","x1":462,"y1":184,"x2":540,"y2":184,"color":"#0b7d5b","label":"v=2 m/s"},',
    '  {"type":"arrow","x1":438,"y1":276,"x2":360,"y2":276,"color":"#8a5a00","label":"F安=BIL"},',
    '  {"type":"text","x":320,"y":352,"text":"ε = BLv = 0.4 V","size":17,"anchor":"middle","weight":600}',
    ' ]}',
    '',
    '写数值时：先把公式算出来再写进 text/label，不要在图上留占位符。',
  ].join('\n')
}

/** 预设实验（覆盖常见考点，省得每次从零摆图元） */
const EXPERIMENTS = {
  pendulum: { name: '单摆', params: 'L(m) / theta0(°) / g', render: pendulum },
  incline: { name: '斜面', params: 'theta(°) / mu / m(kg) / g', render: incline },
  circuit: { name: '串联电路', params: 'emf(V) / r1(Ω) / r2(Ω)', render: circuit },
  titration: { name: '酸碱滴定', params: 'acid(mol/L) / v0(mL) / base(mol/L)', render: titration },
  induction: { name: '导体棒切割磁感线', params: 'B(T) / L(m) / v(m/s) / R(Ω)', render: induction },
  photosynthesis: { name: '光合作用', params: "detail: 'both' | 'light' | 'dark'", render: photosynthesis },
  pedigree: {
    name: '家族谱系图',
    params: "pattern: 'AR' | 'AD' | 'XR' | 'mito'（示例），或 members: [{id,gen,sex,affected,carrier,parents}] + note",
    render: pedigree,
  },
}

const TOOLS = [
  {
    name: 'list_experiments',
    description: '列出可以演示的实验及其参数',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'render_experiment',
    description:
      '画一个**预设**的物理/化学/生物图（SVG）并给出按公式算出的关键数值。kind 取 pendulum（单摆）/ incline（斜面）/ circuit（串联电路）/ titration（酸碱滴定）/ induction（导体棒切割磁感线）/ photosynthesis（光合作用）/ pedigree（家族谱系图）。要画预设之外的图，用 draw_diagram。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'pendulum | incline | circuit | titration | induction | photosynthesis | pedigree',
        },
        params: { type: 'object', description: '该实验的参数对象，见 list_experiments' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'diagram_spec',
    description:
      '返回 draw_diagram 的场景格式说明：有哪些图元、各自要什么字段、以及一个完整示例。不确定怎么摆图时先调它。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'draw_diagram',
    description:
      '用通用图元自由画任意示意图（SVG）：导轨、电路、受力图、光路、细胞器、谱系、流程图都能摆。scene 是 { width, height, title, caption, elements }，图元类型见 diagram_spec。',
    inputSchema: {
      type: 'object',
      properties: {
        scene: {
          type: 'object',
          description: '场景对象：{ width, height, title?, caption?, elements: [...] }',
        },
      },
      required: ['scene'],
    },
  },
  {
    name: 'circuit_spec',
    description: '返回 draw_circuit 的网表格式与硬规则（电压表并联、电流表串联等）。不确定怎么写时先调它。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'experiment_catalog',
    description: '列出当前**真的能画**的所有实验与图像（数学/物理/化学/生物），每行带对应工具与参数。不确定用什么工具时先读它。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'science_spec',
    description: '返回光学/化学装置/细胞分裂三个引擎的参数格式与校验规则。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'draw_optics',
    description: '凸透镜成像光路图：按 1/v=1/f−1/u 算像距与放大率，画出平行主轴光线与过光心光线。kind 目前只有 lens。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'lens' },
        u: { type: 'number', description: '物距 cm' },
        f: { type: 'number', description: '焦距 cm' },
        h: { type: 'number', description: '物高 cm' },
        title: { type: 'string' },
      },
      required: ['u', 'f'],
    },
  },
  {
    name: 'draw_apparatus',
    description: '化学实验装置图。kind: o2-heat（加热固体制氧气，排水法）/ o2-h2o2（过氧化氢+二氧化锰）。parts 可传器材清单，缺件会被判错。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'o2-heat | o2-h2o2' },
        parts: { type: 'array', items: { type: 'string' }, description: '器材清单（不传按标准装置画）' },
        title: { type: 'string' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'draw_mitosis',
    description: '植物细胞有丝分裂过程图。stages 依次为 interphase/prophase/metaphase/anaphase/telophase；顺序错会判错。',
    inputSchema: {
      type: 'object',
      properties: {
        stages: { type: 'array', items: { type: 'string' } },
        title: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'draw_forces',
    description: '斜面上的受力分析：给 m / theta / mu（可选 F 沿斜面拉力），算 G、N、f、加速度并画四个力的箭头，能判断静止还是滑动。',
    inputSchema: {
      type: 'object',
      properties: {
        m: { type: 'number' },
        theta: { type: 'number', description: '倾角（度）' },
        mu: { type: 'number', description: '动摩擦系数' },
        F: { type: 'number', description: '沿斜面的拉力（可省略）' },
        title: { type: 'string' },
      },
      required: ['m', 'theta', 'mu'],
    },
  },
  {
    name: 'draw_em',
    description: '电磁学模型。kind: charge-circular（带电粒子垂直进匀强磁场，r=mv/qB、T=2πm/qB）/ double-slit（双缝干涉，Δy=Lλ/d）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        m: { type: 'number' },
        q: { type: 'number' },
        v: { type: 'number' },
        B: { type: 'number' },
        lambda: { type: 'number', description: '波长 nm（双缝）' },
        d: { type: 'number', description: '缝距 mm（双缝）' },
        L: { type: 'number', description: '屏距 m（双缝）' },
        title: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'draw_circuit',
    description:
      '画**规范的实验电路图**并做结构校验（电压表并联、电流表串联、回路闭合、元件齐全）。' +
      'net = { title, series: [{id,type,label}], parallel: [{across,id,type,label}] }；type 见 circuit_spec。',
    inputSchema: {
      type: 'object',
      properties: {
        net: { type: 'object', description: '{ title?, series: [...], parallel?: [...] }' },
      },
      required: ['net'],
    },
  },
]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function fail(id, message, code = -32601) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

function callTool(name, args) {
  if (name === 'list_experiments') {
    const lines = Object.entries(EXPERIMENTS).map(([k, v]) => k + '（' + v.name + '）：' + v.params)
    return { text: lines.join('\n') }
  }
  if (name === 'render_experiment') {
    const kind = String(args.kind ?? '').trim()
    const spec = EXPERIMENTS[kind]
    if (!spec) return { error: '没有这个实验：' + kind + '（可选：' + Object.keys(EXPERIMENTS).join(' / ') + '；自定义图用 draw_diagram）' }
    const params = args.params && typeof args.params === 'object' ? args.params : {}
    const out = spec.render(params)
    return { text: out.svg, summary: out.summary, kind, name: spec.name }
  }
  if (name === 'diagram_spec') {
    return { text: diagramSpec() }
  }
  if (name === 'draw_diagram') {
    const scene = args.scene && typeof args.scene === 'object' ? args.scene : args
    const out = drawScene(scene)
    if (out.error) return { error: out.error }
    return { text: out.svg, summary: out.summary }
  }
  if (name === 'circuit_spec') {
    return { text: circuitSpec() }
  }
  if (name === 'science_spec') {
    return { text: scienceSpec() }
  }
  if (name === 'experiment_catalog') {
    return { text: experimentCatalog() }
  }
  if (name === 'draw_forces' || name === 'draw_em') {
    const payload = args && typeof args === 'object' ? args : {}
    const out = name === 'draw_forces' ? renderForces(payload) : renderEM(payload)
    if (!out.svg) return { error: '画不出来：' + (out.issues || []).join('；') }
    return {
      text: out.svg,
      extra: 'VALIDATION:' + JSON.stringify({ ok: out.ok, issues: out.issues || [], summary: out.summary || '' }),
      ok: out.ok,
    }
  }
  if (name === 'draw_optics' || name === 'draw_apparatus' || name === 'draw_mitosis') {
    const payload = args && typeof args === 'object' ? args : {}
    const out =
      name === 'draw_optics'
        ? String(payload.kind ?? 'lens') === 'mirror'
          ? renderPlaneMirror(payload)
          : String(payload.kind ?? 'lens') === 'refraction'
            ? renderRefraction(payload)
            : renderLens(payload)
        : name === 'draw_apparatus'
          ? renderApparatus(payload)
          : renderMitosis(payload)
    if (!out.svg) return { error: '画不出来：' + (out.issues || []).join('；') }
    return {
      text: out.svg,
      extra: 'VALIDATION:' + JSON.stringify({ ok: out.ok, issues: out.issues || [], summary: out.summary || '' }),
      ok: out.ok,
    }
  }
  if (name === 'draw_circuit') {
    const net = args.net && typeof args.net === 'object' ? args.net : args
    const out = renderCircuit(net)
    if (!out.svg) return { error: '画不出来：' + (out.issues || []).join('；') }
    return {
      text: out.svg,
      // 第二条 content 把校验结果带回去（客户端会把多条 text 用换行拼起来）
      extra: 'VALIDATION:' + JSON.stringify({ ok: out.ok, issues: out.issues || [] }),
      summary: out.ok ? '校验通过' : '未通过校验：' + (out.issues || []).slice(0, 2).join('；'),
      issues: out.issues,
      ok: out.ok,
    }
  }
  return { error: '没有这个工具：' + name }
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
      serverInfo: { name: 'mcp-lab', version: '0.1.0' },
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
    const res = callTool(name, args)
    if (res.error) {
      fail(id, res.error)
      return
    }
    const content = [{ type: 'text', text: res.text }]
    if (res.extra) content.push({ type: 'text', text: res.extra })
    reply(id, { content })
    return
  }
  fail(id, '不认识的方法：' + String(method))
}
