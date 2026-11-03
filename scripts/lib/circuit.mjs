/**
 * 电路图引擎：从"声明式网表"画出规范电路图，并**校验连接是否讲得通**。
 *
 * 为什么不用自由摆图元：实验电路有硬性规则（电压表并联、电流表串联、
 * 回路必须闭合、每个元件两端都要接上）。让模型自己摆坐标，它大概率会
 * 摆出"电压表串在干路里"这种看着像、其实错的图 —— 比不画更害人。
 *
 * 所以这一层分成两半：
 *   1. 布局与符号：输入是 `series`（干路顺序）+ `parallel`（并联支路），
 *      坐标由引擎自己算，导线正交、节点画实心点、元件符号用标准画法。
 *   2. 校验：结构性问题（串联里放电压表、没电源、未知元件、并联对象不在
 *      干路里、元件重复）一律**报错并列出原因**，同时把问题印在图上，
 *      绝不把错误结构伪装成正确答案。
 *
 * 输入示例（伏安法测电阻）：
 * {
 *   "title": "伏安法测电阻",
 *   "series": [
 *     {"id":"E","type":"battery","label":"电源 6V"},
 *     {"id":"S","type":"switch","label":"S"},
 *     {"id":"A","type":"ammeter","label":"A"},
 *     {"id":"R","type":"rheostat","label":"滑动变阻器"},
 *     {"id":"Rx","type":"resistor","label":"Rₓ"}
 *   ],
 *   "parallel": [{"across":"Rx","id":"V","type":"voltmeter","label":"V"}]
 * }
 */

const W = 720
const H = 480

const INK = '#10151c'
const WIRE = '#2b3948'
const ACCENT = '#0a7ae6'
const WARN = '#b42318'
const LABEL = 'rgba(58,70,86,0.78)'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const f = (n) => Math.round(Number(n) * 10) / 10

/** 元件终端（相对元件中心的两个连接点）+ 绘制半宽 */
const SPEC = {
  battery: { kind: 'dc', half: 26 },
  resistor: { kind: 'box', half: 34 },
  lamp: { kind: 'round', half: 16 },
  switch: { kind: 'switch', half: 28 },
  ammeter: { kind: 'round', half: 18 },
  voltmeter: { kind: 'round', half: 18 },
  rheostat: { kind: 'box', half: 38 },
}

const CN = {
  battery: '电源',
  resistor: '电阻',
  lamp: '小灯泡',
  switch: '开关',
  ammeter: '电流表',
  voltmeter: '电压表',
  rheostat: '滑动变阻器',
}

const isMeter = (t) => t === 'ammeter' || t === 'voltmeter'

/**
 * 校验：返回 { ok, issues: [] }
 * 每条 issue 都写成"人能看懂、模型能据此改"的中文。
 */
