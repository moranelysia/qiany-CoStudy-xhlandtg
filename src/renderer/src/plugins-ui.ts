/**
 * 插件页（灵动岛第二屏）。
 *
 * 原来是「新手引导」那一屏，现在换成插件列表：教法开关 + 能力插件，
 * 每一项都是可开关的。开关状态存主进程的 `记忆/plugins.json`。
 *
 * 为什么教法开关也放这儿：它们本质上就是"换一种教法"的插件，
 * 放同一栏才好讲"这个应用的能力都是可插拔的"。
 *
 * 【2026-11-02】页面顶部加权限模式条。原来"插件开着但跑不了代码"的死结在于：
 * 用户在**这一页**打开「代码执行」，却没有任何地方提示它还需要「工作模式」，
 * 而唯一的模式开关藏在伴学页右上角。现在开关就在能力列表上方，
 * 并且在聊天模式下给可执行插件挂一条「需切到工作模式」的提示。
 */
import { getMode, mountModeBar } from './mode-ui'
const STYLE_ID = 'plugins-ui-style'

const CSS = `
.pl-wrap { max-width: 720px; margin: 0 auto; padding: 8px 4px 40px; }
.pl-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.pl-title { font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
.pl-sub { font-size: 12.5px; color: var(--label-2); margin: 0 0 18px; line-height: 1.7; }
.pl-group { margin-bottom: 22px; }
.pl-group-title { font-size: 11.5px; font-weight: 600; color: var(--label-2); letter-spacing: .06em; margin-bottom: 8px; }
.pl-row {
  display: flex; align-items: center; gap: 14px;
  padding: 13px 4px; border-top: .5px solid rgba(120,148,178,.2);
}
.pl-row:first-of-type { border-top: 0; }
.pl-main { flex: 1; min-width: 0; }
.pl-name { font-size: 14px; font-weight: 600; color: var(--ink, #10151c); }
.pl-desc { margin-top: 3px; font-size: 12px; color: var(--label-2); line-height: 1.5; }
.pl-badge {
  display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; vertical-align: 2px;
}
.pl-badge.read { color: #0a5cc4; background: rgba(10,132,255,.12); }
.pl-badge.write { color: #8a5a00; background: rgba(214,158,46,.16); }
.pl-badge.exec { color: #b42318; background: rgba(180,35,24,.12); }
.pl-badge.off { color: #6b7a8a; background: rgba(120,148,178,.16); }
.pl-badge.on { color: #0b7d5b; background: rgba(16,168,122,.14); }
.pl-badge.need { color: #8a5a00; background: rgba(214,158,46,.18); }
.pl-switch {
  flex: none; position: relative; width: 46px; height: 27px; border: 0; padding: 0;
  border-radius: 999px; cursor: pointer; background: rgba(120,148,178,.34);
  transition: background-color .18s ease;
}
.pl-switch::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 21px; height: 21px;
  border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(16,21,28,.28);
  transition: transform .18s ease;
}
.pl-switch[data-on] { background: #34c759; }
.pl-switch[data-on]::after { transform: translateX(19px); }
.pl-switch[disabled] { cursor: not-allowed; opacity: .45; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface PluginItem {
  id: string
  name: string
  desc: string
  kind: 'teaching' | 'capability'
  enabled: boolean
  permission: 'read' | 'write' | 'exec'
  status?: string
  installed?: boolean
}

const PERM_LABEL: Record<string, string> = { read: '只读', write: '可写', exec: '可执行' }

function esc(text: string): string {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export function mountPlugins(stage: HTMLElement): void {
  ensureStyle()
  const web = document.documentElement.dataset.platform === 'web'
  const api = window.costudy as unknown as {
    pluginsGet?: () => Promise<PluginItem[]>
    pluginsSet?: (id: string, enabled: boolean) => Promise<PluginItem[]>
  } | undefined

  stage.innerHTML =
    '<div class="app v-studio v-plugins" style="grid-template-columns:1fr">' +
    '<div class="pl-wrap">' +
    '<div class="pl-head"><h1 class="pl-title" style="margin:0">插件</h1></div>' +
    (web
      ? '<p class="pl-sub">教法开关会影响模型怎样陪你学。作图、实验、代码执行、联网检索、语音输入和发图可在桌面版使用。</p>'
      : '<p class="pl-sub">这个应用的能力都是可插拔的：教法是一种插件，作图、代码、实验也是。关掉就完全不参与对话。</p>') +
    '<div data-mode-slot></div>' +
    '<div data-pl-list><div class="pl-sub">加载中…</div></div>' +
    '</div></div>'

  const host = stage.querySelector<HTMLElement>('[data-pl-list]')
  if (!host) return

  let last: PluginItem[] = []

  const paint = (list: PluginItem[]): void => {
    last = list
    const mode = getMode()
    const groups: Array<{ title: string; items: PluginItem[] }> = [
      { title: '教法', items: list.filter((p) => p.kind === 'teaching') },
      { title: web ? '桌面版能力' : '能力', items: list.filter((p) => p.kind === 'capability') },
    ]
    host.innerHTML = groups
      .map(
        (g) =>
          '<div class="pl-group"><div class="pl-group-title">' +
          esc(g.title) +
          '</div>' +
          g.items
            .map(
              (p) =>
                '<div class="pl-row">' +
                '<div class="pl-main"><div class="pl-name">' +
                esc(p.name) +
                '<span class="pl-badge ' +
                esc(p.permission) +
                '">' +
                esc(PERM_LABEL[p.permission] ?? p.permission) +
                '</span>' +
                (p.status ? '<span class="pl-badge ' + (p.installed === false ? 'off' : 'on') + '">' + esc(p.status) + '</span>' : '') +
                // 开关开着但权限不够：这一条才是"开了却跑不了"的真正原因，必须写在行上
                (p.enabled && p.permission === 'exec' && mode === 'chat'
                  ? '<span class="pl-badge need">需切到工作模式</span>'
                  : '') +
                '</div><div class="pl-desc">' +
                esc(p.desc) +
                '</div></div>' +
                '<button class="pl-switch" data-pl-id="' +
                esc(p.id) +
                '"' +
                (p.enabled ? ' data-on' : '') +
                (p.installed === false ? ' disabled' : '') +
                ' aria-label="' + esc(p.name) + '"' +
                ' aria-pressed="' + (p.enabled ? 'true' : 'false') + '"></button>' +
                '</div>',
            )
            .join('') +
          '</div>',
      )
      .join('')
  }

  // 权限条挂在能力列表正上方：用户在这一页打开「代码执行」，就得在这一页看见它还缺什么
  const modeSlot = stage.querySelector<HTMLElement>('[data-mode-slot]')
  if (modeSlot && !web) mountModeBar(modeSlot, () => { if (last.length) paint(last) })

  const load = async (): Promise<void> => {
    if (!api?.pluginsGet) {
      host.innerHTML = '<div class="pl-sub">插件接口不可用</div>'
      return
    }
    try {
      paint(await api.pluginsGet())
    } catch (err) {
      host.innerHTML = '<div class="pl-sub">读取失败：' + esc(err instanceof Error ? err.message : String(err)) + '</div>'
    }
  }

  host.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pl-id]')
    if (!btn || btn.disabled || !api?.pluginsSet) return
    const id = btn.dataset.plId ?? ''
    const next = !btn.hasAttribute('data-on')
    btn.toggleAttribute('data-on', next)
    btn.setAttribute('aria-pressed', next ? 'true' : 'false')
    void api
      .pluginsSet(id, next)
      .then(paint)
      .catch(() => {
        btn.toggleAttribute('data-on', !next)
        window.__toast?.('保存失败')
      })
  })

  void load()
}
