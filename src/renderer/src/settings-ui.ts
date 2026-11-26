/**
 * 模型设置面板（P2 的界面部分）。
 *
 * 风格沿用全站：液态玻璃 + 苹果式克制 ——
 *   · 一层毛玻璃底（blur 28 / saturate 180），不用边框，靠投影分层
 *   · 圆角 26px，和「学习者画像」浮层同一套规格
 *   · 入场 scale(.96) + opacity（不用 scale(0)），180ms ease-out
 *   · 文字层级只有三级：标题 / 标签 / 说明，全部中性灰阶
 *
 * 安全：输入框是 password 型，保存后立刻清空；界面永远不显示已存的密钥。
 */

import { resetOnboarding, showOnboarding } from './onboarding'

const STYLE_ID = 'settings-ui-style'

const CSS = `
.set-entry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #0a5cc4;
  background: rgba(10, 132, 255, 0.12);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.set-entry-btn:hover { background: rgba(10, 132, 255, 0.2); }
.set-entry-btn:active { transform: scale(0.96); }
/* 「API Key」和「去学习」绑成一组：footer 在窄栏里会换行，
   绑在一起才能保证它俩始终相邻、且顺序固定（API Key 在左，去学习 在右）。 */
.footer-pair { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.set-entry-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #d70015;
  box-shadow: 0 0 0 2px rgba(215, 0, 21, 0.14);
}
.set-entry-dot[data-on] { background: #1d9a4b; box-shadow: 0 0 0 2px rgba(29, 154, 75, 0.16); }
.set-entry-note {
  font-size: 11px;
  font-weight: 400;
  color: #5a6a7a;
}

.set-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  background: rgba(18, 26, 38, 0.26);
  backdrop-filter: blur(6px);
  opacity: 1;
  transition: opacity 180ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
@starting-style { .set-mask { opacity: 0; } }

.set-panel {
  width: min(480px, calc(100vw - 48px));
  padding: 22px 24px 18px;
  border-radius: 26px;
  color: var(--label-1, #10151c);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 24px 70px rgba(30, 44, 62, 0.24);
  -webkit-app-region: no-drag;
  transform: scale(1);
  transition: transform 220ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 220ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
@starting-style { .set-panel { opacity: 0; transform: scale(0.96); } }

.set-head { display: flex; align-items: center; justify-content: space-between; }
.set-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.set-close {
  border: 0; background: transparent; cursor: pointer;
  font-size: 14px; color: var(--label-2, #5a6a7a);
}
.set-sub { margin: 6px 0 16px; font-size: 12px; color: var(--label-2, #5a6a7a); line-height: 1.5; }

.set-field { display: block; margin-bottom: 12px; }
.set-label { display: block; font-size: 12px; color: var(--label-2, #5a6a7a); margin-bottom: 5px; }
.set-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  color: var(--label-1, #10151c);
  background: rgba(196, 219, 242, 0.34);
  box-shadow: inset 0 1px 2px rgba(70, 100, 140, 0.12);
  outline: none;
}
.set-input:focus { background: rgba(196, 219, 242, 0.5); }
.set-input::placeholder { color: rgba(90, 106, 122, 0.7); }

.set-row { display: flex; gap: 8px; align-items: center; }
.set-row .set-input { flex: 1; }

.set-status {
  min-height: 18px;
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--label-2, #5a6a7a);
}
.set-status[data-tone='ok'] { color: #1d9a4b; }
.set-status[data-tone='err'] { color: #d70015; }

.set-actions { display: flex; gap: 8px; justify-content: flex-end; }
.set-btn {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  color: var(--label-1, #10151c);
  background: rgba(120, 148, 178, 0.14);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.set-btn:active { transform: scale(0.96); }
.set-btn.primary {
  color: #fff;
  background: linear-gradient(180deg, #0a84ff, #0a72e0);
  box-shadow: 0 6px 16px rgba(10, 132, 255, 0.28);
}
.set-btn:disabled { opacity: 0.5; cursor: default; }
`

