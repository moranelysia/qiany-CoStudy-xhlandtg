/**
 * 「收起参数」开关。
 *
 * 需求原话：把「性格维度 / 教学取向」这些藏起来。
 * 这两块加起来占掉编辑器一整屏，只是换个语气、或者想专心看预览的时候特别碍事。
 *
 * 【为什么不改 studio.js】
 *   那三个变体是原型阶段的代码，界面的结构归它管。这里只做一层薄接线：
 *   挂载后往「性格维度」的标题行塞一个开关，收起时用两条 CSS 规则把内容藏掉。
 *   原型再改结构，这里最多是"开关不出现"，不会把它的渲染搞坏。
 *
 * 【为什么状态存 localStorage】
 *   这是纯偏好，不属于角色卡数据，不该写到卡里；重启后应该还记得。
 */

const STORE_KEY = 'costudy.params.collapsed'

const STYLE = `
.v-studio .panel-head[data-params-head] { justify-content: flex-start; gap: 10px; }
.v-studio .panel-head[data-params-head] > .panel-name { margin-right: auto; }
.v-studio .panel-head[data-params-head] > [data-params-toggle] { margin-left: 0; }

/* 收起 / 展开：做成一颗看得出能点的胶囊（不是一行小字）。
   字号 13 / 高 32 / 带图标 / 带淡蓝底 —— 用户反馈过原来"引导性太小"。 */
.v-studio [data-params-toggle] {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.004em;
  color: #0a5cc4;
  background: rgba(10, 132, 255, .11);
  box-shadow: inset 0 0 0 1px rgba(10, 132, 255, .20);
  cursor: pointer;
  transition: background-color .15s ease, box-shadow .15s ease, transform .12s ease;
}
.v-studio [data-params-toggle]:hover {
  background: rgba(10, 132, 255, .20);
  box-shadow: inset 0 0 0 1px rgba(10, 132, 255, .30);
}
.v-studio [data-params-toggle]:active { transform: scale(.97); }
.v-studio [data-params-toggle] .pcaret {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
}

/* 收起时给一句提示，别让人以为面板丢了 */
.v-studio section.panel[data-params-collapsed]::after {
  content: '12 维滑条与教学取向已收起，点「展开参数」随时调';
  display: block;
  margin: 8px 0 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--label-2);
}

/* 收起：维度滑条整块、以及紧跟着的那块（教学取向）一起藏掉 */
.v-studio section.panel[data-params-collapsed] [data-dims] { display: none; }
.v-studio section.panel:has([data-dims])[data-params-collapsed] + section.panel { display: none; }
`

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(STORE_KEY, v ? '1' : '0')
  } catch {
    /* 存不了就算了，只是下次不记得 */
  }
}

function ensureStyle(): void {
  if (document.querySelector('[data-params-style]')) return
  const el = document.createElement('style')
  el.setAttribute('data-params-style', '')
  el.textContent = STYLE
  document.head.appendChild(el)
}

/** 「性格维度」那一块：包含 [data-dims] 的 section.panel */
function paramsPanel(): HTMLElement | null {
  const dims = document.querySelector<HTMLElement>('.v-studio [data-dims]')
  return dims ? dims.closest<HTMLElement>('section.panel') : null
}

function applyState(section: HTMLElement, collapsed: boolean): void {
  section.toggleAttribute('data-params-collapsed', collapsed)
  const btn = section.querySelector<HTMLElement>('[data-params-toggle]')
  if (!btn) return
  const label = btn.querySelector<HTMLElement>('[data-params-label]')
  if (label) label.textContent = collapsed ? '展开参数' : '收起参数'
  // 箭头直接换字符，不用 transform 转 —— 这台机器上 CSS transition 会卡在 0%，
  // 转了也看不出来（实测 computed transform 一直是单位矩阵）。
  const caret = btn.querySelector<HTMLElement>('.pcaret')
  if (caret) caret.textContent = collapsed ? '▼' : '▲'
  btn.title = collapsed ? '展开性格维度与教学取向' : '收起性格维度与教学取向'
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
}

function injectInto(section: HTMLElement): void {
  const head = section.querySelector<HTMLElement>('.panel-head')
  if (!head) return
  head.setAttribute('data-params-head', '')

  const btn = document.createElement('button')
  // 不挂原型那套 .btn/.ghost：那两条规则会来抢高度和内边距，尺寸全由 STYLE 说了算
  btn.className = 'params-toggle'
  btn.setAttribute('data-params-toggle', '')
  btn.setAttribute('type', 'button')
  // 尺寸/配色全在 STYLE 里，别在这里写 inline style —— 会被上面那套规则覆盖掉优先级
  btn.innerHTML =
    '<span data-params-label>收起参数</span>' +
    '<span class="pcaret" aria-hidden="true">▲</span>'
  btn.addEventListener('click', () => {
    const next = !section.hasAttribute('data-params-collapsed')
    applyState(section, next)
    writeCollapsed(next)
  })
  head.appendChild(btn)
  applyState(section, readCollapsed())
}

/**
 * 挂载一次就够：内部用 MutationObserver 盯着变体重建，
 * 面板一换新的就重新接线。注入是幂等的（已存在就只同步状态），
 * 所以它自己写进 DOM 的那点变化不会引出无限重画。
 */
export function installParamsToggle(): void {
  let timer = 0
  const pass = (): void => {
    const section = paramsPanel()
    if (!section) return
    ensureStyle()
    if (!section.querySelector('[data-params-toggle]')) injectInto(section)
    else applyState(section, section.hasAttribute('data-params-collapsed'))
  }

  window.setTimeout(pass, 300)
  new MutationObserver(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(pass, 120)
  }).observe(document.body, { childList: true, subtree: true })
}
