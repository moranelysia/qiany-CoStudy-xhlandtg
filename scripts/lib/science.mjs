/**
 * 科学示意图引擎（第二批）：光路 / 化学装置 / 细胞分裂。
 *
 * 和电路引擎同一个思路：
 *   ① 输入是**参数**，不是坐标 —— 坐标、比例、标注位置都由引擎算；
 *   ② 数值真算（成像公式、放大率、染色体数），不是摆一张"看起来像"的图；
 *   ③ 结构能校验（透镜参数是否成立、制氧装置缺不缺器材、分裂阶段对不对），
 *      校验不过就把问题写进返回值，让上层决定"标红 + 让模型改"。
 */
const W = 720
const H = 420
const INK = '#10151c'
const LABEL = 'rgba(58,70,86,0.8)'
const ACCENT = '#0a7ae6'
const RED = '#b42318'
const GREEN = '#0b7d5b'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const f1 = (n) => Math.round(Number(n) * 10) / 10
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
/** 标题压成一行、限长 —— 模型有时把参数也塞进 title，换行会让它和别的字叠在一起 */
function shortTitle(s) {
  const one = String(s ?? '').replace(/\\s+/g, ' ').trim()
  return one.length > 22 ? one.slice(0, 22) + '…' : one
}
/** 按字符数折行（中文没有空格，只能数个数） */
function wrapCn(s, per) {
  const out = []
  const str = String(s ?? '')
  for (let i = 0; i < str.length; i += per) out.push(str.slice(i, i + per))
  return out
}
const num = (n, d = 2) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const p = 10 ** d
  return String(Math.round(v * p) / p)
}
const text = (x, y, s, o = {}) =>
  '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + (o.size ?? 13) + '" fill="' + (o.fill ?? INK) +
  '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') +
  '>' + esc(s) + '</text>'

function frame(title, inner, caption, height = H) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + height + '" width="' + W + '" height="' + height + '">' +
    '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + INK + '"/></marker>' +
    '<marker id="ar-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + ACCENT + '"/></marker></defs>' +
    '<rect width="100%" height="100%" fill="rgba(255,255,255,0.94)"/>' +
    (title ? '<text x="' + W / 2 + '" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="' + INK + '">' + esc(shortTitle(title)) + '</text>' : '') +
    inner +
    (caption ? '<text x="' + W / 2 + '" y="' + (height - 12) + '" text-anchor="middle" font-size="12.5" fill="' + LABEL + '">' + esc(caption) + '</text>' : '') +
    '</svg>'
  )
}

/* =========================================================
 * 一、凸透镜成像光路
 * =======================================================*/

/**
 * 薄透镜成像：1/v − 1/u = 1/f（这里 u 取正值表示物距，v>0 为实像在透镜另一侧）
 * 用高斯公式：1/v = 1/f − 1/u —— u>f 时 v>0（实像，倒立）；u<f 时 v<0（虚像，正立）
 */
export function renderLens(p) {
  const issues = []
  const f = Number(p.f ?? 10)
  const u = Number(p.u ?? 30)
  const h = Number(p.h ?? 4)
  if (!Number.isFinite(f) || f <= 0) issues.push('焦距 f 必须是正数（凸透镜）')
  if (!Number.isFinite(u) || u <= 0) issues.push('物距 u 必须大于 0')
  if (!Number.isFinite(h) || h <= 0) issues.push('物的高度 h 必须大于 0')
  if (issues.length) return { ok: false, issues, svg: null, summary: '' }

  const isFocus = Math.abs(u - f) < 1e-9
  const v = isFocus ? Infinity : 1 / (1 / f - 1 / u)
  const real = Number.isFinite(v) && v > 0
  const m = Number.isFinite(v) ? -v / u : Infinity // 放大率（负号=倒立）
  const imgH = Number.isFinite(m) ? h * Math.abs(m) : Infinity

  // 比例：让"最远的那个点"落在画布内
  const span = Math.max(u, Math.abs(v) || u, 2.4 * f)
  const scale = clamp(300 / span, 2, 26)
  const axisY = 200
  const lensX = W / 2
  const lensHalf = 92

  const px = (dist, dir) => lensX + dir * dist * scale
  const objX = px(u, -1)
  const objTipY = axisY - h * scale
  const imgX = Number.isFinite(v) ? px(Math.abs(v), real ? 1 : -1) : lensX
  const imgTipY = Number.isFinite(m) ? axisY + (real ? imgH * scale : -imgH * scale) : axisY

  const art = []
  // 主光轴 + 透镜
  art.push('<line x1="30" y1="' + axisY + '" x2="' + (W - 30) + '" y2="' + axisY + '" stroke="rgba(120,148,178,.75)" stroke-width="1.4" stroke-dasharray="6 5"/>')
  art.push('<line x1="' + lensX + '" y1="' + (axisY - lensHalf) + '" x2="' + lensX + '" y2="' + (axisY + lensHalf) + '" stroke="' + INK + '" stroke-width="2.6"/>')
  art.push('<path d="M ' + (lensX - 7) + ' ' + (axisY - lensHalf + 10) + ' L ' + lensX + ' ' + (axisY - lensHalf) + ' L ' + (lensX + 7) + ' ' + (axisY - lensHalf + 10) + '" fill="none" stroke="' + INK + '" stroke-width="2"/>')
  art.push('<path d="M ' + (lensX - 7) + ' ' + (axisY + lensHalf - 10) + ' L ' + lensX + ' ' + (axisY + lensHalf) + ' L ' + (lensX + 7) + ' ' + (axisY + lensHalf - 10) + '" fill="none" stroke="' + INK + '" stroke-width="2"/>')
  art.push(text(lensX, axisY - lensHalf - 10, '凸透镜', { anchor: 'middle', size: 12, fill: LABEL }))

  // 焦点与二倍焦距
  for (const [k, name] of [[1, 'F'], [2, '2F']]) {
    for (const dir of [-1, 1]) {
      const x = px(k * f, dir)
      if (x < 24 || x > W - 24) continue
      art.push('<line x1="' + f1(x) + '" y1="' + (axisY - 5) + '" x2="' + f1(x) + '" y2="' + (axisY + 5) + '" stroke="' + INK + '" stroke-width="1.6"/>')
      art.push(text(x, axisY + 20, (dir < 0 ? '' : '') + name, { anchor: 'middle', size: 11.5, fill: LABEL }))
    }
  }

  // 物（箭头）
  art.push('<line x1="' + f1(objX) + '" y1="' + axisY + '" x2="' + f1(objX) + '" y2="' + f1(objTipY) + '" stroke="' + ACCENT + '" stroke-width="2.6" marker-end="url(#ar-blue)"/>')
  art.push(text(objX, objTipY - 8, '物 h=' + num(h) + 'cm', { anchor: 'middle', size: 12, fill: ACCENT }))

  // 光线：①平行主轴→过焦点  ②过光心不改变方向
  const lensHitY = objTipY
  art.push('<line x1="' + f1(objX) + '" y1="' + f1(objTipY) + '" x2="' + lensX + '" y2="' + f1(lensHitY) + '" stroke="' + RED + '" stroke-width="1.8"/>')
  // 折射后过另一侧焦点
  const farF = px(f, 1)
  const k1 = (farF - lensX) === 0 ? 0 : (axisY - lensHitY) / (farF - lensX)
  const exitX = Math.min(W - 36, real && Number.isFinite(imgX) ? Math.max(imgX + 40, farF + 20) : W - 40)
  art.push('<line x1="' + lensX + '" y1="' + f1(lensHitY) + '" x2="' + f1(exitX) + '" y2="' + f1(lensHitY + k1 * (exitX - lensX)) + '" stroke="' + RED + '" stroke-width="1.8" marker-end="url(#ar)"/>')

  // ② 过光心的光线：方向不改变，一直延伸到画布右侧
  const rayEndX = W - 40
  const k2 = (objTipY - axisY) / (objX - lensX)
  art.push(
    '<line x1="' + f1(objX) + '" y1="' + f1(objTipY) + '" x2="' + f1(rayEndX) + '" y2="' +
      f1(objTipY + k2 * (rayEndX - objX)) + '" stroke="' + RED + '" stroke-width="1.8" opacity="0.8"/>',
  )

  // 像
  if (Number.isFinite(v)) {
    const dash = real ? '' : ' stroke-dasharray="7 6"'
    art.push('<line x1="' + f1(imgX) + '" y1="' + axisY + '" x2="' + f1(imgX) + '" y2="' + f1(imgTipY) + '" stroke="' + (real ? GREEN : RED) + '" stroke-width="2.6"' + dash + ' marker-end="url(#ar)"/>')
    art.push(
      text(imgX, imgTipY + (real ? 20 : -12), (real ? '实像' : '虚像') + " h'=" + num(imgH) + 'cm', {
        anchor: 'middle',
        size: 12,
        fill: real ? GREEN : RED,
      }),
    )
  }

  const nature = isFocus
    ? '物在焦点上，折射光平行射出，**不成像**'
    : real
      ? '倒立、' + (Math.abs(m) > 1.01 ? '放大' : Math.abs(m) < 0.99 ? '缩小' : '等大') + '的实像（v=' + num(v) + 'cm，放大率 ' + num(Math.abs(m)) + '）'
      : '正立、放大的虚像（v=' + num(v) + 'cm，放大率 ' + num(Math.abs(m)) + '）'

  const caption = isFocus
    ? 'u = f：不成像'
    : 'u=' + num(u) + 'cm  f=' + num(f) + 'cm  →  ' + nature

  const svg = frame(String(p.title ?? '凸透镜成像光路图'), art.join(''), caption)
  return {
    ok: true,
    issues,
    svg,
    summary: nature,
    data: { u, f, v: Number.isFinite(v) ? Number(num(v, 3)) : null, m: Number.isFinite(m) ? Number(num(Math.abs(m), 3)) : null, real },
  }
}

