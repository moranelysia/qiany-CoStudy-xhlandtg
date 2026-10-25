/**
 * 白天 / 夜间模式（参考图一：深海军蓝玻璃 + 月光水面）。
 *
 * 做法是**换 token，不是换样式表**：tokens.css 里所有颜色都走
 * --ground / --tone-* / --ink-* 这几个变量，所以夜间模式只要把
 * 这几个变量换掉，几十个组件自动跟着变 —— 不用一处一处写深色版。
 *
 * 少数几处玻璃是写死 rgba(255,255,255,…) 的，夜里会发白发灰，
 * 在这里用 [data-theme="dark"] 覆盖掉。
 */
import { installThemeToggle, applyStoredTheme } from './theme-toggle'

export const STORAGE_KEY = 'costudy.theme'

export function applyStoredThemeOnBoot(): void {
  applyStoredTheme(STORAGE_KEY)
}

export function installTheme(): void {
  installThemeToggle(STORAGE_KEY)
}
