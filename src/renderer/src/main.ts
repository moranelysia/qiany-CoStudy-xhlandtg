import { installInteractions } from './interactions'
import { installSettingsEntry } from './settings-ui'
import { openOverview } from './overview'
import { showOnboarding } from './onboarding'
import { installPolishEntry } from './polish-ui'
import { installProfileEntry } from './profile-ui'
import { installM3Entry } from './m3-ui'
import { installTemplateEntry } from './template-ui'
import { installModeHomeEntry } from './mode-home'
import { installCardViewEntry } from './card-view'
import { installLearnSession } from './learn-ui'
import { installParamsToggle } from './params-ui'
import { installWindowControls } from './window-controls'
import { disableNativeTooltips } from './tooltip'
import { installVoiceEntry } from './voice-entry'
import { pageTransition, type Dir } from './page-transition'
import { installLiquidFields } from './liquid-input'
import { installHealthBanner } from './health-ui'
import { installModePill } from './mode-ui'
import { installChartZoom } from './chart-zoom'
import { mountPlugins } from './plugins-ui'
import { syncDimsFromCard, syncIdentityInputs, syncPreviewReplyName } from './cards-ui'
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
import './styles/studio-rail.css'
import './styles/window-controls.css'
// 纯白面板：必须排在 squircle 之后 —— 它要把玻璃渐变/高光/背景图整层清成白色
import './styles/white-surface.css'
// 首页胶囊（灵动岛左侧）：是全局层级的东西，不能写进变体样式里 ——
// 变体样式在切换时会被整批清掉，胶囊会瞬间变成裸按钮。
import './styles/home.css'

// 原型是纯 JS 模块，这里按值导入；类型交给 allowJs，不做 checkJs
import { mount as mountStudio } from './app/studio.js'
import { mount as mountCompanion } from './app/companion.js'
import { mount as mountHome } from './app/home.js'
import { initGlass } from './app/ui.js'
import { syncCardsToRail } from './cards-ui'
import { mountCardEditor } from './card-editor'

type Mount = (stage: HTMLElement) => void

/**
 * 第二屏（灵动岛里的「新手引导」）暂时留空。
 *
 * 这一屏原来挂的是向导变体。向导现在只从「＋新建角色 → 自己调参数」的弹层进入
 * （见 mode-home.ts 的 openWizardPanel，它动态 import 向导），
 * 所以这里既不静态引入、也不 mount —— 留一块干净的空舞台给下一版要放的东西。
 * 要往里放内容时，改这个函数即可，别去动 wizard.js。
 */
// 第二屏现在挂插件页（mountPlugins），原来的空舞台 mountEmpty 已删除
/**
 * 变体表。**顺序即索引，索引被别处依赖**：
 *   interactions.ts 的「去学习」、--uitest / --cleartest 里的
 *   `__costudySetActive(2)` 都按"2 = 伴学"写死，所以新加的首页只能**追加在末尾**（=3），
 *   不能插到前面去，否则那些调用会静默切到别的屏。
 * 首页的入口不在这排 tab 里，而是灵动岛左侧那个独立胶囊（installHomePill）。
 */
const VARIANTS: Mount[] = [mountStudio, mountPlugins, mountCompanion, mountHome]
/** 首页在变体表里的索引 */
const HOME_INDEX = 3

/** 原型里的提示条依赖 window.__toast，这里补一个最小实现 */
/**
 * 顶部拖拽带。
 *
 * titleBarStyle: 'hidden' 之后系统只在右上角画按钮，
 * 除此之外整条顶栏都不会拖窗口 —— 必须显式声明一块拖拽区。
 * 这块带子落在 body 的 42px 内边距里，不覆盖任何可点内容。
 */
function installTitlebarDrag(): void {
  if (document.querySelector('.titlebar-drag')) return
  const strip = document.createElement('div')
  strip.className = 'titlebar-drag'
  strip.setAttribute('aria-hidden', 'true')
  document.body.appendChild(strip)
}

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