export function validateCircuit(net) {
  const issues = []
  const series = Array.isArray(net?.series) ? net.series : []
  const parallel = Array.isArray(net?.parallel) ? net.parallel : []

  if (!series.length) issues.push('干路里一个元件都没有')
  const ids = new Set()
  const seen = []
  for (const [i, c] of series.entries()) {
    const id = String(c?.id ?? '')
    const type = String(c?.type ?? '')
    if (!id) issues.push('第 ' + (i + 1) + ' 个元件缺少 id')
    else if (ids.has(id)) issues.push('元件 id 重复：' + id)
    ids.add(id)
    seen.push(id)
    if (!SPEC[type]) issues.push('不认识的元件类型：' + (type || '(空)') + '（可用：' + Object.keys(SPEC).join(' / ') + '）')
    if (type === 'voltmeter') issues.push('电压表「' + (c.label || id) + '」不能串在干路里 —— 电压表必须并联在被测元件两端')
  }
  if (!series.some((c) => String(c?.type) === 'battery')) issues.push('干路里没有电源，回路不可能有电流')

  for (const [j, p] of parallel.entries()) {
    const across = String(p?.across ?? '')
    const id = String(p?.id ?? '')
    const type = String(p?.type ?? '')
    if (!across) issues.push('第 ' + (j + 1) + ' 条并联支路没写 across（要并在哪个元件两端）')
    else if (!seen.includes(across)) issues.push('并联支路「' + (p.label || id || type) + '」要并在「' + across + '」两端，但干路里没有这个元件')
    if (!id) issues.push('第 ' + (j + 1) + ' 条并联支路缺少 id')
    else if (ids.has(id)) issues.push('元件 id 重复：' + id)
    ids.add(id)
    if (!SPEC[type]) issues.push('并联支路里有不认识的元件类型：' + (type || '(空)'))
    if (type === 'ammeter') issues.push('电流表「' + (p.label || id) + '」不能并联 —— 电流表必须串联在干路里')
    if (type === 'battery') issues.push('电源不能当并联支路')
  }

  // 只有一个元件的回路 + 没有并联 → 只是"电源短路"或"没接负载"，提示但不拦
  const load = series.filter((c) => ['resistor', 'lamp', 'rheostat'].includes(String(c?.type)))
  if (!load.length && !parallel.length) issues.push('回路里没有任何负载（电阻/灯泡/滑动变阻器）')

  return { ok: issues.length === 0, issues }
}

/* ---------------- 符号绘制 ---------------- */

