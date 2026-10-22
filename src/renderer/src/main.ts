// 入口：把 Studio 界面装进 Electron 渲染进程
// 样式顺序必须和原型一致，否则透明会失效：
//   tokens     设计变量 + 基础组件
//   liquid-glass 玻璃材质（注意它里面有 body { background: var(--ground) }，会把外壳涂白）
//   transparent  外壳透明 + 背景层（必须排在 liquid-glass 之后才能覆盖掉那层白）
//   gradient-type 标题渐变（最后，覆盖标题的填充）
import './styles/tokens.css'
import './styles/liquid-glass.css'
import './styles/transparent.css'
import './styles/gradient-type.css'
// 面板渐变放在最后：transparent.css 用 background 简写会把 background-image 重置掉
import './styles/panel-gradient.css'
// 文字框的液态玻璃放最后：要压过 tokens 里 .input 的填充样式
import './styles/liquid-input.css'

// 原型是纯 JS 模块，这里按值导入；类型交给 allowJs，不做 checkJs
import { mount } from './app/studio.js'
import { initGlass } from './app/ui.js'

/** 原型里的提示条依赖 window.__toast，这里补一个最小实现 */
function installToast(): void {
  const host = document.getElementById('toasts')
  if (!host) return
  ;(window as unknown as Record<string, unknown>).__toast = (msg: string): void => {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = msg
    host.appendChild(el)
    setTimeout(() => el.remove(), 2000)
  }
}

/** 在导航栏右侧插入全屏按钮；状态由主进程广播，F11 也会同步 */
function installFullscreenButton(): void {
  const nav = document.querySelector('.nav-inner')
  if (!nav) return

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn sm'
  btn.textContent = '全屏'

  const paint = (on: boolean): void => {
    btn.textContent = on ? '退出全屏' : '全屏'
    btn.setAttribute('aria-pressed', String(on))
  }

  btn.addEventListener('click', () => {
    void window.costudy?.toggleFullscreen().then((on) => paint(Boolean(on)))
  })

  nav.appendChild(btn)
  void window.costudy?.isFullscreen().then((on) => paint(Boolean(on)))
  window.costudy?.onFullscreenChange((on) => paint(on))
}

function boot(): void {
  const stage = document.getElementById('stage')
  if (!stage) return

  // 大背景：窗口透明（Windows 上是系统亚克力），这层色雾给玻璃提供折射内容
  document.body.dataset.backdrop = 'mesh'

  installToast()
  mount(stage)
  initGlass()
  installFullscreenButton()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
