/**
 * 文字框的液态玻璃（WebGL，真实折射）
 * ==========================================================
 * 用户要求："把文字框做成和图片里同款的液态玻璃效果"，
 * 参考 https://github.com/Oliverrr2424/webgl-apple-liquid-glass（MIT，2.6.0）。
 *
 * 那个库干的事：把元素**背后**的页面按 CSS 绘制顺序重画进一张 canvas，
 * 再用 WebGL2 片元着色器做 SDF 折射 / 色散 / 边缘捕获 / 高光 / 轮廓线。
 * 和 `backdrop-filter` 的区别是"弯折"而不是"模糊"。
 *
 * 接进来的两个关键点：
 *   1. WebGL 画布画在元素**内部**（z-index:-1），所以 `<input>` 这种替换元素不能直接用 ——
 *      它没有子节点。这里给每个字段套一层 `span.lg-field` 当画布宿主，
 *      真正的 `<input>` 保持原样（事件、焦点、可访问性都不变），只是背景掏空。
 *   2. 一个 `LiquidGlass` 实例吃一个 WebGL 上下文，浏览器上限约 16 个。
 *      所以只包当前页面上"露出来"的字段，并且限量；离开页面（元素被卸载）就销毁。
 *
 * 白底上的注意：折射需要背后有东西可折。我们的页面是纯白，玻璃会把白色折成白色，
 * 真正看得见的是**边缘捕获 / 轮廓线 / 高光 / 色散**这几层 —— 也就是那种"一块玻璃片"
 * 的质感，而不是演示图里那层强烈扭曲。
 */
import { LiquidGlass } from 'apple-liquid-glass-webgl'

/**
 * 只包单行输入框。
 * `.ce-row textarea` 试过一版：它们靠 `autoSizeTextarea()` 按内容改高度、
 * 又处在 flex 行里，套一层 block 包裹会打乱高度与行布局（实测把卡片编辑器挤变形了），
 * 所以多行框维持原样。
 */
const FIELD_SELECTOR = 'input.input, textarea.textarea'
/** 已经是容器、内部有子节点的"面板"：直接给它们本身套玻璃，不用包裹层 */
const SURFACE_SELECTOR = '.v-home .hm-card, .v-home .hm-stat'
/** 已经嵌在玻璃条里的输入框不要再套一层（dock / 记忆面板 / 数学键盘） */
const SKIP_CLOSEST = '.dock, .mem-pad, .math-pad, .lg-field, .mp-search'
/** WebGL 上下文很贵：同屏最多这么多块玻璃，其余保持普通输入框 */
const MAX_FIELDS = 6
/** 首页卡片一次最多几块（4 张指标卡 + 5 张内容卡 + 底部 2 块 = 11） */
const MAX_SURFACES = 12
const STYLE_ID = 'liquid-field-style'

