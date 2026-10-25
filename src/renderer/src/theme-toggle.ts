/**
 * 白天 / 夜间切换按钮（参考图二图三的 3D 拨杆）。
 *
 * 【为什么不放在顶部 42px 里】
 *   titleBarOverlay 的顶部 42px 是原生 caption，会吞掉鼠标事件 ——
 *   上一轮灵动岛就是这么点不动的。所以开关放在 42px 之下。
 *
 * 【为什么自己做而不是用现成组件】
 *   参考图是一个有质感的 3D 拨杆（亮面胶囊 + 太阳/月亮滑块 + 星星/云）。
 *   现成开关组件都是扁平的，做不出这个层次，索性 CSS 手写。
 */

const STYLE_ID = 'theme-switch-style'

const CSS = `
.theme-switch {
  position: fixed;
  top: calc(var(--titlebar-overlay, 42px) + 10px);
  right: 14px;
  z-index: 60;
  width: 74px;
  height: 36px;
  padding: 4px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(232, 238, 246, 0.9));
  box-shadow:
    0 1px 1px rgba(255, 255, 255, 0.9) inset,
    0 -2px 6px rgba(120, 150, 190, 0.25) inset,
    0 6px 16px rgba(70, 100, 140, 0.22);
  transition: background 260ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

/* 夜间：胶囊本身变深，并透出星空 */
:root[data-theme='dark'] .theme-switch {
  background:
    radial-gradient(circle at 22% 30%, rgba(255, 255, 255, 0.85) 0 1px, transparent 1.4px),
    radial-gradient(circle at 38% 68%, rgba(255, 255, 255, 0.7) 0 1px, transparent 1.4px),
    radial-gradient(circle at 52% 24%, rgba(255, 255, 255, 0.6) 0 1px, transparent 1.4px),
    radial-gradient(circle at 14% 62%, rgba(255, 255, 255, 0.5) 0 1px, transparent 1.4px),
    linear-gradient(180deg, #12233c, #0a1526);
  box-shadow:
    0 1px 1px rgba(255, 255, 255, 0.14) inset,
    0 -2px 8px rgba(0, 0, 0, 0.5) inset,
    0 6px 18px rgba(4, 10, 20, 0.55);
}

/* 滑块：太阳 / 月亮 */
.theme-switch-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 15px;
  line-height: 1;
  background: radial-gradient(circle at 34% 28%, #fff6d8, #ffd25e 55%, #f0a828);
  box-shadow:
    0 1px 2px rgba(255, 255, 255, 0.9) inset,
    0 4px 10px rgba(220, 150, 20, 0.45);
  transition:
    transform 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

:root[data-theme='dark'] .theme-switch-thumb {
  transform: translateX(38px);
  background: radial-gradient(circle at 34% 28%, #f4f0ff, #cbb6ff 50%, #8f7ae0);
  box-shadow:
    0 1px 2px rgba(255, 255, 255, 0.7) inset,
    0 0 14px rgba(180, 160, 255, 0.55),
    0 4px 12px rgba(10, 10, 30, 0.5);
}

/* 右侧的小云（只在白天显示） */
.theme-switch-cloud {
  position: absolute;
  right: 12px;
  top: 15px;
  width: 18px;
  height: 8px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(140, 170, 210, 0.4);
  transition: opacity 200ms var(--ease-out);
}
.theme-switch-cloud::after {
  content: '';
  position: absolute;
  left: 5px;
  top: -4px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #fff;
}
:root[data-theme='dark'] .theme-switch-cloud {
  opacity: 0;
}

.theme-switch:active .theme-switch-thumb {
  transform: scale(0.94);
}
:root[data-theme='dark'] .theme-switch:active .theme-switch-thumb {
  transform: translateX(38px) scale(0.94);
}

@media (prefers-reduced-motion: reduce) {
  .theme-switch,
  .theme-switch-thumb {
    transition-duration: 1ms;
  }
}
`

export function applyStoredTheme(storageKey: string): void {
  let theme: 'light' | 'dark' = 'light'
  try {
    const saved = window.localStorage.getItem(storageKey)
    // 默认白天：不跟系统偏好走。
    // 踩过：系统是深色时按 prefers-color-scheme 自动切夜间，
    // 用户打开发现"我明明是白天模式"，反而困惑。用户点过就记住他的选择。
    if (saved === 'dark' || saved === 'light') theme = saved
  } catch {
    /* localStorage 不可用时按白天跑 */
  }
  document.documentElement.dataset['theme'] = theme
}

export function installThemeToggle(storageKey: string): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'theme-switch'
  btn.setAttribute('aria-label', '切换白天 / 夜间模式')

  const thumb = document.createElement('span')
  thumb.className = 'theme-switch-thumb'
  const cloud = document.createElement('span')
  cloud.className = 'theme-switch-cloud'
  btn.append(cloud, thumb)

  const paint = (): void => {
    const dark = document.documentElement.dataset['theme'] === 'dark'
    thumb.textContent = dark ? '☾' : '☀'
    btn.title = dark ? '现在是夜间模式，点一下切回白天' : '现在是白天模式，点一下切到夜间'
  }

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset['theme'] = next
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      /* 忽略 */
    }
    paint()
    window.__toast?.(next === 'dark' ? '已切到夜间模式' : '已切回白天模式')
  })

  paint()
  document.body.appendChild(btn)
}
