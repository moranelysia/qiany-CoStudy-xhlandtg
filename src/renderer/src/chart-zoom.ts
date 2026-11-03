/**
 * 图表的「放大模式」。
 *
 * 起因：消息里的图是按气泡宽度画的（`.chart-box` 最宽 620、`.learn-chart` 78%），
 * 函数图像、几何图、实验图挤在那一小块里根本看不清刻度。
 * 这里做一层通用能力：**点任何图 → 全屏浮层看大图**，不挑图是谁画的
 * （`plot_function` / `plot_geometry` / `render_experiment` / JSXGraph 的都在内）。
 *
 * 几个刻意的做法：
 *   · 用**事件委托**（document 捕获阶段）而不是给每个图绑 handler ——
 *     图是消息渲染时才插进来的，之后还会被重绘（renderHistory 会整块重建）。
 *   · 浮层里放的是 **cloneNode** 的 SVG，不动原图 —— 原图仍在消息流里，
 *     关掉浮层就是原来那块，不需要"还原"。
 *   · 缩放用 transform: scale()，浮层舞台 overflow:auto —— 放到 3 倍时可以拖动查看。
 *   · Esc 关闭、点背景关闭、点图本身切换「适应/放大」一倍。
 */
const STYLE_ID = 'chart-zoom-style'