/** 元件符号；cx,cy 是中心，(ang) 0=水平 / 90=竖直 */
function symbol(c, cx, cy, vertical) {
  const type = String(c.type)
  const spec = SPEC[type] || { kind: 'box', half: 30 }
  const half = spec.half
  const label = String(c.label ?? '')
  const out = []
  const rot = vertical ? ' transform="rotate(90 ' + f(cx) + ' ' + f(cy) + ')"' : ''

  if (type === 'battery') {
    // 长线正极、短线负极，两节更清楚
    const x1 = cx - 18
    const x2 = cx + 18
    out.push('<g' + rot + '>')
    out.push('<line x1="' + f(x1) + '" y1="' + f(cy - 16) + '" x2="' + f(x1) + '" y2="' + f(cy + 16) + '" stroke="' + INK + '" stroke-width="2.6"/>')
    out.push('<line x1="' + f(x1 + 12) + '" y1="' + f(cy - 9) + '" x2="' + f(x1 + 12) + '" y2="' + f(cy + 9) + '" stroke="' + INK + '" stroke-width="2"/>')
    out.push('<line x1="' + f(x2 - 12) + '" y1="' + f(cy - 16) + '" x2="' + f(x2 - 12) + '" y2="' + f(cy + 16) + '" stroke="' + INK + '" stroke-width="2.6"/>')
    out.push('<line x1="' + f(x2) + '" y1="' + f(cy - 9) + '" x2="' + f(x2) + '" y2="' + f(cy + 9) + '" stroke="' + INK + '" stroke-width="2"/>')
    out.push('<text x="' + f(cx) + '" y="' + f(cy - 24) + '" font-size="11" text-anchor="middle" fill="' + LABEL + '">+</text>')
    out.push('</g>')
  } else if (type === 'resistor' || type === 'rheostat') {
    const w = half * 2
    const h = 26
    out.push('<g' + rot + '>')
    out.push('<rect x="' + f(cx - half) + '" y="' + f(cy - h / 2) + '" width="' + w + '" height="' + h + '" rx="3" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    if (type === 'rheostat') {
      // 可变：斜箭头压在方框上
      out.push('<line x1="' + f(cx - half - 4) + '" y1="' + f(cy + 16) + '" x2="' + f(cx + half + 4) + '" y2="' + f(cy - 16) + '" stroke="' + ACCENT + '" stroke-width="2.2" marker-end="url(#arrow)"/>')
    }
    out.push('</g>')
  } else if (type === 'lamp') {
    out.push('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + half + '" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    out.push('<path d="M ' + f(cx - half * 0.7) + ' ' + f(cy - half * 0.7) + ' L ' + f(cx + half * 0.7) + ' ' + f(cy + half * 0.7) + ' M ' + f(cx + half * 0.7) + ' ' + f(cy - half * 0.7) + ' L ' + f(cx - half * 0.7) + ' ' + f(cy + half * 0.7) + '" stroke="' + INK + '" stroke-width="1.8"/>')
  } else if (type === 'switch') {
    // 两端接线柱 + 断开的刀
    out.push('<g' + rot + '>')
    out.push('<circle cx="' + f(cx - half) + '" cy="' + f(cy) + '" r="3.2" fill="' + INK + '"/>')
    out.push('<circle cx="' + f(cx + half) + '" cy="' + f(cy) + '" r="3.2" fill="' + INK + '"/>')
    out.push('<line x1="' + f(cx - half) + '" y1="' + f(cy) + '" x2="' + f(cx + half - 6) + '" y2="' + f(cy - 22) + '" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"/>')
    out.push('</g>')
  } else if (isMeter(type)) {
    const letter = type === 'ammeter' ? 'A' : 'V'
    out.push('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + half + '" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    out.push('<text x="' + f(cx) + '" y="' + f(cy + 6) + '" font-size="16" font-weight="700" text-anchor="middle" fill="' + INK + '">' + letter + '</text>')
  }

  // 标注：元件下方（竖直元件标在右侧）
  if (label) {
    if (vertical) {
      out.push('<text x="' + f(cx + half + 8) + '" y="' + f(cy + 4) + '" font-size="12.5" fill="' + LABEL + '">' + esc(label) + '</text>')
    } else {
      out.push('<text x="' + f(cx) + '" y="' + f(cy + half + 18) + '" font-size="12.5" text-anchor="middle" fill="' + LABEL + '">' + esc(label) + '</text>')
    }
  }
  return out.join('')
}

/* ---------------- 布局 + 渲染 ---------------- */

export function renderCircuit(net) {
  const check = validateCircuit(net)
  const title = String(net?.title ?? '实验电路图')
  const series = (Array.isArray(net?.series) ? net.series : []).filter((c) => SPEC[String(c?.type)])
  const parallel = (Array.isArray(net?.parallel) ? net.parallel : []).filter((c) => SPEC[String(c?.type)])

  if (!series.length) {
    return { ok: false, issues: check.issues.length ? check.issues : ['没有可画的元件'], svg: null }
  }

  // 回路矩形
  const left = 96
  const right = W - 96
  const top = 128
  const bottom = H - 128

  // 干路元件分两排：下半排从左往右，上半排从右往左（闭合回路顺序一致）
  const n = series.length
  const bottomCount = Math.ceil(n / 2)
  const bottomItems = series.slice(0, bottomCount)
  const topItems = series.slice(bottomCount).reverse() // 反向：路径沿上边缘从右往左

  const posOf = new Map()
  const place = (items, y, fromLeft) => {
    const span = right - left
    const step = span / (items.length + 1)
    items.forEach((c, i) => {
      const idx = fromLeft ? i + 1 : items.length - i
      const x = left + step * idx
      posOf.set(String(c.id), { x, y, c, vertical: false })
    })
  }
  place(bottomItems, bottom, true)
  place(topItems, top, false)

  const wires = []
  const dots = []
  const addDot = (x, y) => dots.push('<circle cx="' + f(x) + '" cy="' + f(y) + '" r="3.6" fill="' + WIRE + '"/>')
  const W_ = (x1, y1, x2, y2) =>
    wires.push('<polyline points="' + f(x1) + ',' + f(y1) + ' ' + f(x2) + ',' + f(y2) + '" fill="none" stroke="' + WIRE + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>')

  // 沿回路依次连线：底排(左→右) → 右竖边 → 上排(右→左) → 左竖边
  const order = [...bottomItems, ...topItems]
  for (let i = 0; i < order.length; i += 1) {
    const cur = posOf.get(String(order[i].id))
    const next = posOf.get(String(order[(i + 1) % order.length].id))
    if (!cur || !next) continue
    if (cur.y === next.y) {
      // 同一排：直线
      W_(cur.x, cur.y, next.x, next.y)
    } else {
      // 跨排：走边上的竖线（先横到拐角再竖）
      const onBottom = cur.y === bottom
      const cornerX = onBottom ? right : left
      W_(cur.x, cur.y, cornerX, cur.y)
      W_(cornerX, cur.y, cornerX, next.y)
      W_(cornerX, next.y, next.x, next.y)
    }
  }

  const art = []
  for (const p of posOf.values()) art.push(symbol(p.c, p.x, p.y, p.vertical))

  // 并联支路：在被并元件上方画一个"桥"，两端往下接到元件两侧的导线
  for (const [k, p] of parallel.entries()) {
    const anchor = posOf.get(String(p.across))
    if (!anchor) continue
    const half = (SPEC[String(anchor.c.type)] || { half: 30 }).half
    const bx = anchor.x
    const by = anchor.y - 72 - k * 46
    const tapL = anchor.x - half - 26
    const tapR = anchor.x + half + 26
    W_(tapL, anchor.y, tapL, by)
    W_(tapR, anchor.y, tapR, by)
    W_(tapL, by, bx - 34, by)
    W_(bx + 34, by, tapR, by)
    art.push(symbol(p, bx, by, false))
    addDot(tapL, anchor.y)
    addDot(tapR, anchor.y)
  }

  // 元件之间的导线两端补节点（三个及以上连接处才需要，这里对并联抽头处理）
  const head = title ? '<text x="' + W / 2 + '" y="32" text-anchor="middle" font-size="18" font-weight="700" fill="' + INK + '">' + esc(title) + '</text>' : ''

  const warnBand = check.ok
    ? ''
    : '<g>' +
      '<rect x="24" y="' + (H - 74) + '" width="' + (W - 48) + '" height="54" rx="10" fill="rgba(180,35,24,0.08)" stroke="' + WARN + '" stroke-width="1.4"/>' +
      '<text x="40" y="' + (H - 52) + '" font-size="13" font-weight="700" fill="' + WARN + '">⚠ 这张图没通过结构校验，不能当作正确答案：</text>' +
      check.issues.slice(0, 3).map((t, i) => '<text x="40" y="' + (H - 34 + i * 15) + '" font-size="12" fill="' + WARN + '">· ' + esc(t) + '</text>').join('') +
      '</g>'

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + ACCENT + '"/></marker></defs>' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.94)"/>' +
    head +
    wires.join('') +
    dots.join('') +
    art.join('') +
    warnBand +
    '</svg>'

  return { ok: check.ok, issues: check.issues, svg }
}

/** 给模型看的说明书 */
export function circuitSpec() {
  return [
    'draw_circuit 的格式（声明式，坐标由引擎算，不要自己给坐标）：',
    '{',
    '  "title": "伏安法测电阻",',
    '  "series": [ {"id":"E","type":"battery","label":"电源 6V"}, ... ],   // 干路顺序，必须包含 battery',
    '  "parallel": [ {"across":"Rx","id":"V","type":"voltmeter","label":"V"} ]',
    '}',
    '元件 type 只能是：battery 电源 / resistor 电阻 / lamp 小灯泡 / switch 开关 / ammeter 电流表 / voltmeter 电压表 / rheostat 滑动变阻器。',
    '硬规则（引擎会校验，违反会印在图上并回报）：',
    ' · 电压表必须放在 parallel 里并在某个元件两端；串进 series 会被判错',
    ' · 电流表必须放在 series 里；放进 parallel 会被判错',
    ' · series 必须有电源；回路要有负载',
    ' · 并联支路的 across 必须是 series 里存在的元件 id',
    '伏安法测电阻的正确写法：series=[E, S, A, R(滑动变阻器), Rx(待测电阻)]，parallel=[{across:"Rx", type:"voltmeter"}]',
  ].join('\n')
}
