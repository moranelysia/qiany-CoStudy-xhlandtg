/**
 * 夜间模式 · 第 1 步（只动两层：页面底色 + 面板底色）
 *
 * 【为什么只改这两层】
 *   上一版一次性把所有组件都改深，结果浅色底 + 深色面板糊成一团。
 *   这次先把「底」和「面」两层定下来，其它一律不动 ——
 *   等这两层看起来对了，再逐块推进（渐变字、输入框、气泡、玻璃高光）。
 *
 * 【只放开关，不改组件样式】
 *   组件继续用原来的 token；这里只覆盖两个颜色值，
 *   所以白天模式一行都没被影响。
 */

const KEY = 'costudy.theme'


function readTheme(): 'light' | 'dark' {
  try {
    const saved = window.localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* 忽略 */
  }
  return 'light'
}

export function applyStoredTheme(): void {
  document.documentElement.dataset['theme'] = readTheme()
}

export function installThemeToggle(): void {
  if (document.querySelector('.theme-switch')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'theme-switch'
  btn.setAttribute('aria-label', '切换白天 / 夜间')
  const thumb = document.createElement('span')
  thumb.className = 'theme-switch-thumb'
  btn.appendChild(thumb)

  const paint = (): void => {
    const dark = document.documentElement.dataset['theme'] === 'dark'
    thumb.textContent = dark ? '☾' : '☀'
    btn.title = dark ? '现在是夜间（第 1 步：只改了底色和面板）' : '现在是白天'
  }

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset['theme'] = next
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      /* 忽略 */
    }
    paint()
  })

  paint()
  document.body.appendChild(btn)
}
