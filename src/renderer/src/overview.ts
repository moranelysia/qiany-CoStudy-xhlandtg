/**
 * 学习者画像面板（W2 的「学习者画像」按钮要打开的东西）。
 *
 * 【为什么做成浮层而不是塞进某一栏】
 *   这个面板在三个变体里都会被打开（Studio 侧栏、Wizard 侧栏、学习页抽屉）。
 *   塞进任何一栏都只能在那一个变体里用；浮层是唯一一处实现、到处能用。
 *
 * 【为什么数字全是真数据】
 *   画像的每一行都来自主进程的 `learn:overview`：知识点表、错题本、间隔重复队列。
 *   界面上不出现"演示数据"——这也是方案表 R8 的要求（窗口里没有假数据）。
 */
interface OverviewDue {
  name: string
  subject: string
  nextReview: string
  mastery: number
}

interface OverviewMistake {
  point: string
  errorType: string
  wrongStep: string
  recurrences: number
}

export interface Overview {
  card: { name: string; emoji: string; address: string }
  stage: string
  profile: {
    subjects: Array<{ subject: string; points: number; avgMastery: number }>
    weakPoints: Array<{ name: string; mastery: number }>
    errorTypes: Array<{ type: string; count: number }>
    counts: { points: number; dueToday: number; mistakes: number; openMistakes: number }
  }
  due: OverviewDue[]
  mistakes: OverviewMistake[]
  session: { phase: string; goal: string; taught: number; total: number } | null
}

let panel: HTMLElement | null = null

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function pct(value: number): string {
  return Math.round(value * 100) + '%'
}

function render(data: Overview): string {
  const weak = data.profile.weakPoints.length
    ? data.profile.weakPoints
        .map((p) => `<li><b>${esc(p.name)}</b><span class="ov-val">掌握 ${pct(p.mastery)}</span></li>`)
        .join('')
    : '<li class="ov-empty">还没有记录过知识点</li>'

  const due = data.due.length
    ? data.due
        .slice(0, 6)
        .map(
          (d) =>
            `<li><b>${esc(d.name)}</b><span class="ov-val">${esc(d.subject || '未分类')} · ${esc(
              d.nextReview,
            )}</span></li>`,
        )
        .join('')
    : '<li class="ov-empty">今天没有到期要复习的</li>'

  const mistakes = data.mistakes.length
    ? data.mistakes
        .slice(0, 6)
        .map(
          (m) =>
            `<li><b>${esc(m.point)}</b><span class="ov-val">${esc(m.errorType)}${
              m.wrongStep ? ' · ' + esc(m.wrongStep) : ''
            }${m.recurrences > 0 ? ' · 复发 ' + m.recurrences : ''}</span></li>`,
        )
        .join('')
    : '<li class="ov-empty">没有未纠正的错题</li>'

  const subjects = data.profile.subjects.length
    ? data.profile.subjects
        .map((s) => `<span class="ov-chip">${esc(s.subject)} ${pct(s.avgMastery)}<i>${s.points} 点</i></span>`)
        .join('')
    : '<span class="ov-chip ov-empty-chip">还没有学科数据</span>'

  const sessionLine = data.session
    ? `当前会话：${esc(data.session.phase)}${data.session.goal ? ' · ' + esc(data.session.goal) : ''}` +
      (data.session.total ? `（${data.session.taught}/${data.session.total} 个知识点）` : '')
    : '还没有进行中的会话'

  return `
    <div class="ov-head">
      <span class="ov-title">学习者画像</span>
      <button class="ov-close" data-ov-close aria-label="关闭">✕</button>
    </div>
    <p class="ov-sub">全部来自本机记录：知识点、错题本、复习队列。<span class="ov-who">${esc(
      data.card.name,
    )} · ${esc(data.stage)}</span></p>

    <div class="ov-sec">
      <div class="ov-sec-title">各科掌握度</div>
      <div class="ov-chips">${subjects}</div>
    </div>

    <div class="ov-sec">
      <div class="ov-sec-title">最薄弱</div>
      <ul class="ov-list">${weak}</ul>
    </div>

    <div class="ov-sec">
      <div class="ov-sec-title">还没弄明白（错题本）</div>
      <ul class="ov-list">${mistakes}</ul>
    </div>

    <div class="ov-sec">
      <div class="ov-sec-title">今天该复习</div>
      <ul class="ov-list">${due}</ul>
    </div>

    <div class="ov-foot">
      <span>${sessionLine}</span>
      <span>共 ${data.profile.counts.points} 个知识点 · ${data.profile.counts.mistakes} 条错题</span>
    </div>
  `
}

const STYLE = `
.ov-mask { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.28); backdrop-filter: blur(6px); }
.ov-panel { width: min(560px, calc(100vw - 48px)); max-height: min(78vh, 720px); overflow-y: auto;
  padding: 20px 22px 16px; border-radius: 26px; color: var(--label-1, #10151c);
  background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 24px 70px rgba(30, 44, 62, 0.24); -webkit-app-region: no-drag; }
.ov-head { display: flex; align-items: center; justify-content: space-between; }
.ov-title { font-size: 17px; font-weight: 700; }
.ov-close { border: 0; background: transparent; font-size: 14px; cursor: pointer; color: var(--label-2, #5a6a7a); }
.ov-sub { margin: 6px 0 14px; font-size: 12px; color: var(--label-2, #5a6a7a); }
.ov-who { margin-left: 8px; font-weight: 600; }
.ov-sec { margin-bottom: 14px; }
.ov-sec-title { font-size: 12px; font-weight: 700; color: var(--label-2, #5a6a7a); margin-bottom: 6px; }
.ov-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ov-chip { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  background: rgba(0, 122, 255, 0.1); color: #0a5cc4; }
.ov-chip i { margin-left: 6px; font-style: normal; font-weight: 400; color: #3c5c86; }
.ov-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
.ov-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  font-size: 13px; padding: 5px 8px; border-radius: 10px; background: rgba(120, 148, 178, 0.09); }
.ov-val { font-size: 12px; color: var(--label-2, #5a6a7a); flex: 0 0 auto; }
.ov-empty, .ov-empty-chip { color: var(--label-2, #5a6a7a); font-weight: 400; background: transparent; }
.ov-foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 10px;
  border-top: 1px solid rgba(120, 148, 178, 0.2); font-size: 12px; color: var(--label-2, #5a6a7a); }
`

function ensureStyle(): void {
  if (document.getElementById('ov-style')) return
  const style = document.createElement('style')
  style.id = 'ov-style'
  style.textContent = STYLE
  document.head.appendChild(style)
}

export async function openOverview(): Promise<void> {
  ensureStyle()
  if (panel) {
    panel.remove()
    panel = null
  }

  const api = window.costudy
  if (!api?.learnOverview) {
    window.__toast?.('画像数据没接上（preload 未暴露 learnOverview）')
    return
  }

  const data = await api.learnOverview()
  const mask = document.createElement('div')
  mask.className = 'ov-mask'
  const box = document.createElement('div')
  box.className = 'ov-panel'
  box.innerHTML = render(data)
  mask.appendChild(box)
  document.body.appendChild(mask)
  panel = mask

  const close = (): void => {
    mask.remove()
    panel = null
  }
  box.querySelector('[data-ov-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close()
    },
    { once: true },
  )
}

export function closeOverview(): void {
  panel?.remove()
  panel = null
}
