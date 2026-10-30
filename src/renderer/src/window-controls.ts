/**
 * 自绘窗口按钮。
 *
 * 【为什么需要】
 *   Windows 会给带原生边框的窗口画一圈 DWM 描边（圆角 + 边线），它在网页外面，
 *   CSS 够不到 —— 界面顶部那条白边就是它。彻底去掉只能 frame: false，
 *   代价是系统的最小化/最大化/关闭也没了，所以这里补三个自绘按钮。
 *
 * 【退出为什么走 app:close】
 *   不是 window.close()。用户点"关闭"要的是整个程序退出，主进程那边是
 *   destroy + quit（见 src/main/index.ts 的 app:close 注释）。
 *
 * 【位置为什么是 46px × 3】
 *   squircle.css 里 .titlebar-drag 的右边界是 --titlebar-buttons: 138px，
 *   正好给这三个按钮留的；改按钮宽度就要同步改那个变量，否则拖拽区会盖住按钮。
 */
interface WinApi {
  minimize: () => void
  close: () => void
  toggleMaximize: () => Promise<boolean>
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (cb: (on: boolean) => void) => void
}

function winApi(): WinApi | null {
  const api = (window as unknown as { costudy?: Partial<WinApi> }).costudy
  if (!api) return null
  if (typeof api.minimize !== 'function' || typeof api.close !== 'function') return null
  if (typeof api.toggleMaximize !== 'function') return null
  return api as WinApi
}

const SVG = (inner: string): string =>
  '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true">' + inner + '</svg>'

const ICON_MIN = SVG('<path d="M2 5h6" stroke="currentColor" stroke-width="1" />')
const ICON_MAX = SVG(
  '<rect x="2" y="2" width="6" height="6" stroke="currentColor" stroke-width="1" />',
)
const ICON_RESTORE = SVG(
  '<rect x="2" y="3" width="5" height="5" stroke="currentColor" stroke-width="1" />' +
    '<path d="M4 3V2h4v4H7" stroke="currentColor" stroke-width="1" />',
)
const ICON_CLOSE = SVG(
  '<path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" stroke-width="1" />',
)

export function installWindowControls(): void {
  const api = winApi()
  if (!api) return
  if (document.querySelector('[data-wincontrols]')) return

  const host = document.createElement('div')
  host.className = 'wincontrols'
  host.setAttribute('data-wincontrols', '')
  host.innerHTML =
    '<button type="button" class="wincontrols-btn" data-win="min" title="最小化" aria-label="最小化">' +
    ICON_MIN +
    '</button>' +
    '<button type="button" class="wincontrols-btn" data-win="max" title="最大化" aria-label="最大化">' +
    ICON_MAX +
    '</button>' +
    '<button type="button" class="wincontrols-btn is-close" data-win="close" title="退出" aria-label="退出">' +
    ICON_CLOSE +
    '</button>'
  document.body.appendChild(host)

  const maxBtn = host.querySelector<HTMLButtonElement>('[data-win="max"]')
  const paintMax = (on: boolean): void => {
    if (!maxBtn) return
    maxBtn.innerHTML = on ? ICON_RESTORE : ICON_MAX
    maxBtn.title = on ? '还原' : '最大化'
    maxBtn.setAttribute('aria-label', on ? '还原' : '最大化')
  }

  host.querySelector('[data-win="min"]')?.addEventListener('click', () => api.minimize())
  host.querySelector('[data-win="close"]')?.addEventListener('click', () => api.close())
  maxBtn?.addEventListener('click', () => {
    void api.toggleMaximize().then(paintMax).catch(() => undefined)
  })

  void api.isMaximized().then(paintMax).catch(() => undefined)
  if (typeof api.onMaximizeChange === 'function') api.onMaximizeChange(paintMax)
}
