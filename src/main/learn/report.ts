/**
 * 学习报告（第五阶段：可视化）。
 *
 * 为什么不直接在界面上改一通：
 *   界面是原型变体 + MutationObserver 拼出来的，改渲染容易碰坏别的东西；
 *   而"一节课到底发生了什么"更适合一份能导出、能打印、能截图的静态报告 ——
 *   答辩现场打开就是一张图，比赛材料里也能直接引用。
 *
 * 这一份 HTML 完全自包含（无外链、无脚本），双击就能看。
 */
import { PHASES, PHASE_LABEL, type Phase, type SessionState } from './session'

export interface ReportInput {
  session: SessionState
  /** 今天/该复习的点 */
  due?: Array<{ name: string; mastery: number; nextReview: string }>
  /** 错题（取最近的几条） */
  mistakes?: Array<{ point: string; errorType: string; wrongStep?: string; recurrences?: number }>
  generatedAt?: string
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pct(n: number): string {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) + '%'
}

function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase)
}

/** 七阶段时间线：走过的打勾、当前的高亮、没到的置灰 */
function timeline(session: SessionState): string {
  const visited = new Set(session.trail.map((t) => t.phase))
  const current = phaseIndex(session.phase)
  return PHASES.map((p, i) => {
    const state = i === current ? 'now' : visited.has(p) ? 'done' : 'todo'
    const mark = i === current ? '●' : visited.has(p) ? '✓' : '○'
    const at = session.trail.filter((t) => t.phase === p).slice(-1)[0]?.at
    const when = at ? new Date(at).toLocaleString('zh-CN', { hour12: false }) : ''
    return `<li class="step ${state}">
      <span class="dot">${mark}</span>
      <span class="name">${esc(PHASE_LABEL[p])}</span>
      <span class="when">${esc(when)}</span>
    </li>`
  }).join('')
}

