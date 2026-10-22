// 入口：把界面装进 Electron 渲染进程
// 样式顺序必须和原型一致，否则透明会失效：
//   tokens     设计变量 + 基础组件
//   liquid-glass 玻璃材质（注意它里面有 body { background: var(--ground) }，会把外壳涂白）
//   transparent  外壳透明 + 背景层（必须排在 liquid-glass 之后才能覆盖掉那层白）
//   gradient-type 标题渐变
//   panel-gradient 面板渐变与玻璃光晕
//   liquid-input  文字框的液态玻璃
//   squircle      连续曲率圆角 + 去白边（必须最后，它会覆盖前面的圆角与边框）
import './styles/tokens.css'
import './styles/liquid-glass.css'
import './styles/transparent.css'
import './styles/gradient-type.css'
import './styles/panel-gradient.css'
import './styles/liquid-input.css'
import './styles/squircle.css'

// 原型是纯 JS 模块，这里按值导入；类型交给 allowJs，不做 checkJs
import { mount as mountStudio } from './app/studio.js'
import { mount as mountWizard } from './app/wizard.js'
import { mount as mountCompanion } from './app/companion.js'
import { initGlass } from './app/ui.js'
import { syncCardsToRail } from './cards-ui'

type Mount = (stage: HTMLElement) => void

const VARIANTS: Mount[] = [mountStudio, mountWizard, mountCompanion]

/** 原型里的提示条依赖 window.__toast，这里补一个最小实现 */
function installToast(): void {
  const host = document.getElementById('toasts')
  if (!host) return
  ;(window as unknown as Record<string, unknown>).__toast = (msg: string): void => {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = msg
    host.appendChild(el)
    setTimeout(() => el.style.opacity = '0', 2000)
    setTimeout(() => el.remove(), 2240)
  }
}

/**
 * 滚动后才给顶栏加毛玻璃。
 * 顶栏本身是透明的（和页面色雾连成一片），但页面滚起来时内容会从按钮下面穿过，
 * 文字会互相打架。iOS 的做法是"滚动了才上材质"，回到顶部又恢复全透明。
 *
 * 注意：这里只切一个属性，不依赖任何过渡动画 —— 动画在离屏/后台窗口里会冻住，
 * 但状态必须是对的。
 */
function installScrollShade(): void {
  const apply = (): void => {
    const nav = document.querySelector('.nav')
    if (!nav) return
    nav.toggleAttribute('data-scrolled', window.scrollY > 6)
  }
  window.addEventListener('scroll', apply, { passive: true })
  apply()
  // 变体切换会重建 .nav，挂载后需要重新应用一次
  ;(window as unknown as Record<string, () => void>).__applyScrollShade = apply
}

/** 在导航栏右侧插入全屏按钮；状态由主进程广播，F11 也会同步 */
function installFullscreenButton(): void {
  const nav = document.querySelector('.nav-inner')
  if (!nav || nav.querySelector('[data-role="fullscreen"]')) return

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn sm'
  btn.dataset.role = 'fullscreen'
  btn.textContent = '全屏'

  const paint = (on: boolean): void => {
    btn.textContent = on ? '退出全屏' : '全屏'
    btn.setAttribute('aria-pressed', String(on))
  }

  btn.addEventListener('click', () => {
    void window.costudy?.toggleFullscreen().then((on) => paint(Boolean(on))).catch(() => undefined)
  })

  nav.appendChild(btn)
  // 兜底：某些环境（如探针）没有注册 IPC handler，避免未捕获的 promise 拒绝
  void window.costudy?.isFullscreen().then((on) => paint(Boolean(on))).catch(() => undefined)
  window.costudy?.onFullscreenChange((on) => paint(on))
}

