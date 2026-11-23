/**
 * 学习报告（第五阶段：可视化）。
 *
 * 为什么不直接在界面上改一通：
 *   界面是原型变体 + MutationObserver 拼出来的，改渲染容易碰坏别的东西；
 *   而"一节课到底发生了什么"更适合一份能导出、能打印、能截图的静态报告 ——
 *   答辩现场打开就是一张图，比赛材料里也能直接引用。
 *
 * 视觉沿用主界面的设计令牌（src/renderer/src/styles/tokens.css）：
 *   白卡片 + #f5f5f7 页面底 + #0a84ff 主色 + 细分割线，不另起一套配色。
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

/** 七阶段进度：走过的打勾、当前高亮、没到的置灰 */
function timeline(session: SessionState): string {
  const visited = new Set(session.trail.map((t) => t.phase))
  const current = phaseIndex(session.phase)
  return PHASES.map((p, i) => {
    const state = i === current ? 'now' : visited.has(p) ? 'done' : 'todo'
    const mark = i === current ? '●' : visited.has(p) ? '✓' : '○'
    const at = session.trail.filter((t) => t.phase === p).slice(-1)[0]?.at
    const when = at
      ? new Date(at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : ''
    return `<li class="step ${state}"><span class="dot">${mark}</span><span class="name">${esc(PHASE_LABEL[p])}</span><span class="when">${esc(when)}</span></li>`
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
      return `<tr class="${active ? 'active' : ''}">
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
  const verdict = c.verdict === 'correct' ? '答对' : c.verdict === 'wrong' ? '答错' : '判不出来'
  const cls = c.verdict === 'correct' ? 'ok' : c.verdict === 'wrong' ? 'bad' : 'mid'
  return `<div class="check ${cls}">
    <div class="q">${esc(c.question)}</div>
    <div class="meta"><b>${esc(verdict)}</b><span class="sep">·</span>${esc(
      c.point || '未标注知识点',
    )}<span class="sep">·</span>${esc(new Date(c.at).toLocaleString('zh-CN', { hour12: false }))}</div>
  </div>`
}

function dueList(due: ReportInput['due']): string {
  if (!due || !due.length) return '<p class="empty">暂时没有待复习的知识点。</p>'
  return `<ul class="plain">${due
    .map(
      (d) =>
        `<li><span class="li-name">${esc(d.name)}</span><span class="muted">掌握度 ${pct(
          d.mastery,
        )} · 建议 ${esc(d.nextReview)} 复习</span></li>`,
    )
    .join('')}</ul>`
}

function mistakeList(mistakes: ReportInput['mistakes']): string {
  if (!mistakes || !mistakes.length) return '<p class="empty">这节没有新增错题。</p>'
  return `<ul class="plain">${mistakes
    .map(
      (m) =>
        `<li><span class="li-name">${esc(m.point)}</span><span class="tag">${esc(
          m.errorType,
        )}</span>${m.wrongStep ? `<span class="muted">${esc(m.wrongStep)}</span>` : ''}${
          m.recurrences ? `<span class="muted">复发 ${m.recurrences} 次</span>` : ''
        }</li>`,
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
  /* 令牌与主界面一致：src/renderer/src/styles/tokens.css */
  :root{
    --ground:#ffffff; --bg:#f5f5f7; --tone-2:#ebebef; --tone-3:#e0e0e5;
    --ink:#1d1d1f; --ink-2:#6e6e73; --ink-3:#86868b; --hairline:#d2d2d7;
    --blue:#0a84ff; --blue-tint:rgba(10,132,255,.10);
    --green:#1d9a4b; --red:#d70015; --amber:#b25000;
    --r-md:14px; --r-sm:10px;
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Noto Sans SC","Microsoft YaHei UI","Microsoft YaHei",sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);
       font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:880px;margin:0 auto;padding:34px 22px 40px}

  /* 抬头 */
  header{display:flex;align-items:center;gap:10px;margin-bottom:22px}
  .logo{font-size:19px;font-weight:700;letter-spacing:-.2px}
  .logo b{color:var(--blue);font-weight:800}
  .logo span{color:var(--ink)}
  .doc-tag{margin-left:auto;font-size:12px;color:var(--ink-3)}
  h1{font-size:23px;line-height:1.3;margin:0 0 6px;font-weight:650;letter-spacing:-.2px}
  .sub{color:var(--ink-3);font-size:12.5px;margin-bottom:22px}

  section{background:var(--ground);border:1px solid rgba(0,0,0,.055);border-radius:var(--r-md);
          padding:18px 20px;margin:0 0 12px}
  h2{font-size:12px;font-weight:600;color:var(--ink-3);letter-spacing:.06em;margin:0 0 14px}

  /* 关键指标 */
  .kpis{display:flex;gap:8px;flex-wrap:wrap}
  .kpi{flex:1 1 120px;background:var(--bg);border-radius:var(--r-sm);padding:12px 14px}
  .kpi b{display:block;font-size:22px;font-weight:650;letter-spacing:-.3px;line-height:1.2}
  .kpi.hl b{color:var(--blue)}
  .kpi span{color:var(--ink-3);font-size:12px}

  /* 七阶段 */
  ol.steps{list-style:none;display:flex;gap:6px;padding:0;margin:0}
  .step{flex:1;min-width:0;border:1px solid var(--tone-3);border-radius:var(--r-sm);
        padding:9px 6px;text-align:center;background:var(--ground)}
  .step .dot{display:block;font-size:12px;line-height:1;margin-bottom:5px;color:var(--ink-3)}
  .step .name{display:block;font-size:12px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .step .when{display:block;font-size:10px;color:var(--ink-3);margin-top:3px;min-height:12px;white-space:nowrap;overflow:hidden}
  .step.done{border-color:rgba(10,132,255,.28);background:var(--blue-tint)}
  .step.done .dot{color:var(--blue)}
  .step.done .name{color:var(--ink)}
  .step.now{border-color:var(--blue);background:var(--blue-tint);box-shadow:0 0 0 1px var(--blue) inset}
  .step.now .dot,.step.now .name{color:var(--blue);font-weight:600}

  /* 知识点表 */
  table.pts{width:100%;border-collapse:collapse;font-size:13px}
  .pts th{text-align:left;color:var(--ink-3);font-weight:500;font-size:12px;padding:0 8px 8px}
  .pts td{padding:9px 8px;border-top:1px solid var(--tone-2);vertical-align:middle}
  .pts tr.active td{background:#fafcff}
  .pts .idx{color:var(--ink-3);width:26px}
  .pts .state{color:var(--ink-3);width:52px}
  .pts .pname{font-weight:500}
  .bar{display:inline-block;width:150px;height:6px;background:var(--tone-2);border-radius:99px;
       overflow:hidden;vertical-align:middle}
  .bar i{display:block;height:100%;background:var(--blue);border-radius:99px}
  .num{color:var(--ink-2);font-size:12px;margin-left:8px;font-variant-numeric:tabular-nums}
  .badge{background:var(--blue-tint);color:var(--blue);border-radius:99px;padding:1px 7px;font-size:11px;font-weight:600}

  /* 检验 */
  .check{background:var(--bg);border-radius:var(--r-sm);padding:12px 14px;border-left:3px solid var(--ink-3)}
  .check.ok{border-left-color:var(--green)}
  .check.bad{border-left-color:var(--red)}
  .check.mid{border-left-color:var(--amber)}
  .check .q{font-size:13.5px}
  .check .meta{color:var(--ink-3);font-size:12px;margin-top:6px}
  .check .meta b{color:var(--ink);font-weight:600}
  .sep{margin:0 6px}

  /* 列表 */
  ul.plain{list-style:none;margin:0;padding:0}
  ul.plain li{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--tone-2);font-size:13px}
  ul.plain li:first-child{border-top:0;padding-top:2px}
  .li-name{font-weight:500}
  .tag{background:var(--bg);border-radius:6px;padding:1px 7px;font-size:11.5px;color:var(--ink-2)}
  .muted{color:var(--ink-3);font-size:12px}
  .empty{color:var(--ink-3);font-size:13px;margin:0}

  footer{color:var(--ink-3);font-size:11.5px;text-align:center;margin-top:20px}
  @media print{
    body{background:#fff}
    .wrap{max-width:none;padding:0}
    section{break-inside:avoid;border-color:#e5e5ea}
    .kpi{background:#f7f7f9}
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo"><b>Co</b><span>Study</span></div>
    <div class="doc-tag">学习报告</div>
  </header>

  <h1>${esc(session.goal || '学习报告')}</h1>
  <div class="sub">会话 ${esc(session.id)} · 生成于 ${esc(
    new Date(at).toLocaleString('zh-CN', { hour12: false }),
  )}</div>

  <section>
    <h2>总体</h2>
    <div class="kpis">
      <div class="kpi hl"><b>${esc(PHASE_LABEL[session.phase])}</b><span>当前阶段</span></div>
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

  <footer>由 CoStudy 生成 · 数据来自本地会话文件</footer>
</div>
</body>
</html>
`
}