/* =========================================================
 * 二、化学实验室制取氧气装置
 * =======================================================*/

const APPARATUS_RULES = {
  'o2-heat': {
    name: '加热高锰酸钾/氯酸钾制氧气（固固加热 + 排水法收集）',
    need: ['stand', 'burner', 'testTube', 'plug', 'delivery', 'trough', 'jar'],
    text: {
      stand: '铁架台',
      burner: '酒精灯',
      testTube: '大试管（固体药品）',
      plug: '单孔橡皮塞',
      delivery: '导管',
      trough: '水槽',
      jar: '集气瓶（倒置）',
    },
  },
  'o2-h2o2': {
    name: '过氧化氢溶液制氧气（固液常温）',
    need: ['stand', 'flask', 'funnel', 'delivery', 'trough', 'jar'],
    text: {
      stand: '铁架台',
      flask: '锥形瓶（MnO₂）',
      funnel: '分液漏斗（H₂O₂）',
      delivery: '导管',
      trough: '水槽',
      jar: '集气瓶（倒置）',
    },
  },
  esterification: {
    name: '乙酸乙酯的制备（酯化反应 + 饱和碳酸钠溶液吸收）',
    need: ['stand', 'flask', 'burner', 'delivery', 'beaker'],
    text: {
      stand: '铁架台',
      flask: '圆底烧瓶（乙醇＋乙酸＋浓硫酸）',
      burner: '酒精灯',
      delivery: '导管（不伸入液面）',
      beaker: '小烧杯（饱和 Na₂CO₃ 溶液）',
    },
  },
  'air-up': {
    name: '向上排空气法收集（气体密度比空气大，如 CO₂、O₂）',
    need: ['stand', 'flask', 'funnel', 'delivery', 'jarUpright'],
    text: {
      stand: '铁架台',
      flask: '锥形瓶（反应物）',
      funnel: '分液漏斗',
      delivery: '导管（伸到瓶底）',
      jarUpright: '集气瓶（正放）',
    },
  },
  'gas-wash': {
    name: '洗气 / 气体吸收（如浓 NaOH 吸收 CO₂、尾气处理）',
    need: ['washBottle', 'longTube', 'shortTube', 'inTube'],
    text: {
      washBottle: '洗气瓶（装吸收液）',
      longTube: '长导管（伸入液面，进气）',
      shortTube: '短导管（液面上方，出气）',
      inTube: '待处理气体入口',
    },
  },
  precipitation: {
    name: '沉淀反应（如向 CuSO₄ 溶液滴加 NaOH，生成蓝色沉淀）',
    need: ['testTube', 'dropper', 'beaker'],
    text: {
      testTube: '试管（CuSO₄ 溶液）',
      dropper: '胶头滴管（NaOH 溶液）',
      beaker: '盛废液的烧杯',
    },
  },
  'co2-prep': {
    name: '实验室制取二氧化碳（稀盐酸 + 石灰石，向上排空气法）',
    need: ['stand', 'flask', 'funnel', 'delivery', 'jarUpright'],
    text: {
      stand: '铁架台',
      flask: '锥形瓶（石灰石 CaCO₃）',
      funnel: '长颈漏斗（稀盐酸）',
      delivery: '导管（伸到瓶底）',
      jarUpright: '集气瓶（正放，向上排空气法）',
    },
  },
  'h2-prep': {
    name: '实验室制取氢气（锌粒 + 稀硫酸，向下排空气法）',
    need: ['stand', 'flask', 'funnel', 'delivery', 'jarInverted'],
    text: {
      stand: '铁架台',
      flask: '锥形瓶（锌粒 Zn）',
      funnel: '长颈漏斗（稀硫酸）',
      delivery: '导管（伸到瓶底）',
      jarInverted: '集气瓶（倒放，向下排空气法）',
    },
  },
  filtration: {
    name: '过滤（分离不溶性固体与液体）',
    need: ['stand', 'funnelFilter', 'beaker', 'glassRod'],
    text: {
      stand: '铁架台（带铁圈）',
      funnelFilter: '漏斗 + 滤纸（一贴二低三靠）',
      beaker: '烧杯（待过滤液体）',
      glassRod: '玻璃棒（引流）',
    },
  },
  distillation: {
    name: '蒸馏（分离沸点不同的互溶液体）',
    need: ['stand', 'flask', 'burner', 'thermometer', 'condenser', 'beaker'],
    text: {
      stand: '铁架台',
      flask: '蒸馏烧瓶（混合液）',
      burner: '酒精灯',
      thermometer: '温度计（水银球在支管口）',
      condenser: '冷凝管（下进上出）',
      beaker: '锥形瓶（馏出液）',
    },
  },
  'air-down': {
    name: '向下排空气法收集（气体密度比空气小，如 H₂、NH₃）',
    need: ['stand', 'flask', 'funnel', 'delivery', 'jarInverted'],
    text: {
      stand: '铁架台',
      flask: '锥形瓶（反应物）',
      funnel: '长颈漏斗',
      delivery: '导管（伸到瓶底）',
      jarInverted: '集气瓶（倒放）',
    },
  },
}

export function renderApparatus(p) {
  const key = String(p.kind ?? 'o2-heat')
  const rule = APPARATUS_RULES[key]
  if (!rule) {
    return {
      ok: false,
      issues: [
        '没有这种装置配方：' + key + '（现有：' + Object.keys(APPARATUS_RULES).join(' / ') + '）',
        '这种情况请改用 draw_diagram 自己摆图元（flask/beaker/testTube/burner/trough/jar 等），不要只回一句话',
      ],
      svg: null,
    }
  }
  const given = Array.isArray(p.parts) && p.parts.length ? p.parts.map(String) : rule.need.slice()
  const issues = []
  for (const need of rule.need) {
    if (!given.includes(need)) issues.push('缺器材：' + (rule.text[need] ?? need))
  }
  for (const g of given) {
    if (!rule.need.includes(g)) issues.push('这套装置里不该有：' + (rule.text[g] ?? g))
  }
  if (issues.length) {
    // 仍画一套**正确答案**做对照，但明确告诉调用方"你给的结构不对"
    return { ok: false, issues, svg: buildApparatus(key), summary: '结构不完整：' + issues.join('；') }
  }
  return { ok: true, issues, svg: buildApparatus(key), summary: rule.name }
}