const CSS = `
.lg-field {
  display: block;
  position: relative;
  /* 水滴感：比原输入框更圆一档 */
  border-radius: 16px;
  /* 库会把画布往外扩一圈（边缘采样用），白底上那一圈看起来像"重影"。
     裁到圆角矩形以内，只剩干净的玻璃片。 */
  overflow: hidden;
}
.lg-field > .input,
.lg-field > .textarea {
  position: relative;
  z-index: 1;
  /* 玻璃由 canvas 画，输入框自己必须透明 */
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
.lg-field > .input:focus,
.lg-field > .textarea:focus {
  outline: none;
  background: transparent !important;
  box-shadow: none !important;
}
.lg-field > .textarea { resize: none; }

/* ---------- 面板（首页卡片）----------
   玻璃由 canvas 画在卡片内部，卡片自己的白底/阴影/描边必须让位。
   卡片原来的"边缘光"是 home.js 里注入的 .hm-glass-edge 子元素，和玻璃的轮廓线重复，一起藏掉。 */
.lg-surface {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
.lg-surface::before,
.lg-surface::after { display: none !important; }
.lg-surface > .hm-glass-edge { display: none !important; }
/* 水滴比面板更圆：卡片圆角抬到 28px（原先 18px） */
.lg-surface { border-radius: 28px !important; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface Entry {
  host: HTMLElement
  glass: { destroy: () => void }
}

const entries = new Map<HTMLElement, Entry>()
let started = false

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 8 && r.height > 8
}

function wrapField(el: HTMLElement): void {
  if (el.dataset.lgField === '1') return
  const parent = el.parentNode
  if (!parent) return
  el.dataset.lgField = '1'

  const host = document.createElement('span')
  host.className = 'lg-field'
  const radius = getComputedStyle(el).borderRadius
  if (radius) host.style.borderRadius = radius

  parent.insertBefore(host, el)
  host.appendChild(el)

  const glass = new LiquidGlass(host, {
    // 水滴：几乎无色（tint 低）、身体厚（body/absorption 高，边缘会自然变深）、
    // 折射拉满、顶上一颗高光点。这样在白底上呈现的是"一滴水"该有的边缘厚度 + 反光，
    // 而不是一块磨砂玻璃板。
    tint: 0.1,
    tintTone: 'light',
    frost: 0,
    material: {
      refraction: 108,
      dispersion: 1.6,
      body: 1,
      absorption: 0.72,
      rim: 0.62,
      highlight: 1,
      reflection: 0.55,
      echo: 0.55,
      hairline: 0.34,
      hairWidth: 0.3,
      edgeWidth: 0.3,
      edgeReach: 0.22,
      lightAngle: 115,
    },
  })
  entries.set(host, { host, glass })

  // 字段拿到焦点时，玻璃也该"活"一下：重新采样一次
  el.addEventListener('focus', () => {
    try {
      ;(glass as unknown as { refresh?: () => void }).refresh?.()
    } catch {
      /* 忽略 */
    }
  })
}

function enhanceSurface(el: HTMLElement): void {
  if (el.dataset.lgSurface === '1') return
  el.dataset.lgSurface = '1'
  el.classList.add('lg-surface')
  const glass = new LiquidGlass(el, {
    // 大面板同样按"水滴"来：无色、身体厚、边缘自然加深、顶上一道反光。
    tint: 0.05,
    tintTone: 'light',
    frost: 0,
    material: {
      refraction: 102,
      dispersion: 0.9,
      body: 0.9,
      absorption: 0.55,
      rim: 0.34,
      highlight: 1,
      reflection: 0.4,
      echo: 0.26,
      hairline: 0,
      hairWidth: 0.2,
      edgeWidth: 0.34,
      edgeReach: 0.24,
      lightAngle: 115,
    },
  })
  entries.set(el, { host: el, glass })
}

function sweep(): void {
  // 卸载的页面：连玻璃实例一起销毁，把 WebGL 上下文还回去
  for (const [host, entry] of entries) {
    if (!host.isConnected) {
      try {
        entry.glass.destroy()
      } catch {
        /* 忽略 */
      }
      entries.delete(host)
    }
  }

  // 面板（首页卡片）
  let surfaces = 0
  for (const host of entries.keys()) if (host.dataset.lgSurface === '1') surfaces += 1
  if (surfaces < MAX_SURFACES) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR))) {
      if (surfaces >= MAX_SURFACES) break
      if (el.dataset.lgSurface === '1') continue
      if (!isVisible(el)) continue
      enhanceSurface(el)
      surfaces += 1
    }
  }

  // 输入框
  let fields = 0
  for (const host of entries.keys()) if (host.classList.contains('lg-field')) fields += 1
  if (fields >= MAX_FIELDS) return
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
  for (const el of candidates) {
    if (fields >= MAX_FIELDS) break
    if (el.dataset.lgField === '1') continue
    if (el.closest(SKIP_CLOSEST)) continue
    if (!isVisible(el)) continue
    wrapField(el)
    fields += 1
  }
}

export function installLiquidFields(): void {
  if (started) return
  started = true
  ensureStyle()

  let supported = true
  try {
    supported = typeof LiquidGlass.isSupported === 'function' ? LiquidGlass.isSupported() : true
  } catch {
    supported = false
  }
  // 没有 WebGL2 就什么都不做，输入框保持原来的 CSS 玻璃（库自带 backdrop-filter 兜底，
  // 但那种情况下我们不如直接用现有的 .input 样式）
  if (!supported) return

  let timer = 0
  const schedule = (): void => {
    if (timer) return
    timer = window.setTimeout(() => {
      timer = 0
      sweep()
    }, 90)
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', schedule)
  schedule()
}
