/**
 * 页面转场（Apple 风格）
 * ==========================================================
 * 这个项目**没有框架、也没有路由库**：四个页面就是四个 `mount(stage)` 函数，
 * 切换时把 `#stage` 清空重挂。所以"转场"只能在挂载这一个点上做文章。
 *
 * 做法：
 *   - 每个页面挂进一个 `.page-layer` 包裹层（新增的一层 div，不改变现有 DOM 结构），
 *     转场只动这一层的 `transform` / `opacity`
 *   - 出去的那一页**不销毁**，整层挪进一个 `position: fixed` 的 `.page-ghost` 盖在上层，
 *     淡出后连同样式一起删掉 —— 这样退出动画拿到的就是它最后渲染出来的样子，
 *     不需要克隆整棵树（聊天页几百条消息，克隆会卡）
 *   - 新旧两层同时在场做交叉淡入淡出，中间不会出现白屏
 *
 * 参数（按需求定的）：
 *   进入  opacity 0→1 · 右移 24px→0 · scale .985→1 · 320ms
 *   退出  opacity 1→0 · 左移 0→-12px · scale 1→.99 · 260ms
 *   返回时左右方向整体翻转（由调用方传 dir = -1）
 *
 * 只用 transform / opacity —— 都是合成层属性，不触发布局，
 * 也不会去动画页面里的 backdrop-filter（那会把整页重新采样，掉帧）。
 */

export type Dir = 1 | -1

const ENTER_MS = 320
const EXIT_MS = 260
/** 与 tokens.css 的 --ease-out 同一条曲线：起手快、收尾稳 */
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const ENTER_X = 24
const EXIT_X = 12

const STYLE_ID = 'page-transition-style'

const CSS = `
.page-layer.is-moving { will-change: transform, opacity; }
.page-ghost {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  pointer-events: none;
}
.page-ghost .app { pointer-events: none; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/** 系统要求减少动态效果时直接跳过（无障碍） */
export function motionAllowed(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

export interface TransitionOptions {
  /** 旧页面那一层；首次挂载时为 null */
  from: HTMLElement | null
  /** 新页面那一层 */
  to: HTMLElement
  /** 1 = 前进（新页从右来）；-1 = 返回（新页从左来） */
  dir: Dir
  /** false = 不播动画（首次启动、自检、减少动效） */
  enabled?: boolean
  /**
   * 切屏前旧页面的滚动位置。
   * 必须由调用方在"清空 #stage 之前"量好传进来 —— 新页面挂上之后窗口会被拉回顶部，
   * 那时候再读 window.scrollY 已经晚了，残影会对不上位置。
   */
  fromScroll?: number
  /** 旧页面彻底退场后要做的事（比如删掉它注入的 <style>） */
  onExitDone?: () => void
}

let running: Animation[] = []
let ghost: HTMLElement | null = null
let cleanup: Array<() => void> = []

function flushCleanup(): void {
  const list = cleanup
  cleanup = []
  for (const fn of list) {
    try {
      fn()
    } catch {
      /* 清理失败不影响界面 */
    }
  }
}

/** 打断上一次转场：立刻收掉残影、补上没来得及做的清理 */
function cancelRunning(): void {
  for (const anim of running) {
    try {
      anim.cancel()
    } catch {
      /* 已经结束的动画 cancel 会抛，忽略 */
    }
  }
  running = []
  if (ghost) {
    ghost.remove()
    ghost = null
  }
  flushCleanup()
}

export function pageTransition(options: TransitionOptions): void {
  ensureStyle()
  cancelRunning()

  const { from, to, dir } = options
  const finishEnter = (): void => to.classList.remove('is-moving')

  // 窗口在后台（最小化 / 被完全遮住）时 Chromium 会把动画和定时器一起冻住：
  // 动画停在第一帧、兜底定时器也被节流，页面就会卡在"透明 + 右移 24px"上。
  // 这种时候干脆别播，直接换页。
  const canAnimate = options.enabled !== false && motionAllowed() && !document.hidden

  // 不播动画：直接把旧层删掉，把清理做掉
  if (!canAnimate) {
    if (from) from.remove()
    options.onExitDone?.()
    return
  }

  to.classList.add('is-moving')
  // 只用横移 + 透明度：缩放哪怕只有 1.5%，在两千多像素高的页面上也会把视口里的内容
  // 上下带出十几个像素（缩放原点是页面 42% 处，视口顶离它很远）。
  // 用户要的是"绝对不要上下动"，所以 scale 整个去掉，横向 + 淡入淡出已经够 Apple 了。
  const enter = to.animate(
    [
      { opacity: 0, transform: 'translate3d(' + ENTER_X * dir + 'px, 0, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ],
    { duration: ENTER_MS, easing: EASE, fill: 'both' },
  )
  running.push(enter)
  /**
   * 动画结束后把 fill 也撤掉：不然这一层会永远带着一个 transform，
   * 它会变成 fixed 子元素的新的包含块，滚动和定位都可能被悄悄改变。
   *
   * **必须有定时器兜底**：实测（--uishot 里点掉首启遮罩后切屏）Web Animations 的
   * currentTime 会停在 0 不再前进 —— 这时 finished 永远不 resolve，fill: both 就把
   * "起始帧 translateX(24px)" 永久糊在页面上：整页右移 24px，输入条右边的「忆 / ∑」
   * 被推出窗口，看着就是"这两个按钮的交互没了"。
   * 所以不管动画有没有真的播，320ms 后一律取消它、回到无 transform 的自然状态。
   */
  let settled = false
  const settle = (): void => {
    if (settled) return
    settled = true
    try {
      enter.cancel()
    } catch {
      /* 已结束 */
    }
    finishEnter()
  }
  enter.finished.then(settle, settle)
  window.setTimeout(settle, ENTER_MS + 120)

  if (!from) {
    options.onExitDone?.()
    return
  }

  // 旧页面：整层盖上去淡出
  if (options.onExitDone) cleanup.push(options.onExitDone)

  const wrap = document.createElement('div')
  wrap.className = 'page-ghost'
  // 旧页面可能已经滚动了一段：把残影往上提，接住它离开时的位置
  const scrollY = typeof options.fromScroll === 'number' ? options.fromScroll : window.scrollY || 0
  if (scrollY) wrap.style.transform = 'translate3d(0, ' + -scrollY + 'px, 0)'
  wrap.appendChild(from)
  document.body.appendChild(wrap)
  ghost = wrap

  from.classList.add('is-moving')
  const exit = from.animate(
    [
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0, transform: 'translate3d(' + -EXIT_X * dir + 'px, 0, 0)' },
    ],
    { duration: EXIT_MS, easing: EASE, fill: 'both' },
  )
  running.push(exit)
  // 退出侧同理：动画可能压根不前进，260ms 后必须自己收掉残影（否则旧页面永远盖在上面）
  let settledExit = false
  const settleExit = (): void => {
    if (settledExit) return
    settledExit = true
    from.classList.remove('is-moving')
    if (ghost === wrap) {
      wrap.remove()
      ghost = null
      flushCleanup()
    }
  }
  exit.finished.then(settleExit, () => {
    /* 被新的转场打断：清理交给 cancelRunning */
  })
  window.setTimeout(settleExit, EXIT_MS + 140)
}
