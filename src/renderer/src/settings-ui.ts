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

const STYLE_ID = 'settings-ui-style'

const CSS = `
.settings-entry {
  position: fixed;
  right: 14px;
  bottom: 16px;
  z-index: 55;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 15px;
  color: #4a5b70;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(18px) saturate(170%);
  box-shadow: 0 6px 18px rgba(70, 100, 140, 0.18);
  -webkit-app-region: no-drag;
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.settings-entry:hover { background: rgba(255, 255, 255, 0.82); }
.settings-entry:active { transform: scale(0.94); }

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
  const sourceText =
    info.source === 'env'
      ? '当前用的是环境变量里的密钥（优先级最高）'
      : info.source === 'stored'
        ? '当前使用已加密保存的密钥'
        : '还没有配置密钥，模型调用会走离线桩'

  const wrap = document.createElement('div')
  wrap.className = 'set-mask'
  wrap.innerHTML = `
    <div class="set-panel" role="dialog" aria-label="模型设置">
      <div class="set-head">
        <span class="set-title">模型设置</span>
        <button class="set-close" data-set-close aria-label="关闭">✕</button>
      </div>
      <p class="set-sub">
        ${esc(sourceText)}<br />
        密钥用系统加密保存（${esc(info.encryption.backend)}），界面不会再显示明文。
      </p>

      <label class="set-field">
        <span class="set-label">API Key ${info.hasKey ? '（已配置，留空表示不修改）' : ''}</span>
        <input class="set-input" type="password" data-set-key
               placeholder="${info.hasKey ? '已配置 ••••••••' : 'sk-...'}" autocomplete="off" spellcheck="false" />
      </label>

      <label class="set-field">
        <span class="set-label">Base URL</span>
        <input class="set-input" data-set-base value="${esc(info.baseUrl)}" spellcheck="false" />
      </label>

      <label class="set-field">
        <span class="set-label">模型</span>
        <select class="set-input" data-set-model>
          <option value="deepseek-chat">deepseek-chat（对话）</option>
          <option value="deepseek-reasoner">deepseek-reasoner（推理）</option>
        </select>
      </label>

      <div class="set-status" data-set-status></div>

      <div class="set-actions">
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
  const modelSelect = wrap.querySelector<HTMLSelectElement>('[data-set-model]')!
  const status = wrap.querySelector<HTMLElement>('[data-set-status]')!
  modelSelect.value = info.model

  const say = (text: string, tone: 'ok' | 'err' | '' = ''): void => {
    status.textContent = text
    status.dataset['tone'] = tone
  }

  if (!info.encryption.available) {
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
        model: modelSelect.value,
      }
      if (keyInput.value.trim()) patch.apiKey = keyInput.value.trim()
      const result = await api.settingsSave(patch)
      if (result.ok) {
        keyInput.value = ''
        keyInput.placeholder = '已配置 ••••••••'
        say('已保存。可以点「测试连接」确认能不能通。', 'ok')
      } else {
        say('保存失败：' + (result.error ?? '未知原因'), 'err')
      }
    })()
  })

  wrap.querySelector('[data-set-clear]')?.addEventListener('click', () => {
    void (async () => {
      await api.settingsClear()
      keyInput.value = ''
      keyInput.placeholder = 'sk-...'
      say('已清除密钥，模型调用会走离线桩。', '')
    })()
  })

  wrap.querySelector('[data-set-test]')?.addEventListener('click', () => {
    void (async () => {
      say('正在连接…')
      const result = await api.settingsTest()
      if (result.ok) {
        say(`连接正常 · ${result.ms}ms · ${result.client} · 「${result.snippet ?? ''}」`, 'ok')
      } else {
        say(`连接失败（${result.client}）：${result.error ?? '未知错误'}`, 'err')
      }
    })()
  })
}

/** 角落里那枚玻璃齿轮 */
export function installSettingsEntry(): void {
  if (document.querySelector('.settings-entry')) return
  ensureStyle()
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'settings-entry'
  btn.title = '模型设置'
  btn.setAttribute('aria-label', '模型设置')
  btn.textContent = '⚙'
  btn.addEventListener('click', () => void openSettings())
  document.body.appendChild(btn)
}
