/**
 * P0：模式选择页（把 10 个按钮收成 1 个入口）。
 *
 * 用户要求："先布置 API，然后可选择这三个模块"。
 *
 * 做法上刻意**不改动已有按钮的实现**，只做两件事：
 *   1. 用 CSS 把 footer 里那一排功能按钮藏起来（学情 / 填卡 / 聊出来 / AI 帮我写 / AI 收尾）
 *   2. 加一个「＋ 新建角色」，点开模式选择页；选哪张卡就去**程序化点击**对应按钮
 *
 * 为什么用"点击隐藏按钮"这种笨办法：
 *   那五个入口各自带着完整的打开逻辑（有的还要 IPC 预热）。
 *   复制一份逻辑 = 以后两处要同步改；点击原按钮 = 永远只有一份真相。
 */
const STYLE_ID = 'mode-home-style'

const CSS = `
/* footer 只留：保存 / 去学习 / API Key / ＋新建角色 */
.v-studio .footer-bar .pf-entry,
.v-studio .footer-bar .pol-entry,
.v-studio .footer-bar [data-ai] { display: none !important; }

.mh-entry {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 14px; border: 0; border-radius: 999px;
  cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, 0.12);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.mh-entry:hover { background: rgba(10, 132, 255, 0.2); }
.mh-entry:active { transform: scale(0.96); }

.mh-mask {
  position: fixed; inset: 0; z-index: 119; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.32); backdrop-filter: blur(9px);
}
.mh-panel {
  width: min(760px, calc(100vw - 56px)); padding: 26px 28px 22px;
  border-radius: 28px; color: #10151c;
  background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(30px) saturate(180%);
  box-shadow: 0 30px 80px rgba(30, 44, 62, 0.3); -webkit-app-region: no-drag;
}
.mh-title { font-size: 19px; font-weight: 700; }
.mh-sub { margin: 6px 0 18px; font-size: 12.5px; line-height: 1.7; color: #5a6a7a; }

.mh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mh-card {
  text-align: left; border: 0; cursor: pointer; font: inherit;
  padding: 16px 18px; border-radius: 20px; color: #10151c;
  background: rgba(196, 219, 242, 0.26);
  transition: transform 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    background-color 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.mh-card:hover { background: rgba(196, 219, 242, 0.44); transform: translateY(-1px); }
.mh-card:active { transform: scale(0.985); }
.mh-card-name { display: block; font-size: 14.5px; font-weight: 700; margin-bottom: 5px; }
.mh-card-desc { display: block; font-size: 12px; line-height: 1.6; color: #5a6a7a; }
.mh-card-tag {
  display: inline-block; margin-top: 8px; padding: 1px 8px; border-radius: 999px;
  font-size: 10.5px; color: #0a5cc4; background: rgba(10, 132, 255, 0.12);
}
.mh-card-tag.muted { color: #8a97a8; background: rgba(120, 148, 178, 0.16); }
.mh-close { float: right; border: 0; background: transparent; cursor: pointer; color: #5a6a7a; font-size: 14px; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/** 点一下被藏起来的原按钮 —— 保证只有一份实现 */
function clickHidden(text: string): boolean {
  const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
  if (!footer) return false
  const btn = Array.from(footer.querySelectorAll<HTMLElement>('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  )
  if (!btn) return false
  btn.click()
  return true
}

interface ModeSpec {
  name: string
  desc: string
  tag: string
  tagMuted?: boolean
  action: () => void
}

function modes(): ModeSpec[] {
  return [
    {
      name: '自己调参数',
      desc: '12 维滑条 + 教学取向，逐项调到满意。适合知道自己要什么的人。',
      tag: '不需要 API',
      action: () => undefined, // 关掉面板就是调参界面本身
    },
    {
      name: '填一张卡',
      desc: '角色名称、称呼、性格、口头禅……填两三格就能用，空着也行。',
      tag: '不需要 API',
      action: () => clickHidden('填卡'),
    },
    {
      name: '让 AI 写',
      desc: '说一句「来个球叔伴学」，AI 出完整卡 + 一段伴学示例。草稿会留下。',
      tag: '需要 API Key',
      action: () => clickHidden('聊出来'),
    },
    {
      name: '学情画像',
      desc: '学段、当前水平、想学的知识点、忌口 —— 决定他从哪里开始讲。',
      tag: '可选',
      tagMuted: true,
      action: () => clickHidden('学情'),
    },
  ]
}

export function openModeHome(): void {
  ensureStyle()
  const mask = document.createElement('div')
  mask.className = 'mh-mask'
  mask.innerHTML =
    '<div class="mh-panel" role="dialog" aria-label="选择造角色方式">' +
    '<button class="mh-close" data-mh-close aria-label="关闭">✕</button>' +
    '<div class="mh-title">怎么造这个角色？</div>' +
    '<p class="mh-sub">三选一都行，之后随时能换。换了不会丢已经填的内容 —— 它们写的是同一张卡。</p>' +
    '<div class="mh-grid" data-mh-grid></div>' +
    '</div>'
  document.body.appendChild(mask)

  const grid = mask.querySelector<HTMLElement>('[data-mh-grid]')!
  for (const mode of modes()) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mh-card'
    btn.innerHTML =
      '<span class="mh-card-name">' + mode.name + '</span>' +
      '<span class="mh-card-desc">' + mode.desc + '</span>' +
      '<span class="mh-card-tag' + (mode.tagMuted ? ' muted' : '') + '">' + mode.tag + '</span>'
    btn.addEventListener('click', () => {
      mask.remove()
      mode.action()
    })
    grid.appendChild(btn)
  }

  // 底部：引导入口。引导是一次性的，平时不打扰，但得找得到。
  // 用动态 import 是为了不把 onboarding 拉进首屏依赖链。
  const guideBtn = document.createElement('button')
  guideBtn.type = 'button'
  guideBtn.textContent = '第一次用？看一眼引导'
  guideBtn.style.cssText =
    'display:block;margin-top:16px;padding:4px 0;border:0;background:transparent;' +
    'cursor:pointer;font:inherit;font-size:12px;color:#0a5cc4'
  guideBtn.addEventListener('click', () => {
    mask.remove()
    void import('./onboarding').then((m) => {
      m.resetOnboarding()
      m.showOnboarding(true)
    })
  })
  mask.querySelector('.mh-panel')?.appendChild(guideBtn)

  const close = (): void => mask.remove()
  mask.querySelector('[data-mh-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })
}

export function installModeHomeEntry(): void {
  ensureStyle()
  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.mh-entry')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mh-entry'
    btn.textContent = '＋ 新建角色'
    btn.title = '选择造角色方式：调参数 / 填卡 / 让 AI 写'
    btn.addEventListener('click', openModeHome)
    footer.prepend(btn)
  }
  window.setTimeout(() => {
    paint()
    new MutationObserver(() => paint()).observe(document.body, { childList: true, subtree: true })
  }, 520)
}