interface SettingsInfo {
  baseUrl: string
  model: string
  hasKey: boolean
  source: 'env' | 'stored' | 'none'
  encryption: { available: boolean; backend: string }
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

let mask: HTMLElement | null = null

export function closeSettings(): void {
  mask?.remove()
  mask = null
}

export async function openSettings(): Promise<void> {
  closeSettings()
  ensureStyle()

  const api = window.costudy
  if (!api?.settingsGet) {
    window.__toast?.('设置接口没接上')
    return
  }

  const info = (await api.settingsGet()) as SettingsInfo
  const isWeb = document.documentElement.dataset.platform === 'web'
  const sourceText = (source: SettingsInfo['source']) =>
    source === 'env'
      ? '当前用的是环境变量里的密钥（优先级最高）'
      : source === 'stored'
        ? isWeb ? '当前使用浏览器内保存的密钥' : '当前使用已加密保存的密钥'
        : isWeb ? '还没有配置密钥，可使用允许浏览器访问的模型接口。' : '还没有配置密钥，模型调用会走离线桩'
  const keyInfo = isWeb
    ? '密钥保存在此浏览器，未使用系统加密。连接时会发给下方 Base URL 对应的服务。'
    : `密钥用系统加密保存（${esc(info.encryption.backend)}），界面不会再显示明文。`

  const wrap = document.createElement('div')
  wrap.className = 'set-mask'
  wrap.innerHTML = `
    <div class="set-panel" role="dialog" aria-label="模型设置">
      <div class="set-head">
        <span class="set-title">模型设置</span>
        <button class="set-close" data-set-close aria-label="关闭">✕</button>
      </div>
      <p class="set-sub">
        <span data-set-source>${esc(sourceText(info.source))}</span><br />
        ${keyInfo}
      </p>

      <label class="set-field">
        <span class="set-label" data-set-key-label>API Key${info.hasKey ? '（已配置，留空表示不修改）' : ''}</span>
        <input class="set-input" type="password" data-set-key
               placeholder="${info.hasKey ? '已配置 ••••••••' : 'sk-...'}" autocomplete="off" spellcheck="false" />
      </label>

      <label class="set-field">
        <span class="set-label">Base URL</span>
        <input class="set-input" data-set-base value="${esc(info.baseUrl)}" spellcheck="false" />
      </label>

      <label class="set-field">
        <span class="set-label">模型（可手填，服务端改了 id 也不用等更新）</span>
        <input class="set-input" data-set-model list="set-model-list" spellcheck="false" />
        <datalist id="set-model-list">
          <option value="deepseek-flash"></option>
          <option value="deepseek-v4-pro"></option>
        </datalist>
      </label>

      ${isWeb ? '' : `<div class="set-field">
        <span class="set-label">代码工作区（模型跑代码时，只有这个目录里的写入不需要确认）</span>
        <div class="set-row">
          <input class="set-input" data-set-ws readonly title="用右边的按钮选择目录" />
          <button class="set-btn" data-set-ws-pick>选择…</button>
        </div>
      </div>`}

      <div class="set-status" data-set-status></div>

      <div class="set-actions">
        <button class="set-btn" data-set-replay title="重新播放首启引导">重看引导</button>
        <button class="set-btn" data-set-clear>清除密钥</button>
        <button class="set-btn" data-set-test>测试连接</button>
        <button class="set-btn primary" data-set-save>保存</button>
      </div>
    </div>
  `
  document.body.appendChild(wrap)
  mask = wrap

  const keyInput = wrap.querySelector<HTMLInputElement>('[data-set-key]')!
  const baseInput = wrap.querySelector<HTMLInputElement>('[data-set-base]')!
  const modelInput = wrap.querySelector<HTMLInputElement>('[data-set-model]')!
  const wsInput = wrap.querySelector<HTMLInputElement>('[data-set-ws]')
  const status = wrap.querySelector<HTMLElement>('[data-set-status]')!
  const source = wrap.querySelector<HTMLElement>('[data-set-source]')!
  const keyLabel = wrap.querySelector<HTMLElement>('[data-set-key-label]')!
  modelInput.value = info.model

  const refreshKeyStatus = async (): Promise<void> => {
    const current = await api.settingsGet()
    source.textContent = sourceText(current.source)
    keyLabel.textContent = current.hasKey ? 'API Key（已配置，留空表示不修改）' : 'API Key'
    keyInput.placeholder = current.hasKey ? '已配置 ••••••••' : 'sk-...'
  }

  // 工作区：异步取，取不到就留空（不挡住面板打开）
  if (wsInput && api.workspaceGet) {
    void api
      .workspaceGet()
      .then((ws) => {
        wsInput.value = ws.root
        wsInput.title = ws.root === ws.fallback ? '默认位置：' + ws.fallback : ws.root
      })
      .catch(() => {
        wsInput.value = '（读不到）'
      })
    wrap.querySelector('[data-set-ws-pick]')?.addEventListener('click', () => {
      void (async () => {
        try {
          const res = await api.workspacePick?.()
          if (!res) return
          if (res.canceled) return
          wsInput.value = res.root
          say('工作区已改为：' + res.root, 'ok')
        } catch (err) {
          say('改工作区失败：' + (err instanceof Error ? err.message : String(err)), 'err')
        }
      })()
    })
  } else if (wsInput) {
    wsInput.value = '（接口不可用）'
  }

  const say = (text: string, tone: 'ok' | 'err' | '' = ''): void => {
    status.textContent = text
    status.dataset['tone'] = tone
  }

  if (!isWeb && !info.encryption.available) {
    say('这台机器上系统加密不可用，将无法保存密钥', 'err')
  }

  wrap.querySelector('[data-set-close]')?.addEventListener('click', closeSettings)
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeSettings()
  })
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') closeSettings()
    },
    { once: true },
  )

  wrap.querySelector('[data-set-save]')?.addEventListener('click', () => {
    void (async () => {
      const patch: { apiKey?: string; baseUrl?: string; model?: string } = {
        baseUrl: baseInput.value.trim(),
        model: modelInput.value.trim() || info.model,
      }
      if (keyInput.value.trim()) patch.apiKey = keyInput.value.trim()
      const result = await api.settingsSave(patch)
      if (result.ok) {
        keyInput.value = ''
        await refreshKeyStatus()
        say('已保存。可以点「测试连接」确认能不能通。', 'ok')
      } else {
        say('保存失败：' + (result.error ?? '未知原因'), 'err')
      }
    })()
  })

  wrap.querySelector('[data-set-replay]')?.addEventListener('click', () => {
    closeSettings()
    resetOnboarding()
    window.setTimeout(() => showOnboarding(true), 120)
  })

  wrap.querySelector('[data-set-clear]')?.addEventListener('click', () => {
    void (async () => {
      await api.settingsClear()
      keyInput.value = ''
      await refreshKeyStatus()
      say(isWeb ? '已清除此浏览器里保存的密钥。' : '已清除密钥，模型调用会走离线桩。', '')
    })()
  })

  wrap.querySelector('[data-set-test]')?.addEventListener('click', () => {
    void (async () => {
      say('正在连接…')
      const result = await api.settingsTest(isWeb ? {
        apiKey: keyInput.value.trim() || undefined,
        baseUrl: baseInput.value.trim(),
        model: modelInput.value.trim() || info.model,
      } : undefined)
      if (result.ok) {
        say(`连接正常 · ${result.ms}ms · ${result.client} · 「${result.snippet ?? ''}」`, 'ok')
      } else {
        say(`连接失败（${result.client}）：${result.error ?? '未知错误'}`, 'err')
      }
    })()
  })
}

