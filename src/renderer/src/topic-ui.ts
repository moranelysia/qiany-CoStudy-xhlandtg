/**
 * 「改所学内容」对话框。
 *
 * 【为什么需要它】
 *   伴学页原来把课程写死成「数学 · 一元二次方程」，等于这个应用只会教二次方程。
 *   学习者应该能自己定：学哪个学段、学什么科目/主题、今天想达成什么。
 *
 * 三项都存到 记忆/学习主题.json，保存后派发 `costudy:topic-changed`，
 * 伴学页收到就重渲染头部，不用刷新。
 */
const STAGES = ['小学', '初中', '高中', '大学', '成人自学', '不限']

const STYLE_ID = 'topic-ui-style'

const CSS = `
.tp-mask {
  position: fixed; inset: 0; z-index: 121; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.32); -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px);
}
.tp-panel {
  width: min(520px, calc(100vw - 56px));
  padding: 22px 24px 18px;
  border-radius: 24px;
  color: #10151c;
  background: rgba(255, 255, 255, 0.95);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%);
  box-shadow: 0 30px 80px rgba(30, 44, 62, 0.3);
  -webkit-app-region: no-drag;
}
.tp-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.tp-sub { margin: 6px 0 16px; font-size: 12.5px; line-height: 1.7; color: #5a6a7a; }
.tp-field { display: block; margin-bottom: 13px; }
.tp-label { display: block; font-size: 12px; color: #5a6a7a; margin-bottom: 6px; }
.tp-input,
.tp-select {
  width: 100%; box-sizing: border-box; height: 38px; padding: 0 12px;
  border: 0; border-radius: 12px; font: inherit; font-size: 13px; color: inherit;
  background: rgba(196, 219, 242, 0.28);
  box-shadow: inset 0 0 0 1px rgba(92, 118, 152, 0.12);
}
.tp-input:focus, .tp-select:focus { outline: none; box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.16); }
.tp-hint { margin-top: 5px; font-size: 11.5px; color: #8a97a8; }
.tp-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.tp-btn {
  height: 34px; padding: 0 16px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 600;
  background: rgba(120, 148, 178, 0.16); color: #10151c;
}
.tp-btn:hover { background: rgba(120, 148, 178, 0.26); }
.tp-btn.primary { background: #0a84ff; color: #fff; }
.tp-btn.primary:hover { background: #0a74e0; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

let current: HTMLElement | null = null

/** 打开对话框；保存成功后 resolve，取消则 resolve 但不改数据 */
export async function openTopicDialog(): Promise<void> {
  ensureStyle()
  const api = window.costudy
  if (!api?.learnTopic || !api.learnTopicSet) {
    window.__toast?.('学习主题接口不可用')
    return
  }
  if (current) current.remove()

  const topic = await api.learnTopic()

  const mask = document.createElement('div')
  mask.className = 'tp-mask'
  mask.innerHTML =
    '<div class="tp-panel" role="dialog" aria-label="改所学内容">' +
    '<div class="tp-title">今天学什么？</div>' +
    '<p class="tp-sub">学段、科目、目标都可以自己定 —— 不限学科，也不限年龄。</p>' +
    '<label class="tp-field"><span class="tp-label">学段</span>' +
    '<select class="tp-select" data-tp-stage>' +
    STAGES.map((s) => `<option value="${s}">${s}</option>`).join('') +
    '</select></label>' +
    '<label class="tp-field"><span class="tp-label">科目 · 主题</span>' +
    '<input class="tp-input" data-tp-course placeholder="数学 · 一元二次方程 / 英语 · 现在完成时 / 编程 · 递归" />' +
    '<span class="tp-hint">写成「科目 · 具体内容」最清楚</span></label>' +
    '<label class="tp-field"><span class="tp-label">今天的目标</span>' +
    '<input class="tp-input" data-tp-goal placeholder="今天想让 TA 帮你搞定什么？" /></label>' +
    '<div class="tp-actions">' +
    '<button class="tp-btn" data-tp-cancel>取消</button>' +
    '<button class="tp-btn primary" data-tp-save>保存</button>' +
    '</div></div>'
  document.body.appendChild(mask)
  current = mask

  const stageEl = mask.querySelector<HTMLSelectElement>('[data-tp-stage]')
  const courseEl = mask.querySelector<HTMLInputElement>('[data-tp-course]')
  const goalEl = mask.querySelector<HTMLInputElement>('[data-tp-goal]')
  if (stageEl) stageEl.value = STAGES.includes(topic.stage) ? topic.stage : '高中'
  if (courseEl) courseEl.value = topic.course
  if (goalEl) goalEl.value = topic.goal

  const close = (): void => {
    mask.remove()
    if (current === mask) current = null
  }

  mask.querySelector('[data-tp-cancel]')?.addEventListener('click', close)
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

  mask.querySelector('[data-tp-save]')?.addEventListener('click', () => {
    void (async () => {
      const next = await api.learnTopicSet({
        stage: stageEl?.value ?? topic.stage,
        course: courseEl?.value ?? topic.course,
        goal: goalEl?.value ?? topic.goal,
      })
      close()
      window.__toast?.('已改成「' + next.course + '」')
      window.dispatchEvent(new CustomEvent('costudy:topic-changed', { detail: next }))
    })()
  })

  // 打开就聚焦到「科目 · 主题」，多数人是来改这个的
  window.setTimeout(() => courseEl?.focus(), 40)
}