/** 知识点：讲过/没讲 + 掌握度条 */
function pointsTable(session: SessionState): string {
  if (!session.points.length) {
    return '<p class="empty">这一节还没有拆出知识点。</p>'
  }
  const rows = session.points
    .map((p, i) => {
      const active = i === session.activeIndex && !p.taught
      return `<tr class="${p.taught ? 'taught' : active ? 'active' : ''}">
        <td class="idx">${i + 1}</td>
        <td class="pname">${esc(p.name)}${active ? ' <span class="badge">当前</span>' : ''}</td>
        <td class="state">${p.taught ? '已讲' : '未讲'}</td>
        <td class="bar-cell">
          <span class="bar"><i style="width:${pct(p.mastery)}"></i></span>
          <span class="num">${pct(p.mastery)}</span>
        </td>
      </tr>`
    })
    .join('')
  return `<table class="pts">
    <thead><tr><th>#</th><th>知识点</th><th>状态</th><th>掌握度</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function checkCard(session: SessionState): string {
  const c = session.lastCheck
  if (!c) return '<p class="empty">还没有进行过阶段检验。</p>'
  const verdict =
    c.verdict === 'correct' ? '答对' : c.verdict === 'wrong' ? '答错' : '判不出来'
  const cls = c.verdict === 'correct' ? 'ok' : c.verdict === 'wrong' ? 'bad' : 'mid'
  return `<div class="check ${cls}">
    <div class="q">${esc(c.question)}</div>
    <div class="meta"><b>${esc(verdict)}</b> · ${esc(c.point || '未标注知识点')} · ${esc(
      new Date(c.at).toLocaleString('zh-CN', { hour12: false }),
    )}</div>
  </div>`
}

function dueList(due: ReportInput['due']): string {
  if (!due || !due.length) return '<p class="empty">暂时没有待复习的知识点。</p>'
  return `<ul class="due">${due
    .map((d) => `<li>${esc(d.name)} <span class="muted">掌握度 ${pct(d.mastery)} · 建议 ${esc(d.nextReview)} 复习</span></li>`)
    .join('')}</ul>`
}

function mistakeList(mistakes: ReportInput['mistakes']): string {
  if (!mistakes || !mistakes.length) return '<p class="empty">这节没有新增错题。</p>'
  return `<ul class="mistakes">${mistakes
    .map(
      (m) =>
        `<li><b>${esc(m.point)}</b> · ${esc(m.errorType)}${
          m.wrongStep ? `：${esc(m.wrongStep)}` : ''
        }${m.recurrences ? ` <span class="muted">（复发 ${m.recurrences} 次）</span>` : ''}</li>`,
    )
    .join('')}</ul>`
}

export function buildSessionReportHtml(input: ReportInput): string {
  const { session } = input
  const at = input.generatedAt ?? new Date().toISOString()
  const done = session.points.filter((p) => p.taught).length
  const avg = session.points.length
    ? session.points.reduce((s, p) => s + p.mastery, 0) / session.points.length
    : 0

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>学习报告 · ${esc(session.goal || '未命名会话')}</title>
<style>
  :root{--ink:#e9eef8;--dim:#93a2c4;--line:#ffffff1a;--ok:#3fe0a8;--bad:#ff7a8a;--mid:#ffcc66;--accent:#8b7bff}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px;background:radial-gradient(900px 600px at 15% -10%,#1a2350 0,transparent 60%),#0b1020;color:var(--ink);
       font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.7}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:24px;margin:0 0 4px}
  .sub{color:var(--dim);font-size:13px;margin-bottom:26px}
  section{background:#ffffff08;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:0 0 16px}
  h2{font-size:14px;letter-spacing:2px;color:var(--dim);margin:0 0 14px;font-weight:600}
  .kpis{display:flex;gap:26px;flex-wrap:wrap}
  .kpi b{display:block;font-size:22px}
  .kpi span{color:var(--dim);font-size:12px}
  ol.steps{list-style:none;display:flex;gap:6px;padding:0;margin:0;flex-wrap:wrap}
  .step{flex:1 1 100px;min-width:96px;border:1px solid var(--line);border-radius:10px;padding:10px 8px;text-align:center;font-size:12px}
  .step .dot{display:block;font-size:15px;margin-bottom:4px}
  .step .name{display:block}
  .step .when{display:block;color:var(--dim);font-size:10px;margin-top:2px;min-height:12px}
  .step.done{border-color:#3fe0a855;color:#bfe9dc}
  .step.now{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset;color:#fff}
  .step.todo{opacity:.45}
  table.pts{width:100%;border-collapse:collapse;font-size:13px}
  .pts th{text-align:left;color:var(--dim);font-weight:500;font-size:12px;padding:0 8px 8px}
  .pts td{padding:8px;border-top:1px solid var(--line);vertical-align:middle}
  .pts .idx{color:var(--dim);width:24px}
  .pts .state{color:var(--dim);width:56px}
  .pts tr.active .pname{color:var(--accent)}
  .bar{display:inline-block;width:140px;height:6px;background:#ffffff14;border-radius:99px;overflow:hidden;vertical-align:middle}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#3fe0d0,#8b7bff)}
  .num{color:var(--dim);font-size:12px;margin-left:8px}
  .badge{background:var(--accent);color:#0b1020;border-radius:99px;padding:1px 7px;font-size:11px}
  .check{border-left:3px solid var(--mid);padding:8px 12px;background:#ffffff06;border-radius:8px}
  .check.ok{border-color:var(--ok)} .check.bad{border-color:var(--bad)}
  .check .q{font-size:13px}
  .check .meta{color:var(--dim);font-size:12px;margin-top:6px}
  ul.due,ul.mistakes{margin:0;padding-left:18px;font-size:13px}
  ul.due li,ul.mistakes li{margin:6px 0}
  .muted{color:var(--dim);font-size:12px}
  .empty{color:var(--dim);font-size:13px;margin:0}
  footer{color:var(--dim);font-size:11px;text-align:center;margin-top:18px}
  @media print{body{background:#fff;color:#111}section{border-color:#ddd;background:#fff}}
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(session.goal || '学习报告')}</h1>
  <div class="sub">会话 ${esc(session.id)} · 生成于 ${esc(new Date(at).toLocaleString('zh-CN', { hour12: false }))}</div>

  <section>
    <h2>总体</h2>
    <div class="kpis">
      <div class="kpi"><b>${esc(PHASE_LABEL[session.phase])}</b><span>当前阶段</span></div>
      <div class="kpi"><b>${done}/${session.points.length || 0}</b><span>讲完的知识点</span></div>
      <div class="kpi"><b>${pct(avg)}</b><span>平均掌握度</span></div>
      <div class="kpi"><b>${session.weaknesses.length}</b><span>探测到的薄弱点</span></div>
    </div>
  </section>

  <section>
    <h2>七阶段进度</h2>
    <ol class="steps">${timeline(session)}</ol>
  </section>

  <section>
    <h2>知识点与掌握度</h2>
    ${pointsTable(session)}
  </section>

  <section>
    <h2>最近一次检验</h2>
    ${checkCard(session)}
  </section>

  <section>
    <h2>待复习</h2>
    ${dueList(input.due)}
  </section>

  <section>
    <h2>错题</h2>
    ${mistakeList(input.mistakes)}
  </section>

  <footer>数据来自本地会话文件 · 由 CoStudy 生成</footer>
</div>
</body>
</html>
`
}