const CSS = `
/* 消息里的图给个"可点"的暗示 */
.chart-box, .learn-chart, .img-box { position: relative; cursor: zoom-in; }
.chart-box:hover::after, .learn-chart:hover::after, .img-box:hover::after {
  content: '点击放大';
  position: absolute; right: 8px; top: 8px; z-index: 2;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 600; color: #0a5cc4;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 8px rgba(30, 44, 62, 0.14);
  pointer-events: none;
}

.cz-overlay {
  position: fixed; inset: 0;
  z-index: 2147483000;
  display: grid; grid-template-rows: 1fr auto;
  background: rgba(12, 18, 26, 0.66);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  animation: cz-in 160ms ease-out both;
  /* 工具条放**底部**：顶部 42px 是原生 caption 区（titleBarOverlay），
     鼠标事件到不了渲染层，按钮放上去会点不动（真的踩过） */
  -webkit-app-region: no-drag;
}
.cz-bar, .cz-stage, .cz-btn, .cz-close { -webkit-app-region: no-drag; }
/* 浮层打开时把灵动岛和「首页」胶囊隐掉：它们的 z-index 是 int 上限（压在浮层之上），
   留着会像"悬浮在暗色遮罩上的两块亮片"，很脏。 */
body:has(.cz-overlay) .proto-picker,
body:has(.cz-overlay) .home-pill,
body:has(.cz-overlay) .winbar {
  opacity: 0;
  pointer-events: none;
}
@keyframes cz-in { from { opacity: 0 } to { opacity: 1 } }
.cz-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  color: rgba(255, 255, 255, 0.82); font-size: 12.5px;
}
.cz-hint { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cz-btn {
  flex: none; padding: 6px 12px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: #eaf3ff; background: rgba(255, 255, 255, 0.14);
}
.cz-btn:hover { background: rgba(255, 255, 255, 0.24); }
.cz-close {
  flex: none; width: 30px; height: 30px; border: 0; border-radius: 10px; cursor: pointer;
  font: inherit; font-size: 15px; line-height: 1; color: #fff; background: rgba(255, 255, 255, 0.16);
}
.cz-close:hover { background: rgba(255, 255, 255, 0.28); }
.cz-stage { overflow: auto; display: grid; place-items: center; padding: 8px 24px 32px; }
.cz-figure {
  background: #fff; border-radius: 18px; padding: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.36);
  transform-origin: center center;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
/* 图本身撑满浮层卡片：SVG 的固有 width/height 在 open() 里已经被摘掉，
   这里给一个明确的尺寸，否则它只会缩成几十像素 */
.cz-figure svg {
  display: block;
  width: min(84vw, 1200px);
  height: auto;
  max-height: 70vh;
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

let overlay: HTMLElement | null = null
let figure: HTMLElement | null = null
/** 浮层里那张图本身（svg 或 img）—— 缩放直接改它的宽度 */
let content: HTMLElement | SVGElement | null = null
let baseWidth = 0
let scale = 1

function paintScale(): void {
  if (!content) return
  if (!baseWidth) baseWidth = Math.round(content.getBoundingClientRect().width) || 320
  // 用**宽度**放大，而不是 CSS transform：transform 在这套样式里被别的规则压住了
  // （实测 inline scale(2.05)、computed 还是 matrix(1…)），改宽度稳，而且能真的滚着看
  content.style.width = Math.round(baseWidth * scale) + 'px'
  content.style.height = 'auto'
  content.style.maxWidth = 'none'
  content.style.maxHeight = 'none'
}

function close(): void {
  overlay?.remove()
  overlay = null
  figure = null
  content = null
  baseWidth = 0
  scale = 1
}

function open(source: SVGElement): void {
  ensureStyle()
  const svg = source.cloneNode(true) as SVGElement
  // 只摘掉固有尺寸，不写内联 width/height —— 内联样式会压过 CSS 里的 .cz-figure svg 规则，
  // 结果图缩成几十像素（踩过一次）
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  show(svg)
}

/** 照片走同一个浮层：学生拍的题、截图都能放大看 */
function openImage(source: HTMLImageElement): void {
  ensureStyle()
  const img = document.createElement('img')
  img.src = source.src
  img.alt = source.alt || '照片'
  img.style.cssText = 'display:block;max-width:84vw;max-height:70vh;height:auto;border-radius:10px'
  show(img)
}

function show(node: Node): void {
  close()

  overlay = document.createElement('div')
  overlay.className = 'cz-overlay'
  overlay.innerHTML =
    '<div class="cz-stage"><div class="cz-figure" data-cz-figure></div></div>' +
    '<div class="cz-bar">' +
    '<span class="cz-hint">点击背景或按 Esc 关闭 ｜ 点图切换 适应 / 放大 ｜ + − 键缩放</span>' +
    '<button class="cz-btn" data-cz-out>缩小</button>' +
    '<button class="cz-btn" data-cz-in>放大</button>' +
    '<button class="cz-btn" data-cz-fit>适应屏幕</button>' +
    '<button class="cz-close" data-cz-close aria-label="关闭">✕</button>' +
    '</div>'

  figure = overlay.querySelector<HTMLElement>('[data-cz-figure]')
  figure?.appendChild(node)
  content = node as HTMLElement | SVGElement
  baseWidth = 0
  document.body.appendChild(overlay)
  scale = 1
  paintScale()

  // 背景关闭（点浮层本身，不含里面的图）
  overlay.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement
    if (target.closest('[data-cz-out]')) {
      scale = Math.max(0.6, Math.round((scale - 0.35) * 100) / 100)
      paintScale()
      return
    }
    if (target.closest('[data-cz-in]')) {
      scale = Math.min(4, Math.round((scale + 0.35) * 100) / 100)
      paintScale()
      return
    }
    if (target.closest('[data-cz-fit]')) {
      scale = 1
      paintScale()
      return
    }
    if (target.closest('[data-cz-close]')) {
      close()
      return
    }
    // 点图：在「适应」和「放大 1.4 倍」之间切换
    if (target.closest('.cz-figure')) {
      scale = scale > 1.01 ? 1 : 1.4
      paintScale()
      return
    }
    close()
  })
}

/**
 * 装一次就够。用捕获阶段，避免被消息气泡自己的点击处理拦掉。
 */
export function installChartZoom(): void {
  ensureStyle()

  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      if (target.closest('.cz-overlay')) return // 浮层自己的点击自己处理
      // 照片也走同一个浮层：学生拍的题、截图都能放大看
      const img = target.closest('.img-box img') as HTMLImageElement | null
      if (img) {
        ev.preventDefault()
        ev.stopPropagation()
        openImage(img)
        return
      }
      const svg = target.closest('.chart-box svg, .learn-chart svg') as SVGElement | null
      if (!svg) return
      ev.preventDefault()
      ev.stopPropagation()
      open(svg)
    },
    true,
  )

  document.addEventListener(
    'keydown',
    (ev) => {
      if (!overlay) return
      if (ev.key === 'Escape') {
        ev.preventDefault()
        ev.stopPropagation()
        close()
      } else if (ev.key === '+' || ev.key === '=') {
        ev.preventDefault()
        scale = Math.min(4, Math.round((scale + 0.35) * 100) / 100)
        paintScale()
      } else if (ev.key === '-' || ev.key === '_') {
        ev.preventDefault()
        scale = Math.max(0.6, Math.round((scale - 0.35) * 100) / 100)
        paintScale()
      } else if (ev.key === '0') {
        ev.preventDefault()
        scale = 1
        paintScale()
      }
    },
    true,
  )
}