function buildApparatus(key) {
  const art = []
  const g = (s) => art.push(s)

  // 铁架台
  g('<line x1="70" y1="330" x2="240" y2="330" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>')
  g('<line x1="132" y1="330" x2="132" y2="120" stroke="' + INK + '" stroke-width="4"/>')
  g(text(86, 352, '铁架台', { size: 11.5, fill: LABEL }))

  if (key === 'o2-heat') {
    // 试管（口略向下倾斜），里面是固体
    g('<g transform="rotate(14 132 200)">')
    g('<rect x="126" y="150" width="34" height="120" rx="17" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<path d="M 132 250 q 11 -12 22 0 q 11 12 22 0 l 0 16 l -44 0 z" fill="rgba(120,148,178,.35)"/>')
    g('</g>')
    g('<line x1="112" y1="176" x2="132" y2="176" stroke="' + INK + '" stroke-width="3"/>')
    g(text(160, 258, '固体药品', { size: 11, fill: LABEL }))
    // 单孔塞 + 导管（右折下）
    g('<rect x="176" y="150" width="14" height="26" rx="4" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
    g('<path d="M 183 162 L 250 162 L 250 250 L 360 250" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g(text(196, 142, '导管', { size: 11, fill: LABEL }))
    // 酒精灯
    g('<path d="M 118 330 l 6 -26 l 14 0 l 6 26 z" fill="#e8eef5" stroke="' + INK + '" stroke-width="1.8"/>')
    g('<path d="M 131 300 q 8 -16 0 -26 q -8 10 0 26 z" fill="#ffb020" opacity="0.9"/>')
    g(text(150, 300, '酒精灯', { size: 11, fill: LABEL }))
  } else if (key === 'o2-h2o2') {
    // 锥形瓶 + 分液漏斗
    g('<path d="M 120 200 L 104 300 q -2 14 12 14 l 40 0 q 14 0 12 -14 L 152 200 z" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<rect x="126" y="186" width="20" height="16" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    g('<path d="M 118 262 q 18 10 36 0 l 0 18 q -18 10 -36 0 z" fill="rgba(120,148,178,.35)"/>')
    g(text(96, 322, '锥形瓶（MnO₂）', { size: 11, fill: LABEL }))
    g('<path d="M 118 186 L 118 130 L 96 108 L 96 92 L 140 92 L 140 108 L 118 130" fill="#fff" stroke="' + INK + '" stroke-width="2.2"/>')
    g(text(150, 100, '分液漏斗（H₂O₂）', { size: 11, fill: LABEL }))
    g('<path d="M 136 190 L 210 190 L 210 250 L 360 250" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g(text(214, 182, '导管', { size: 11, fill: LABEL }))
  }

  if (key === 'o2-heat' || key === 'o2-h2o2') {
    // 水槽 + 倒扣的集气瓶 + 气泡（排水法）
    g('<path d="M 356 250 L 356 330 L 660 330 L 660 262 L 356 262 z" fill="rgba(10,122,230,.10)" stroke="' + INK + '" stroke-width="2.2"/>')
    g(text(360, 352, '水槽', { size: 11.5, fill: LABEL }))
    g('<rect x="470" y="196" width="96" height="120" fill="rgba(255,255,255,.55)" stroke="' + INK + '" stroke-width="2.2"/>')
    g('<line x1="470" y1="316" x2="566" y2="316" stroke="' + INK + '" stroke-width="2.2"/>')
    for (const [bx, by] of [[492, 300], [516, 288], [540, 302]]) {
      g('<circle cx="' + bx + '" cy="' + by + '" r="4.5" fill="none" stroke="' + ACCENT + '" stroke-width="1.4"/>')
    }
    g('<path d="M 360 250 L 440 250 L 440 300 L 470 300" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g(text(520, 180, '集气瓶（倒扣，排水法收集）', { size: 11.5, anchor: 'middle', fill: LABEL }))
    return frame(
      key === 'o2-heat' ? '实验室制取氧气（加热固体 + 排水法）' : '实验室制取氧气（过氧化氢 + 二氧化锰）',
      art.join(''),
      '收集满后先撤导管、再熄灭酒精灯（防止倒吸）',
    )
  }

  if (key === 'esterification') {
    // 坐标重新排过：铁架台在左、烧瓶居中、酒精灯在烧瓶正下方、导管从瓶口出发向右下
    g('<line x1="60" y1="340" x2="230" y2="340" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>')
    g('<line x1="104" y1="340" x2="104" y2="140" stroke="' + INK + '" stroke-width="4"/>')
    g('<line x1="104" y1="196" x2="140" y2="196" stroke="' + INK + '" stroke-width="3"/>')
    g(text(74, 360, '铁架台', { size: 11, fill: LABEL }))
    // 圆底烧瓶：球 + 瓶颈 + 单孔塞
    g('<circle cx="150" cy="232" r="34" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<rect x="142" y="178" width="16" height="26" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    g('<rect x="136" y="166" width="28" height="14" rx="3" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
    g('<path d="M 122 252 q 28 14 56 0 l 0 -6 q -28 12 -56 0 z" fill="rgba(120,148,178,.35)"/>')
    g(text(150, 386, '圆底烧瓶：乙醇＋乙酸＋浓硫酸', { size: 11, anchor: 'middle', fill: LABEL }))
    // 酒精灯在烧瓶正下方
    g('<path d="M 136 330 l 5 -22 l 18 0 l 5 22 z" fill="#e8eef5" stroke="' + INK + '" stroke-width="1.8"/>')
    g('<path d="M 150 306 q 8 -14 0 -24 q -8 10 0 24 z" fill="#ffb020" opacity="0.92"/>')
    g(text(196, 306, '酒精灯', { size: 11, fill: LABEL }))
    // 导管：瓶口向上再向右，末端悬在液面上方
    g('<path d="M 150 166 L 150 140 L 430 140 L 430 240" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g(text(300, 130, '导管（末端不伸入液面，防倒吸）', { size: 10.5, fill: LABEL }))
    // 小烧杯 + 饱和碳酸钠溶液
    g('<path d="M 430 240 L 430 330 L 570 330 L 570 240" fill="rgba(10,122,230,.10)" stroke="' + INK + '" stroke-width="2.2"/>')
    g('<line x1="430" y1="272" x2="570" y2="272" stroke="' + ACCENT + '" stroke-width="1.6" stroke-dasharray="5 4"/>')
    g(text(500, 352, '饱和 Na₂CO₃ 溶液', { size: 11.5, anchor: 'middle', fill: LABEL }))
    g('<circle cx="478" cy="300" r="4.5" fill="none" stroke="' + ACCENT + '" stroke-width="1.4"/>')
    g('<circle cx="516" cy="288" r="4" fill="none" stroke="' + ACCENT + '" stroke-width="1.4"/>')
    g('<circle cx="548" cy="302" r="4" fill="none" stroke="' + ACCENT + '" stroke-width="1.4"/>')
    return frame('乙酸乙酯的制备（酯化反应）', art.join(''), '导管末端不能伸入碳酸钠液面下（防倒吸）；反应后液面上层有果香味的油状液体', 440)
  }
  if (key === 'gas-wash') {
    // 洗气瓶：长导管伸入液面（进气）、短导管在液面上方（出气）
    g('<path d="M 300 150 L 300 320 L 460 320 L 460 150" fill="none" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<path d="M 302 236 L 458 236 L 458 316 L 302 316 z" fill="rgba(10,122,230,.12)" stroke="none"/>')
    g('<rect x="292" y="140" width="16" height="16" rx="4" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
    g('<rect x="452" y="140" width="16" height="16" rx="4" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
    // 长导管：从瓶口直插到液面以下
    g('<path d="M 300 140 L 300 300" fill="none" stroke="' + ACCENT + '" stroke-width="2.6"/>')
    g('<path d="M 330 40 L 330 120 L 300 120" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    // 短导管：只到液面上方
    g('<path d="M 430 120 L 460 120 L 460 160" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g('<path d="M 460 120 L 540 120" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g(text(330, 30, '待处理气体（如 CO₂）', { size: 11.5, anchor: 'middle', fill: LABEL }))
    g(text(560, 116, '净化后气体', { size: 11.5, fill: LABEL }))
    g(text(380, 344, '洗气瓶：长进短出（长导管伸入液面下）', { size: 11.5, anchor: 'middle', fill: LABEL }))
    for (const [bx, by] of [[340, 286], [366, 274], [396, 290]]) {
      g('<circle cx="' + bx + '" cy="' + by + '" r="4" fill="none" stroke="' + ACCENT + '" stroke-width="1.3"/>')
    }
    return frame('洗气 / 气体吸收装置（浓 NaOH 吸收 CO₂）', art.join(''), '气体必须"长进短出"：长导管伸到液面以下才能被吸收液洗到')
  }

  if (key === 'precipitation') {
    // 试管 + 胶头滴管滴加，生成蓝色沉淀；试管架在烧杯上方的托里
    g('<rect x="196" y="120" width="52" height="170" rx="26" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<path d="M 200 216 q 22 8 44 0 l 0 48 q -22 8 -44 0 z" fill="rgba(10,122,230,.18)"/>')
    g('<circle cx="212" cy="268" r="4" fill="#1f6fd0" opacity="0.85"/>')
    g('<circle cx="230" cy="276" r="3.4" fill="#1f6fd0" opacity="0.85"/>')
    g('<circle cx="222" cy="256" r="3" fill="#1f6fd0" opacity="0.85"/>')
    g(text(222, 312, '试管（CuSO₄ 溶液）', { size: 11, anchor: 'middle', fill: LABEL }))
    // 胶头滴管
    g('<path d="M 222 40 L 222 70 L 216 70 L 216 128 L 228 128 L 228 70 L 222 70" fill="#fff" stroke="' + INK + '" stroke-width="1.8"/>')
    g('<ellipse cx="222" cy="34" rx="14" ry="10" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
    g('<circle cx="222" cy="132" r="3.2" fill="' + ACCENT + '"/>')
    g(text(266, 46, '胶头滴管（NaOH 溶液）', { size: 11, fill: LABEL }))
    // 烧杯
    g('<path d="M 380 240 L 380 330 L 520 330 L 520 240" fill="rgba(120,148,178,.10)" stroke="' + INK + '" stroke-width="2.2"/>')
    g(text(450, 352, '烧杯（盛废液）', { size: 11, anchor: 'middle', fill: LABEL }))
    g(text(340, 200, 'Cu²⁺ + 2OH⁻ → Cu(OH)₂↓（蓝色沉淀）', { size: 13, anchor: 'middle', weight: 600 }))
    return frame('向 CuSO₄ 溶液中滴加 NaOH（生成蓝色沉淀）', art.join(''), '滴管不要伸入液面；边滴边看，蓝色絮状沉淀即为 Cu(OH)₂')
  }

  if (key === 'co2-prep' || key === 'h2-prep') {
    // 和排空气法同一套装置，只换收集瓶朝向 + 标签
    return buildApparatus(key === 'co2-prep' ? 'air-up' : 'air-down')
  }

  if (key === 'filtration') {
    // 铁架台 + 漏斗（带滤纸）+ 烧杯 + 玻璃棒引流
    g('<line x1="80" y1="330" x2="250" y2="330" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>')
    g('<line x1="150" y1="330" x2="150" y2="120" stroke="' + INK + '" stroke-width="4"/>')
    g('<line x1="150" y1="190" x2="240" y2="190" stroke="' + INK + '" stroke-width="3"/>')
    g(text(88, 352, '铁架台（带铁圈）', { size: 11, fill: LABEL }))
    // 漏斗
    g('<path d="M 226 190 L 254 190 L 248 236 L 232 236 Z" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    g('<path d="M 230 236 L 250 236 L 244 268 L 236 268 Z" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
    g('<path d="M 228 196 L 252 196 L 247 232 L 233 232 Z" fill="rgba(120,148,178,.30)" stroke="none"/>')
    g(text(300, 210, '漏斗 + 滤纸（一贴二低三靠）', { size: 11, fill: LABEL }))
    // 玻璃棒
    g('<line x1="176" y1="140" x2="240" y2="206" stroke="#8a5a00" stroke-width="3" stroke-linecap="round"/>')
    g(text(150, 128, '玻璃棒（引流）', { size: 11, fill: LABEL }))
    // 烧杯接滤液
    g('<path d="M 210 272 L 210 330 L 300 330 L 300 272" fill="rgba(10,122,230,.10)" stroke="' + INK + '" stroke-width="2.2"/>')
    g(text(255, 352, '烧杯（滤液）', { size: 11, anchor: 'middle', fill: LABEL }))
    g('<circle cx="240" cy="300" r="3.4" fill="' + ACCENT + '" opacity="0.6"/>')
    return frame('过滤操作', art.join(''), '一贴（滤纸贴漏斗）、二低（滤纸与液面都低于漏斗口）、三靠（玻璃棒靠滤纸、漏斗口靠烧杯壁）')
  }

  if (key === 'distillation') {
    // 蒸馏烧瓶（带温度计）+ 冷凝管（下进上出）+ 锥形瓶
    g('<line x1="70" y1="340" x2="250" y2="340" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>')
    g('<line x1="120" y1="340" x2="120" y2="130" stroke="' + INK + '" stroke-width="4"/>')
    g('<circle cx="170" cy="250" r="38" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<path d="M 160 222 L 152 150 L 188 150 L 180 222" fill="none" stroke="' + INK + '" stroke-width="2.2"/>')
    g('<line x1="150" y1="126" x2="196" y2="126" stroke="' + INK + '" stroke-width="2.4"/>')
    g('<path d="M 170 222 L 170 200" stroke="' + INK + '" stroke-width="1.6"/>')
    g(text(170, 196, '温度计', { size: 10.5, anchor: 'middle', fill: LABEL }))
    g('<path d="M 120 340 l 5 -22 l 14 0 l 5 22 z" fill="#e8eef5" stroke="' + INK + '" stroke-width="1.8"/>')
    g('<path d="M 128 318 q 8 -14 0 -22 q -8 9 0 22 z" fill="#ffb020" opacity="0.9"/>')
    g(text(74, 300, '酒精灯', { size: 11, fill: LABEL }))
    // 支管 → 冷凝管（下进上出）
    g('<path d="M 208 168 L 300 168 L 300 210" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
    g('<path d="M 300 210 L 400 250" stroke="' + INK + '" stroke-width="3"/>')
    g('<path d="M 300 250 L 400 210" stroke="' + INK + '" stroke-width="3"/>')
    g('<line x1="322" y1="252" x2="322" y2="300" stroke="' + ACCENT + '" stroke-width="1.8"/>')
    g(text(322, 316, '冷却水 下进', { size: 10.5, anchor: 'middle', fill: ACCENT }))
    g('<line x1="386" y1="300" x2="386" y2="212" stroke="' + ACCENT + '" stroke-width="1.8"/>')
    g(text(386, 316, '上出', { size: 10.5, anchor: 'middle', fill: ACCENT }))
    // 锥形瓶接馏出液
    g('<path d="M 430 240 L 408 330 q -2 12 10 12 l 40 0 q 12 0 10 -12 L 446 240 z" fill="#fff" stroke="' + INK + '" stroke-width="2.2"/>')
    g('<path d="M 420 300 q 18 8 36 0 l 0 30 q -18 8 -36 0 z" fill="rgba(10,122,230,.18)"/>')
    g(text(438, 356, '锥形瓶（馏出液）', { size: 11, anchor: 'middle', fill: LABEL }))
    return frame('蒸馏装置', art.join(''), '温度计水银球在支管口；冷凝水必须下进上出；先撤酒精灯再停冷却水')
  }

  // 向上 / 向下排空气法收集
  const inverted = key === 'air-down'
  g('<path d="M 132 200 L 104 300 q -2 14 12 14 l 40 0 q 14 0 12 -14 L 152 200 z" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>')
  g('<rect x="126" y="186" width="20" height="16" fill="#fff" stroke="' + INK + '" stroke-width="2"/>')
  g('<path d="M 118 262 q 18 10 36 0 l 0 18 q -18 10 -36 0 z" fill="rgba(120,148,178,.35)"/>')
  g(text(96, 322, '锥形瓶', { size: 11, fill: LABEL }))
  g('<path d="M 118 186 L 118 128 L 96 106 L 96 88 L 140 88 L 140 106 L 118 128" fill="#fff" stroke="' + INK + '" stroke-width="2.2"/>')
  g(text(150, 96, '长颈漏斗', { size: 11, fill: LABEL }))
  // 导管：正放时伸到瓶底（下方），倒放时同样伸到"顶"（瓶底朝上）
  const jarX = 470
  const jarTop = inverted ? 180 : 196
  const jarBottom = inverted ? 300 : 320
  g('<path d="M 136 190 L 240 190 L 240 ' + (inverted ? 200 : 300) + ' L ' + jarX + ' ' + (inverted ? 200 : 300) + '" fill="none" stroke="' + INK + '" stroke-width="2.6"/>')
  g('<rect x="' + jarX + '" y="' + jarTop + '" width="100" height="' + (jarBottom - jarTop) + '" fill="rgba(255,255,255,.6)" stroke="' + INK + '" stroke-width="2.2"/>')
  g('<line x1="' + jarX + '" y1="' + (inverted ? jarTop : jarBottom) + '" x2="' + (jarX + 100) + '" y2="' + (inverted ? jarTop : jarBottom) + '" stroke="' + INK + '" stroke-width="2.4"/>')
  g(text(jarX + 50, jarTop - 12, inverted ? '集气瓶（倒放，向下排空气法）' : '集气瓶（正放，向上排空气法）', { size: 11.5, anchor: 'middle', fill: LABEL }))
  return frame(
    inverted ? '向下排空气法收集气体' : '向上排空气法收集气体',
    art.join(''),
    inverted ? '适用于 H₂、NH₃（密度比空气小）；收集满后倒扣在桌面上' : '适用于 O₂、CO₂（密度比空气大）；导管要伸到瓶底排尽空气',
  )
}

/* =========================================================
 * 三、植物细胞有丝分裂过程
 * =======================================================*/

const MITOSIS_STAGES = [
  { key: 'interphase', name: '间期', desc: 'DNA 复制，染色体呈染色质细丝' },
  { key: 'prophase', name: '前期', desc: '染色质螺旋化成染色体，核膜核仁消失，纺锤体形成' },
  { key: 'metaphase', name: '中期', desc: '染色体着丝点排在赤道板上，形态最清晰' },
  { key: 'anaphase', name: '后期', desc: '着丝点分裂，姐妹染色单体分开移向两极' },
  { key: 'telophase', name: '末期', desc: '染色体解螺旋，核膜重现，赤道板处形成细胞板' },
]

export function renderMitosis(p) {
  const want = Array.isArray(p.stages) && p.stages.length ? p.stages.map(String) : MITOSIS_STAGES.map((s) => s.key)
  const issues = []
  for (const s of want) {
    if (!MITOSIS_STAGES.some((x) => x.key === s || x.name === s)) issues.push('不认识的阶段：' + s)
  }
  const order = want
    .map((s) => MITOSIS_STAGES.findIndex((x) => x.key === s || x.name === s))
    .filter((i) => i >= 0)
  if (order.length && order.some((v, i) => i > 0 && v <= order[i - 1])) {
    issues.push('阶段顺序不对：应依次是 间期 → 前期 → 中期 → 后期 → 末期')
  }
  const cellW = 128
  const gap = (W - 48 - cellW * 5) / 4
  const cy = 210
  const art = []
  const stages = (order.length ? order : [0, 1, 2, 3, 4]).map((i) => MITOSIS_STAGES[i])

  stages.forEach((st, i) => {
    const cx = 24 + cellW / 2 + i * (cellW + gap)
    art.push('<rect x="' + f1(cx - cellW / 2) + '" y="' + (cy - 70) + '" width="' + cellW + '" height="140" rx="16" fill="rgba(16,168,122,.06)" stroke="' + GREEN + '" stroke-width="2"/>')
    art.push(text(cx, cy - 82, st.name, { anchor: 'middle', size: 13.5, weight: 700, fill: GREEN }))

    // 细胞核轮廓（间期实线，前期后消失）
    if (st.key === 'interphase') {
      art.push('<circle cx="' + f1(cx) + '" cy="' + cy + '" r="34" fill="rgba(10,122,230,.08)" stroke="' + ACCENT + '" stroke-width="1.8"/>')
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2
        art.push('<path d="M ' + f1(cx - 18 * Math.cos(a)) + ' ' + f1(cy - 18 * Math.sin(a)) + ' q ' + f1(12 * Math.cos(a)) + ' ' + f1(12 * Math.sin(a)) + ' ' + f1(26 * Math.cos(a)) + ' ' + f1(26 * Math.sin(a)) + '" fill="none" stroke="' + ACCENT + '" stroke-width="1.2" opacity="0.7"/>')
      }
    }
    if (st.key === 'prophase') {
      for (const [dx, dy, rot] of [[-14, -10, 20], [10, -4, -30], [-4, 14, 60], [16, 12, -10]]) {
        art.push('<line x1="' + f1(cx + dx - 9) + '" y1="' + f1(cy + dy) + '" x2="' + f1(cx + dx + 9) + '" y2="' + f1(cy + dy) + '" stroke="' + RED + '" stroke-width="3" transform="rotate(' + rot + ' ' + f1(cx + dx) + ' ' + f1(cy + dy) + ')"/>')
      }
      art.push('<circle cx="' + f1(cx) + '" cy="' + cy + '" r="40" fill="none" stroke="' + ACCENT + '" stroke-width="1" stroke-dasharray="4 5" opacity="0.6"/>')
    }
    if (st.key === 'metaphase') {
      art.push('<line x1="' + f1(cx - 52) + '" y1="' + cy + '" x2="' + f1(cx + 52) + '" y2="' + cy + '" stroke="rgba(120,148,178,.7)" stroke-width="1.2" stroke-dasharray="5 5"/>')
      for (let k = -2; k <= 2; k += 1) {
        art.push('<line x1="' + f1(cx) + '" y1="' + f1(cy + k * 13) + '" x2="' + f1(cx + 14) + '" y2="' + f1(cy + k * 13) + '" stroke="' + RED + '" stroke-width="3"/>')
      }
      art.push(text(cx, cy + 62, '赤道板', { anchor: 'middle', size: 10.5, fill: LABEL }))
    }
    if (st.key === 'anaphase') {
      for (let k = 0; k < 4; k += 1) {
        art.push('<line x1="' + f1(cx - 44) + '" y1="' + f1(cy - 20 + k * 13) + '" x2="' + f1(cx - 30) + '" y2="' + f1(cy - 20 + k * 13) + '" stroke="' + RED + '" stroke-width="3"/>')
        art.push('<line x1="' + f1(cx + 30) + '" y1="' + f1(cy - 20 + k * 13) + '" x2="' + f1(cx + 44) + '" y2="' + f1(cy - 20 + k * 13) + '" stroke="' + RED + '" stroke-width="3"/>')
      }
      art.push(text(cx, cy + 62, '移向两极', { anchor: 'middle', size: 10.5, fill: LABEL }))
    }
    if (st.key === 'telophase') {
      art.push('<line x1="' + f1(cx) + '" y1="' + (cy - 66) + '" x2="' + f1(cx) + '" y2="' + (cy + 66) + '" stroke="' + GREEN + '" stroke-width="2.4" stroke-dasharray="6 4"/>')
      art.push('<circle cx="' + f1(cx - 26) + '" cy="' + cy + '" r="18" fill="rgba(10,122,230,.08)" stroke="' + ACCENT + '" stroke-width="1.6"/>')
      art.push('<circle cx="' + f1(cx + 26) + '" cy="' + cy + '" r="18" fill="rgba(10,122,230,.08)" stroke="' + ACCENT + '" stroke-width="1.6"/>')
      art.push(text(cx, cy + 62, '细胞板 → 细胞壁', { anchor: 'middle', size: 10.5, fill: LABEL }))
    }
    // 说明分两行写，否则五列长句会互相压住（第一版就叠成一条了）
    const lines = wrapCn(st.desc, 9).slice(0, 3)
    lines.forEach((ln, li) => art.push(text(cx, cy + 92 + li * 12, ln, { anchor: 'middle', size: 9.5, fill: LABEL })))
  })

  const svg = frame(String(p.title ?? '植物细胞有丝分裂过程'), art.join(''), '一个细胞周期：间期 → 前期 → 中期 → 后期 → 末期', 430)
  return { ok: issues.length === 0, issues, svg, summary: stages.map((s) => s.name).join(' → ') }
}

/* =========================================================
 * 给模型看的说明
 * =======================================================*/
/**
 * 实验清单：把"现在能画什么"显式列出来，模型不用猜 kind。
 * 每一行都对应一个真实存在的引擎分支（有自检守着），不列没实现的。
 */
export function experimentCatalog() {
  return [
    '【数学】',
    '  plot_function      任意函数图像（π 刻度、整数刻度）',
    '  plot_geometry      几何作图（点/线/圆/多边形）',
    '【物理 · 电学】',
    '  draw_circuit       任意直流电路（电池/电阻/灯泡/开关/电流表/电压表/滑动变阻器）+ 接法校验',
    '                      涵盖：伏安法测电阻、测小灯泡电功率、串并联电路',
    '【物理 · 力学】',
    '  draw_forces        斜面受力分析（G/N/f/拉力，判静止或滑动，给加速度）',
    '  render_experiment  incline 斜面 / pendulum 单摆',
    '【物理 · 光学】',
    '  draw_optics kind=lens          凸透镜成像（成像公式 + 虚实判定）',
    '  draw_optics kind=mirror        平面镜成像（对称、等大虚像）',
    '  draw_optics kind=refraction    光的折射（1.33 → 折射角）',
    '【物理 · 电磁/波动】',
    '  draw_em kind=charge-circular   带电粒子在匀强磁场中的圆周运动',
    '  draw_em kind=double-slit       双缝干涉条纹',
    '  render_experiment induction    导体棒切割磁感线',
    '【物理 · 热学/其他】',
    '  render_experiment titration    酸碱滴定曲线',
    '【化学】',
    '  draw_apparatus kind=o2-heat     制氧气（加热固体 + 排水法）',
    '  draw_apparatus kind=o2-h2o2     制氧气（过氧化氢 + 二氧化锰）',
    '  draw_apparatus kind=co2-prep    制二氧化碳（稀盐酸 + 石灰石）',
    '  draw_apparatus kind=h2-prep     制氢气（锌 + 稀硫酸）',
    '  draw_apparatus kind=esterification 乙酸乙酯（酯化反应）',
    '  draw_apparatus kind=filtration  过滤（一贴二低三靠）',
    '  draw_apparatus kind=distillation 蒸馏（温度计、冷凝水下进上出）',
    '  draw_apparatus kind=gas-wash    洗气/气体吸收（长进短出）',
    '  draw_apparatus kind=precipitation 沉淀（CuSO₄ + NaOH）',
    '  draw_apparatus kind=air-up / air-down  排空气法收集',
    '【生物】',
    '  draw_mitosis                    植物细胞有丝分裂五期',
    '  render_experiment photosynthesis 光合作用（光/暗反应可分开）',
    '  render_experiment pedigree      家族谱系图（AR/AD/XR/mito）',
    '【通用兜底】',
    '  draw_diagram     自由摆图元（任何以上没列的示意图）',
    '调用任何绘图工具后，把返回的 [chart:…] 原样写进回复，图才会出现在聊天里。',
  ].join('\n')
}

export function scienceSpec() {
  return [
    'draw_optics（凸透镜成像）：{ kind:"lens", u:物距cm, f:焦距cm, h:物高cm }',
    '  · 引擎按 1/v = 1/f − 1/u 算像距，给出正倒/大小/虚实；u=f 会明确说"不成像"',
    'draw_apparatus（化学装置）：{ kind:"o2-heat"|"o2-h2o2", parts?:[...] }',
    '  · 缺器材/多余器材会被判错并列出；parts 不传就按标准装置画',
    'draw_mitosis（植物细胞有丝分裂）：{ stages?:["interphase","prophase","metaphase","anaphase","telophase"] }',
    '  · 阶段名写错或顺序颠倒会被判错；不传就按五期顺序画',
  ].join('\n')
}

/* =========================================================
 * 四、受力分析
 * =======================================================*/

/**
 * 斜面上的受力分析：给定质量、倾角、摩擦系数、（可选）沿斜面的拉力，
 * 算重力/支持力/摩擦力/加速度，并画出四个力的箭头。
 *
 * 这里坚持"算出来再画"：不确定是静止还是滑动时，先判断静摩擦够不够，
 * 不够才按滑动摩擦算加速度 —— 学生按图读的每个数字都得是对的。
 */
export function renderForces(p) {
  const issues = []
  const m = Number(p.m ?? 1)
  const theta = Number(p.theta ?? 30)
  const mu = Number(p.mu ?? 0.2)
  const F = Number(p.F ?? 0)
  if (!Number.isFinite(m) || m <= 0) issues.push('质量 m 必须大于 0')
  if (!Number.isFinite(theta) || theta < 0 || theta > 85) issues.push('倾角 theta 应在 0°–85° 之间')
  if (!Number.isFinite(mu) || mu < 0) issues.push('摩擦系数 mu 不能为负')
  if (!Number.isFinite(F)) issues.push('拉力 F 必须是数字（没有拉力就传 0）')
  if (issues.length) return { ok: false, issues, svg: null }

  const g = 9.8
  const rad = (theta * Math.PI) / 180
  const G = m * g
  const N = G * Math.cos(rad)
  const drive = G * Math.sin(rad) + F // 沿斜面向下为正
  const maxStatic = mu * N
  let a = 0
  let f = 0
  let state = '静止'
  if (Math.abs(drive) <= maxStatic + 1e-9) {
    f = -drive
    a = 0
    state = mu > 0 ? '静止（静摩擦平衡）' : '静止（无摩擦但无运动趋势）'
  } else {
    f = -Math.sign(drive) * maxStatic
    a = (drive + f) / m
    state = a > 0 ? '沿斜面下滑' : '沿斜面上滑'
  }

  const art = []
  const W2 = 720
  const H2 = 420
  const ax = 90
  const ay = 330
  const hyp = 380
  const bx = ax + hyp * Math.cos(rad)
  const by = ay - hyp * Math.sin(rad)
  art.push('<polygon points="' + f1(ax) + ',' + ay + ' ' + f1(bx) + ',' + f1(by) + ' ' + f1(bx) + ',' + ay + '" fill="rgba(120,148,178,.12)" stroke="' + INK + '" stroke-width="2"/>')
  art.push(text(ax + 12, ay - 8, 'θ=' + num(theta) + '°', { size: 12, fill: ACCENT }))

  // 物块放在斜面中段
  const t = 0.52
  const cx = ax + hyp * t * Math.cos(rad)
  const cy2 = ay - hyp * t * Math.sin(rad)
  const s = 24
  const pts = [
    [cx - s * Math.cos(rad) + s * Math.sin(rad), cy2 + s * Math.sin(rad) + s * Math.cos(rad)],
    [cx + s * Math.cos(rad) + s * Math.sin(rad), cy2 - s * Math.sin(rad) + s * Math.cos(rad)],
    [cx + s * Math.cos(rad) - s * Math.sin(rad), cy2 - s * Math.sin(rad) - s * Math.cos(rad)],
    [cx - s * Math.cos(rad) - s * Math.sin(rad), cy2 + s * Math.sin(rad) - s * Math.cos(rad)],
  ]
  art.push('<polygon points="' + pts.map((q) => f1(q[0]) + ',' + f1(q[1])).join(' ') + '" fill="' + ACCENT + '" opacity="0.85"/>')

  const arrow = (dx, dy, color, label) => {
    const lx = cx + dx
    const ly = cy2 + dy
    art.push('<line x1="' + f1(cx) + '" y1="' + f1(cy2) + '" x2="' + f1(lx) + '" y2="' + f1(ly) + '" stroke="' + color + '" stroke-width="2.4" marker-end="url(#ar)"/>')
    art.push(text(lx + Math.sign(dx || 0) * 6, ly + (dy < 0 ? -8 : 16), label, { size: 12, fill: color, anchor: dx < -8 ? 'end' : 'start' }))
  }
  // 重力竖直向下
  arrow(0, 84, INK, 'G=' + num(G, 1) + 'N')
  // 支持力垂直斜面
  arrow(-Math.sin(rad) * 76, -Math.cos(rad) * 76, '#b42318', 'N=' + num(N, 1) + 'N')
  // 摩擦力沿斜面
  const fdir = f === 0 ? -1 : Math.sign(f)
  arrow(fdir * Math.cos(rad) * 70, -fdir * Math.sin(rad) * 70, '#8a5a00', 'f=' + num(Math.abs(f), 1) + 'N')
  // 拉力
  if (Math.abs(F) > 1e-9) {
    const sgn = Math.sign(F)
    arrow(sgn * Math.cos(rad) * 70, -sgn * Math.sin(rad) * 70, '#0b7d5b', 'F=' + num(Math.abs(F), 1) + 'N')
  }

  const caption = 'θ=' + num(theta) + '°  m=' + num(m) + 'kg  μ=' + num(mu) + '  →  ' + state + (a ? '，a=' + num(a, 2) + 'm/s²' : '')
  const svg = frame(String(p.title ?? '斜面上的受力分析'), art.join(''), caption, H2)
  return {
    ok: true,
    issues,
    svg,
    summary: state + (a ? '（a=' + num(a, 2) + 'm/s²）' : ''),
    data: { G: Number(num(G, 2)), N: Number(num(N, 2)), f: Number(num(f, 2)), a: Number(num(a, 3)), state },
  }
}

/* =========================================================
 * 五、电磁学（带电粒子在磁场中 / 双缝干涉）
 * =======================================================*/

/** 平面镜成像：像与物关于镜面对称，等大、正立、虚像 */
export function renderPlaneMirror(p) {
  const h = Number(p.h ?? 4)
  const d = Number(p.d ?? 6)
  const issues = []
  if (!(h > 0) || !(d > 0)) issues.push('物高 h、物到镜距离 d 都必须大于 0')
  if (issues.length) return { ok: false, issues, svg: null }
  const art = []
  const axisY = 250
  const mirrorX = 400
  const scale = 16
  art.push('<line x1="' + mirrorX + '" y1="90" x2="' + mirrorX + '" y2="330" stroke="' + INK + '" stroke-width="3"/>')
  for (let y = 92; y < 330; y += 10) {
    art.push('<line x1="' + mirrorX + '" y1="' + y + '" x2="' + (mirrorX + 8) + '" y2="' + (y + 8) + '" stroke="rgba(120,148,178,.7)" stroke-width="1"/>')
  }
  art.push(text(mirrorX + 6, 82, '平面镜', { size: 12, fill: LABEL }))
  art.push('<line x1="60" y1="' + axisY + '" x2="680" y2="' + axisY + '" stroke="rgba(120,148,178,.6)" stroke-width="1.2" stroke-dasharray="6 5"/>')
  const objX = mirrorX - d * scale
  const imgX = mirrorX + d * scale
  art.push('<line x1="' + objX + '" y1="' + axisY + '" x2="' + objX + '" y2="' + (axisY - h * scale) + '" stroke="' + ACCENT + '" stroke-width="2.8" marker-end="url(#ar-blue)"/>')
  art.push(text(objX, axisY - h * scale - 10, '物（h=' + num(h) + 'cm）', { size: 12, anchor: 'middle', fill: ACCENT }))
  art.push('<line x1="' + imgX + '" y1="' + axisY + '" x2="' + imgX + '" y2="' + (axisY - h * scale) + '" stroke="' + RED + '" stroke-width="2.4" stroke-dasharray="7 6" marker-end="url(#ar)"/>')
  art.push(text(imgX, axisY - h * scale - 10, '像（虚像，等大）', { size: 12, anchor: 'middle', fill: RED }))
  for (const y of [axisY, axisY - h * scale]) {
    art.push('<line x1="' + objX + '" y1="' + y + '" x2="' + imgX + '" y2="' + y + '" stroke="rgba(120,148,178,.6)" stroke-width="1" stroke-dasharray="4 4"/>')
  }
  const svg = frame('平面镜成像', art.join(''), '像与物关于镜面对称：等大、正立、虚像（虚线箭头表示虚像）')
  return { ok: true, issues, svg, summary: '等大正立虚像，像距=' + num(d) + 'cm' }
}

/** 光的折射：从空气斜射入水，折射角小于入射角 */
export function renderRefraction(p) {
  const inc = Number(p.incident ?? 50)
  const issues = []
  if (!(inc > 0) || inc >= 89) issues.push('入射角应在 0°–89° 之间')
  if (issues.length) return { ok: false, issues, svg: null }
  const rad = (inc * Math.PI) / 180
  const sinR = Math.sin(rad) / 1.33
  const refr = (Math.asin(Math.min(1, sinR)) * 180) / Math.PI
  const art = []
  const surfaceY = 220
  const O = { x: 360, y: surfaceY }
  art.push('<rect x="40" y="' + surfaceY + '" width="640" height="150" fill="rgba(10,122,230,.10)"/>')
  art.push('<line x1="40" y1="' + surfaceY + '" x2="680" y2="' + surfaceY + '" stroke="' + INK + '" stroke-width="2"/>')
  art.push(text(600, surfaceY - 10, '空气', { size: 12, fill: LABEL }))
  art.push(text(600, surfaceY + 24, '水（n=1.33）', { size: 12, fill: LABEL }))
  art.push('<line x1="' + O.x + '" y1="90" x2="' + O.x + '" y2="350" stroke="rgba(120,148,178,.8)" stroke-width="1.2" stroke-dasharray="6 5"/>')
  const L = 190
  const inX = O.x - Math.sin(rad) * L
  const inY = O.y - Math.cos(rad) * L
  art.push('<line x1="' + f1(inX) + '" y1="' + f1(inY) + '" x2="' + O.x + '" y2="' + O.y + '" stroke="' + RED + '" stroke-width="2.4"/>')
  art.push('<line x1="' + f1(inX - Math.sin(rad) * 40) + '" y1="' + f1(inY - Math.cos(rad) * 40) + '" x2="' + f1(inX) + '" y2="' + f1(inY) + '" stroke="' + RED + '" stroke-width="2.4" marker-end="url(#ar)"/>')
  art.push(text(f1(inX - 14), f1(inY + 6), '入射光线', { size: 11.5, anchor: 'end', fill: RED }))
  const rr = (refr * Math.PI) / 180
  const outX = O.x + Math.sin(rr) * L
  const outY = O.y + Math.cos(rr) * L
  art.push('<line x1="' + O.x + '" y1="' + O.y + '" x2="' + f1(outX) + '" y2="' + f1(outY) + '" stroke="' + ACCENT + '" stroke-width="2.4" marker-end="url(#ar-blue)"/>')
  art.push(text(f1(outX + 8), f1(outY), '折射光线', { size: 11.5, fill: ACCENT }))
  art.push(text(O.x + 16, O.y - 14, '入射角 ' + num(inc) + '°', { size: 11.5, fill: LABEL }))
  art.push(text(O.x + 16, O.y + 26, '折射角 ' + num(refr, 1) + '°', { size: 11.5, fill: LABEL }))
  const svg = frame('光的折射（空气 → 水）', art.join(''), 'n = sin i / sin r = 1.33 → 折射角 ' + num(refr, 1) + '° < 入射角 ' + num(inc) + '°')
  return { ok: true, issues, svg, summary: '折射角 ' + num(refr, 1) + '°', data: { incident: inc, refracted: Number(num(refr, 2)) } }
}

export function renderEM(p) {
  const kind = String(p.kind ?? 'charge-circular')
  if (kind === 'charge-circular') return renderChargeCircular(p)
  if (kind === 'double-slit') return renderDoubleSlit(p)
  return { ok: false, issues: ['没有这种电磁学模型：' + kind + '（可选：charge-circular / double-slit）'], svg: null }
}

/** 带电粒子垂直进入匀强磁场：r = mv/(qB)，T = 2πm/(qB) */
function renderChargeCircular(p) {
  const issues = []
  const m = Number(p.m ?? 1)
  const q = Number(p.q ?? 1)
  const v = Number(p.v ?? 1)
  const B = Number(p.B ?? 1)
  if (![m, q, v, B].every((x) => Number.isFinite(x) && x > 0)) issues.push('m / q / v / B 都必须大于 0')
  if (issues.length) return { ok: false, issues, svg: null }

  const r = (m * v) / (q * B)
  const T = (2 * Math.PI * m) / (q * B)
  const art = []
  // 磁场网格（垂直纸面向里）
  for (let x = 70; x < W - 50; x += 44) {
    for (let y = 90; y < 340; y += 44) {
      art.push('<path d="M ' + x + ' ' + y + ' l 10 10 M ' + (x + 10) + ' ' + y + ' l -10 10" stroke="rgba(10,90,170,.35)" stroke-width="1.3"/>')
    }
  }
  // 粒子从左侧水平射入，做圆周运动（半径按比例缩放）
  const scale = clamp(150 / r, 6, 40)
  const rp = r * scale
  const enterX = 170
  const enterY = 300
  const cx = enterX
  const cy = enterY - rp
  art.push('<circle cx="' + f1(enterX) + '" cy="' + f1(enterY) + '" r="7" fill="' + ACCENT + '"/>')
  art.push('<line x1="' + f1(enterX - 60) + '" y1="' + f1(enterY) + '" x2="' + f1(enterX - 12) + '" y2="' + f1(enterY) + '" stroke="#0b7d5b" stroke-width="2.4" marker-end="url(#ar)"/>')
  art.push(text(enterX - 56, enterY - 10, 'v', { size: 13, fill: '#0b7d5b' }))
  if (cy > 40) {
    art.push('<path d="M ' + f1(enterX) + ' ' + f1(enterY) + ' A ' + f1(rp) + ' ' + f1(rp) + ' 0 0 0 ' + f1(enterX + rp) + ' ' + f1(enterY - rp) + '" fill="none" stroke="' + ACCENT + '" stroke-width="2.2" stroke-dasharray="6 5"/>')
    art.push('<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="3.6" fill="' + INK + '"/>')
    art.push('<line x1="' + f1(cx) + '" y1="' + f1(cy) + '" x2="' + f1(enterX) + '" y2="' + f1(enterY) + '" stroke="rgba(120,148,178,.9)" stroke-width="1.4" stroke-dasharray="4 4"/>')
    art.push(text((cx + enterX) / 2 + 6, (cy + enterY) / 2, 'r=' + num(r, 2), { size: 12, fill: LABEL }))
  }
  art.push(text(W / 2, 360, 'r = mv/(qB) = ' + num(r, 3) + '　T = 2πm/(qB) = ' + num(T, 3), { size: 15, anchor: 'middle', weight: 600 }))
  const svg = frame(String(p.title ?? '带电粒子在匀强磁场中的圆周运动'), art.join(''), '磁场垂直纸面向里（×），洛伦兹力提供向心力')
  return { ok: true, issues, svg, summary: 'r=' + num(r, 3) + '，T=' + num(T, 3), data: { r, T } }
}

/** 双缝干涉：相邻亮纹间距 Δy = Lλ/d */
function renderDoubleSlit(p) {
  const issues = []
  const lambda = Number(p.lambda ?? 550) // nm
  const d = Number(p.d ?? 0.2) // mm
  const L = Number(p.L ?? 1) // m
  if (![lambda, d, L].every((x) => Number.isFinite(x) && x > 0)) issues.push('波长 / 双缝间距 / 屏距都必须大于 0')
  if (issues.length) return { ok: false, issues, svg: null }

  const dy = ((lambda * 1e-9) * L) / (d * 1e-3) // m
  const dyMm = dy * 1000
  const art = []
  // 缝屏
  art.push('<rect x="80" y="100" width="14" height="200" fill="#c9d4e0" stroke="' + INK + '" stroke-width="1.6"/>')
  art.push('<rect x="78" y="186" width="18" height="10" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>')
  art.push('<rect x="78" y="204" width="18" height="10" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>')
  art.push(text(86, 330, '双缝 d=' + num(d, 2) + 'mm', { size: 11.5, anchor: 'middle', fill: LABEL }))
  // 屏
  art.push('<rect x="600" y="60" width="16" height="280" fill="#f6f8fb" stroke="' + INK + '" stroke-width="1.6"/>')
  art.push(text(640, 350, '屏  L=' + num(L, 2) + 'm', { size: 11.5, anchor: 'end', fill: LABEL }))
  // 亮纹
  // 让 ±3 级都落在屏内（以前固定 120px，只看得见 ±1 级）
  const pxPerMm = clamp(126 / (3 * Math.max(dyMm, 0.1)), 3, 26)
  for (let k = -3; k <= 3; k += 1) {
    const y = 200 + k * dyMm * pxPerMm
    if (y < 66 || y > 334) continue
    art.push('<line x1="600" y1="' + f1(y) + '" x2="' + (600 + 58) + '" y2="' + f1(y) + '" stroke="' + (k === 0 ? RED : ACCENT) + '" stroke-width="' + (k === 0 ? 3.4 : 2) + '" opacity="' + (k === 0 ? 0.95 : 0.6) + '"/>')
    if (Math.abs(k) <= 2) art.push(text(566, f1(y + 4), (k === 0 ? '中央亮纹' : (k > 0 ? '+' : '') + k + '级'), { size: 10.5, anchor: 'end', fill: LABEL }))
  }
  // 两条光路
  art.push('<line x1="96" y1="190" x2="600" y2="200" stroke="rgba(10,122,230,.55)" stroke-width="1.2"/>')
  art.push('<line x1="96" y1="209" x2="600" y2="200" stroke="rgba(10,122,230,.55)" stroke-width="1.2"/>')
  art.push(text(W / 2, 372, 'Δy = Lλ/d = ' + num(dyMm, 2) + 'mm　（相邻亮纹间距）', { size: 15, anchor: 'middle', weight: 600 }))
  const svg = frame(String(p.title ?? '双缝干涉'), art.join(''), 'λ=' + num(lambda) + 'nm，d=' + num(d, 2) + 'mm，L=' + num(L, 2) + 'm')
  return { ok: true, issues, svg, summary: 'Δy=' + num(dyMm, 2) + 'mm', data: { dyMm } }
}