/**
 * 自绘窗口按钮：小窗化 / 最小化 / 退出。
 *
 * 窗口是 frame:false（无边框），系统标题栏不存在，这三个必须自己画。
 * 做成固定在右上角的一小块，而不是挂进导航栏：
 *   学习界面（Companion）根本没有 .nav，挂导航栏的话那两屏就没有关闭按钮。
 * 退出走主进程的 app:close —— destroy 窗口后 quit 整个应用。
 */

/**
 * 首页入口：灵动岛左侧那个独立胶囊。
 *
 * 位置不能写死 —— 岛是 `left:50%` 居中的，而且鼠标悬停时 padding 会变、岛会变宽，
 * 写死坐标一定错位。这里每次都实测岛的矩形，再把胶囊贴到它左边缘外面 8px、垂直居中。
 *
 * 触发点：resize（窗口宽度变了）、ResizeObserver（岛悬停展开/字体加载后变宽）、
 * 以及每次切变体（DOM 重建后要重新摆）。实测在离屏窗口里 rAF 会被节流，
 * 所以另有一条 setTimeout 兜底，别只等 rAF。
 */
function installHomePill(setActive: (i: number) => void): void {
  const pill = document.querySelector<HTMLElement>('.home-pill')
  const picker = document.querySelector<HTMLElement>('.proto-picker')
  if (!pill || !picker) return

  const place = (): void => {
    const pr = picker.getBoundingClientRect()
    if (pr.width === 0) return
    const pw = pill.offsetWidth
    const ph = pill.offsetHeight
    const left = Math.max(10, Math.round(pr.left - pw - 8))
    pill.style.left = left + 'px'
    pill.style.top = Math.round(pr.top + (pr.height - ph) / 2) + 'px'
  }

  if (pill.dataset.bound !== '1') {
    pill.dataset.bound = '1'
    pill.addEventListener('click', () => setActive(HOME_INDEX))
  }

  place()
  requestAnimationFrame(place)
  window.setTimeout(place, 160)
  window.addEventListener('resize', place)
  if (typeof ResizeObserver !== 'undefined') {
    try {
      new ResizeObserver(place).observe(picker)
    } catch {
      /* 老内核没有就不跟悬停，静置位置仍然正确 */
    }
  }
  ;(window as unknown as Record<string, () => void>).__costudyPlaceHomePill = place
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

  // 启动落在哪一屏。以前是 0（角色工坊），用户要求"打开就是首页"，
  // 所以初始索引改成 HOME_INDEX；角色工坊仍是岛里的第一项，点一下就回去。
  let current = HOME_INDEX
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

  /**
   * 把当前变体注入的样式摘下来但不删 —— 交给转场去决定什么时候删。
   * 退出动画要放 260ms，那期间旧页面还得靠这些规则渲染，删早了残影会瞬间变成裸 HTML。
   */
  const takeVariantStyles = (): HTMLStyleElement[] => {
    const list = injected.slice()
    injected.length = 0
    return list
  }

  /**
   * 页面在导航里的前后顺序（用户给的顺序：首页 → 角色工坊 → 插件 → 伴学）。
   * 转场方向只由它决定：往后面的走，新页从右边来；往前面的走，新页从左边来。
   * 注意这不是岛的 tab 顺序 —— 岛上没有"首页"，它在岛左边那个独立胶囊里。
   */
  const NAV_ORDER = [HOME_INDEX, 0, 1, 2]
  const navRank = (i: number): number => {
    const k = NAV_ORDER.indexOf(i)
    return k < 0 ? 0 : k
  }
  const directionOf = (from: number, to: number): Dir => (navRank(to) >= navRank(from) ? 1 : -1)

  // 高亮条的动画不用 CSS transition：
  // 实测在无头/离屏环境里 CSSTransition 的 currentTime 恒为 0（动画时钟冻结），
  // 高亮会永远停在上一个位置。这里用定时器做补间，任何环境都能推到终点。
  let tweenTimer = 0
  const moveHighlight = (): void => {
    if (!highlight) return
    // 首页（index 3）不在岛里，岛里没有任何一项该被点亮：
    // 把高亮条收成 0 宽，否则它会停在「角色工坊」下面，看起来像还选中着。
    if (!items[current]) {
      window.clearInterval(tweenTimer)
      highlight.style.width = '0px'
      highlight.style.opacity = '0'
      return
    }
    highlight.style.opacity = '1'
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

  /**
   * 从首页启动时，岛上读不到角色名 ——
   * readCurrentRole 取的是 `.v-studio .card-item.is-on .card-name`，
   * 而首页根本没有角色栏，于是岛的后半截会空着。
   * 这里开局直接问一次角色卡，把名字补上；之后切到工坊，DOM 里的选中项会接管。
   */
  void (async (): Promise<void> => {
    if (lastRoleName) return
    try {
      const api = (
        window as unknown as {
          costudy?: { cards?: { list?: () => Promise<Array<{ name?: string; isActive?: boolean }>> } }
        }
      ).costudy
      const list = await api?.cards?.list?.()
      const active = list?.find((c) => c.isActive) ?? list?.[0]
      const name = String(active?.name ?? '').trim()
      if (!name) return
      lastRoleName = name
      updateStatus()
    } catch {
      /* 读不到就空着，不能因此拖慢启动 */
    }
  })()

  const mount = (i: number, dir: Dir = 1, animate = true): void => {
    // 旧页面整层先摘下来（内容和样式都留着）：转场时它是"退场的那一层"，
    // 淡出结束后才连同它注入的 <style> 一起删掉。
    const prevLayer = stage.querySelector<HTMLElement>(':scope > .page-layer')
    // 滚动位置必须在清空 #stage 之前量：清空之后文档变矮，浏览器会立刻把 scrollY 夹小，
    // 那时候再读就是错的（残影会对不上，页面还会突然往上跳一下）
    const prevScroll = window.scrollY || 0
    const prevStyles = takeVariantStyles()
    stage.innerHTML = ''
    const layer = document.createElement('div')
    layer.className = 'page-layer'
    stage.appendChild(layer)

    // 挂载原本只挂在 requestAnimationFrame 上。窗口被遮挡 / 最小化 / 合成器卡住时，
    // rAF 会被节流甚至根本不触发 —— 那时整个舞台就一直是空的（这次调试里复现了：
    // 带诊断跑时 11 秒了 .app 还不存在，而 smoke 里立刻就绪）。
    // 所以加一个 setTimeout 兜底，谁先到算谁，保证内容一定会挂上。
    let mounted = false
    const run = (): void => {
      if (mounted) return
      mounted = true
      VARIANTS[i](layer)
      // 高亮条要在新 DOM 完成布局后量一次宽度，
      // 否则切换后它会停在上一个位置
      requestAnimationFrame(() => moveHighlight())
      updateStatus()
      ;(window as unknown as Record<string, () => void>).__applyScrollShade?.()
      // 角色卡仓库有卡时，用它替换原型夹具里的「我的角色」
      void syncIdentityInputs()
        void syncDimsFromCard()
        void syncPreviewReplyName()
        void syncCardsToRail().then((replaced) => {
        if (replaced) updateStatus()
        // 角色卡编辑器（只在 Studio 有位置）
        void mountCardEditor()
      })
      // 新页面已经在 DOM 里了，这时候才起转场：进入淡入 + 旧的淡出
      // 新页面一律从顶部开始 —— 不能沿用上一页的滚动位置，否则切过去内容会"悬在半空"，
      // 而且文档变矮时浏览器夹滚动值的那一下，就是用户看到的"上下震荡"。
      try {
        window.scrollTo(0, 0)
      } catch {
        /* 忽略 */
      }
      pageTransition({
        from: prevLayer,
        to: layer,
        dir,
        enabled: animate,
        fromScroll: prevScroll,
        onExitDone: () => prevStyles.forEach((n) => n.remove()),
      })
    }
    requestAnimationFrame(run)
    window.setTimeout(run, 120)
  }

  /**
   * 切到某一屏。
   * @param i        变体下标
   * @param opts.animate  false = 不播转场（自检里量坐标时用得上）
   * @param opts.history  false = 不写历史（popstate 回来的那次不能再 push，否则循环）
   */
  const setActive = (i: number, opts?: { animate?: boolean; history?: boolean }): void => {
    if (i < 0 || i >= VARIANTS.length) return
    const from = current
    // 方向只看导航顺序：往后的走，新页从右边来；往前的走，新页从左边来
    const dir = directionOf(from, i)
    current = i
    items.forEach((el, j) => {
      el.toggleAttribute('data-active', j === i)
      if (j === i) el.setAttribute('aria-current', 'true')
      else el.removeAttribute('aria-current')
    })
    // 首页胶囊跟着一起亮：它不在 items 里，得单独同步
    document.querySelector('.home-pill')?.toggleAttribute('data-active', i === HOME_INDEX)
    moveHighlight()
    mount(i, dir, opts?.animate !== false)
    // 记一条历史：这样 opt+← / 浏览器后退也能回到上一屏，且方向是反的。
    // 只传 state 不传 URL —— file:// 下带 URL 的 pushState 会被安全策略拦掉。
    if (opts?.history !== false && i !== from) {
      try {
        history.pushState({ v: i }, '')
      } catch {
        /* 历史写不进去不影响切屏 */
      }
    }
  }

  // 供其他模块切变体（interactions.ts 的"去学习"要用）
  ;(window as unknown as Record<string, unknown>).__costudySetActive = setActive

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

  /**
   * 浏览器 / 系统级的前进后退（Windows 上是 Alt+←/→，macOS 是触控板双指横扫）。
   * 历史里存的是变体下标，回来时按当前屏与目标的顺序自动算方向 —— 所以"返回"是从左边进来的。
   */
  window.addEventListener('popstate', (ev) => {
    const state = ev.state as { v?: number } | null
    const target = typeof state?.v === 'number' ? state.v : HOME_INDEX
    setActive(target, { history: false })
  })
  // 启动这一屏也要占一条历史，否则第一次后退会退到空白页
  try {
    history.replaceState({ v: current }, '')
  } catch {
    /* file:// 下偶尔会拦，拦了就只是没有后退，不影响切屏 */
  }

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const num = parseInt(e.key, 10)
    if (num >= 1 && num <= VARIANTS.length) setActive(num - 1)
    else if (e.key === 'ArrowRight') setActive((current + 1) % VARIANTS.length)
    else if (e.key === 'ArrowLeft') setActive((current - 1 + VARIANTS.length) % VARIANTS.length)
    else if (e.key === 'r' || e.key === 'R') mount(current, 1, false)
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

  // 首页胶囊：贴岛左侧，跟着岛的位置/宽度走
  installHomePill(setActive)

  return () => setActive(HOME_INDEX)
}

function boot(): void {
  const stage = document.getElementById('stage')
  if (!stage) return

  // 大背景：窗口透明（Windows 上是系统亚克力），这层色雾给玻璃提供折射内容
  document.body.dataset.backdrop = 'mesh'

  installToast()
  installTitlebarDrag()

  ;(window as unknown as Record<string, unknown>).__costudyOpenOverview = () => void openOverview()
  installSettingsEntry()
  installPolishEntry()
  installProfileEntry()
  installM3Entry()
  installTemplateEntry()
  installModeHomeEntry()
  installCardViewEntry()
  installLearnSession()
  installParamsToggle()
  installWindowControls()
  // 首启引导：只跑一次（完成后写 localStorage）
  window.setTimeout(() => showOnboarding(), 400)
  installInteractions()
  installScrollShade()
disableNativeTooltips()
installVoiceEntry()
installHealthBanner()
installModePill()
// 文字框的 WebGL 液态玻璃：自动扫描 .input / .textarea，给它们套一层画布宿主
installLiquidFields()
// 图表放大：点消息里的图 → 全屏浮层（事件委托，图后插入也管用）
installChartZoom()

// 渲染层错误钩子：界面里任何未捕获的异常都留痕，避免"界面上什么也没发生"。
// 用 [DIAG] 前缀是为了让诊断文件（COSTUDY_DIAG_FILE）能一并抓到。
window.addEventListener('error', (e) => {
  console.log('[DIAG] ' + JSON.stringify({ stage: 'render-error', msg: String(e.message ?? '').slice(0, 200) }))
  console.error('[RENDER:error]', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.log('[DIAG] ' + JSON.stringify({ stage: 'render-reject', msg: String((e.reason as Error)?.message ?? e.reason).slice(0, 200) }))
  console.error('[RENDER:reject]', e.reason)
})
  const start = installVariantPicker(stage)
  start()
  initGlass()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