/** 在导航栏末尾打一个构建时间戳，用来判断跑的是不是最新构建 */
function installBuildStamp(): void {
  const nav = document.querySelector('.nav-inner')
  if (!nav || nav.querySelector('.build-stamp')) return
  const stamp = document.createElement('span')
  stamp.className = 'build-stamp'
  // document.lastModified 就是这份 HTML 的构建时间，零配置
  const d = new Date(document.lastModified)
  const pad = (n: number): string => String(n).padStart(2, '0')
  stamp.textContent =
    '构建 ' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  stamp.title = '界面的构建时间；如果你改完样式没看到变化，先看这里对不对'
  stamp.style.cssText = [
    'margin-left:8px',
    'font-size:11px',
    'color:rgba(90,110,130,.75)',
    'font-variant-numeric:tabular-nums',
    'letter-spacing:0',
    'user-select:text',
  ].join(';')
  nav.appendChild(stamp)
}

/**
 * 变体切换的最小实现。
 * 变体在 mount 时会把各自的 <style> 追加到 head，换变体前必须清掉，
 * 否则上一套规则会和这一套叠加（原型里也是这么处理的）。
 */
function installVariantPicker(stage: HTMLElement): () => void {
  const picker = document.querySelector<HTMLElement>('.proto-picker')
  const highlight = picker?.querySelector<HTMLElement>('.proto-picker-highlight') ?? null
  const items = picker
    ? [...picker.querySelectorAll<HTMLElement>('.proto-picker-item')]
    : []
  const statusTitle = picker?.querySelector<HTMLElement>('.proto-picker-status-title') ?? null
  const statusSub = picker?.querySelector<HTMLElement>('.proto-picker-status-sub') ?? null

  let current = 0
  const injected: HTMLStyleElement[] = []

  // 拦截 head.appendChild，登记变体注入的样式表
  const head = document.head
  const origAppend = head.appendChild.bind(head)
  head.appendChild = (<T extends Node>(node: T): T => {
    const el = node as unknown as HTMLElement
    if (el.tagName === 'STYLE' && el.textContent && !el.dataset.harness) {
      el.dataset.harness = 'variant'
      injected.push(el as unknown as HTMLStyleElement)
    }
    return origAppend(node) as T
  }) as typeof head.appendChild

  const clearVariantStyles = (): void => {
    injected.forEach((n) => n.remove())
    injected.length = 0
  }

  // 高亮条的动画不用 CSS transition：
  // 实测在无头/离屏环境里 CSSTransition 的 currentTime 恒为 0（动画时钟冻结），
  // 高亮会永远停在上一个位置。这里用定时器做补间，任何环境都能推到终点。
  let tweenTimer = 0
  const moveHighlight = (): void => {
    if (!highlight || !items[current]) return
    const el = items[current]
    const targetLeft = el.offsetLeft
    const targetWidth = el.offsetWidth
    const fromLeft = parseFloat(highlight.style.left || '0') || 0
    const fromWidth = parseFloat(highlight.style.width || '0') || 0
    window.clearInterval(tweenTimer)
    const t0 = performance.now()
    const DURATION = 180
    const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3)
    tweenTimer = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / DURATION)
      const e = easeOut(p)
      highlight.style.left = (fromLeft + (targetLeft - fromLeft) * e).toFixed(1) + 'px'
      highlight.style.width = (fromWidth + (targetWidth - fromWidth) * e).toFixed(1) + 'px'
      highlight.style.transform = 'none'
      if (p >= 1) window.clearInterval(tweenTimer)
    }, 16)
  }

  /**
   * 读取"当前角色"。
   * nav-title 是静态的（点角色卡它不会变），真正的选中项是
   * .v-studio .card-item.is-on .card-name，必须从这里读。
   *
   * lastRoleName 记着最近一次确认过的角色名：
   * 切换到 Wizard / Companion 时没有角色列表，
   * 早期实现在这里读到空值就把岛上的字清掉了（"我的角色"消失）。
   * 现在只要曾经有过名字就一直保留。
   */
  let lastRoleName = ''
  const readCurrentRole = (): { name: string; sub: string } => {
    const onCard = document.querySelector('.v-studio .card-item.is-on .card-name')
    const fromCard = onCard?.textContent?.trim() ?? ''
    if (fromCard) lastRoleName = fromCard
    const name = fromCard || lastRoleName || document.querySelector('.nav-title')?.textContent?.trim() || ''
    // Studio 的导航左侧已删（角色名改由灵动岛显示），
    // 副标题就固定用这句，避免展开时是空的。
    const sub =
      document.querySelector('.nav-sub')?.textContent?.trim() ||
      (current === 0 ? '性格 12 维 · 实时编译' : '')
    return { name, sub }
  }

  const updateStatus = (): void => {
    if (!statusTitle || !statusSub) return
    const { name, sub } = readCurrentRole()
    // 空值不覆盖：切换变体的瞬间 stage 会被清空，此刻读到的名字是空的，
    // 如果直接写进去，岛上的"我的角色"会闪空甚至永久消失。
    if (name) statusTitle.textContent = name
    if (sub) statusSub.textContent = sub
  }

  // 「我的角色」常驻显示；岛没有展开态（双击状态栏不会再撑开）。

  const mount = (i: number): void => {
    clearVariantStyles()
    stage.innerHTML = ''
    requestAnimationFrame(() => {
      VARIANTS[i](stage)
      // 高亮条要在新 DOM 完成布局后量一次宽度，
      // 否则切换后它会停在上一个位置
      requestAnimationFrame(() => moveHighlight())
      installFullscreenButton()
      installBuildStamp()
      updateStatus()
      ;(window as unknown as Record<string, () => void>).__applyScrollShade?.()
      // 角色卡仓库有卡时，用它替换原型夹具里的「我的角色」
      void syncCardsToRail().then((replaced) => {
        if (replaced) updateStatus()
      })
    })
  }

  const setActive = (i: number): void => {
    if (i < 0 || i >= VARIANTS.length) return
    current = i
    items.forEach((el, j) => {
      el.toggleAttribute('data-active', j === i)
      if (j === i) el.setAttribute('aria-current', 'true')
      else el.removeAttribute('aria-current')
    })
    moveHighlight()
    mount(i)
  }

  items.forEach((el, i) =>
    el.addEventListener('click', () => {
      // 点当前变体不再有任何反应：
      //   之前是「展开/收起」，结果双击状态栏就会把岛撑开、露出副标题
      //   （用户要的是双击无效）。岛保持紧凑，只显示当前角色名。
      if (i === current) return
      setActive(i)
    }),
  )

  // 岛不再有展开态，原来「点岛外收起」的监听一并去掉
  window.addEventListener('resize', moveHighlight)

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const num = parseInt(e.key, 10)
    if (num >= 1 && num <= VARIANTS.length) setActive(num - 1)
    else if (e.key === 'ArrowRight') setActive((current + 1) % VARIANTS.length)
    else if (e.key === 'ArrowLeft') setActive((current - 1 + VARIANTS.length) % VARIANTS.length)
    else if (e.key === 'r' || e.key === 'R') mount(current)
  })

  // 监听选中项变化：点左边的角色卡只改 class（is-on），不会通知任何人。
  // 用 MutationObserver 盯着 stage 的 class 与子节点，节流后刷新状态。
  let statusDebounce = 0
  const observer = new MutationObserver(() => {
    window.clearTimeout(statusDebounce)
    statusDebounce = window.setTimeout(() => updateStatus(), 40)
  })
  observer.observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true })

  // 让高亮条在布局完成后就位
  requestAnimationFrame(() => requestAnimationFrame(() => picker?.setAttribute('data-ready', '')))

  return () => setActive(0)
}

function boot(): void {
  const stage = document.getElementById('stage')
  if (!stage) return

  // 大背景：窗口透明（Windows 上是系统亚克力），这层色雾给玻璃提供折射内容
  document.body.dataset.backdrop = 'mesh'

  installToast()
  installScrollShade()
  const start = installVariantPicker(stage)
  start()
  initGlass()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