/**
 * 入口按钮：放在 Studio 预览栏底部的「去学习 →」右边。
 *
 * 为什么不做成角落里的齿轮：齿轮太隐蔽，用户根本不知道有设置。
 * 这里明确写「API Key」，并用一个红/绿点表示"配没配"，
 * 让人一眼看见、一眼知道状态。
 *
 * 变体重建 DOM 会把它冲掉，所以用 MutationObserver 补挂。
 */
export function installSettingsEntry(): void {
  ensureStyle()

  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer) return
    if (footer.querySelector('.set-entry-btn')) return

    const goLearn = footer.querySelector('[data-golearn]')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'set-entry-btn'
    btn.title = '配置模型 API Key'
    btn.innerHTML = '<span class="set-entry-dot"></span>API Key'

    btn.addEventListener('click', () => void openSettings())
    // 按需求调换顺序：API Key 放到「去学习」左边。
    // 顺带做成一组 —— footer 在窄栏里会换行，不绑成一团的话两个按钮会被拆到两行去。
    const goLearn2 = goLearn
    if (goLearn2?.parentElement === footer) {
      const pair = document.createElement('span')
      pair.className = 'footer-pair'
      footer.insertBefore(pair, goLearn2)
      pair.appendChild(btn)
      pair.appendChild(goLearn2)
    } else {
      footer.appendChild(btn)
    }

    // 顺手把状态点刷成真实的"配没配"
    void (async () => {
      const info = await window.costudy?.settingsGet?.()
      const dot = btn.querySelector<HTMLElement>('.set-entry-dot')
      if (dot) dot.toggleAttribute('data-on', Boolean(info?.hasKey))
      btn.title = info?.hasKey ? 'API Key 已配置，点这里修改' : '还没有配置 API Key，点这里设置'
    })()
  }

  window.setTimeout(() => {
    paint()
    const observer = new MutationObserver(() => paint())
    observer.observe(document.body, { childList: true, subtree: true })
  }, 350)
}
