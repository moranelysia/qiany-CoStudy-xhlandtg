/**
 * 首启引导（F0）。
 *
 * 目标：让 API Key 在**最显眼的位置**出现一次，然后让用户选"怎么造角色"。
 *
 * 三个约束（按用户要求"不要出现某一步卡住"）：
 *   1. 可跳过 —— 不配 key 也能进去看界面，只是 M2/M3 标灰
 *   2. 不强制弹出第二次 —— 完成后写 localStorage，之后走顶栏入口
 *   3. 视觉沿用全站玻璃规格，不引入第二套语言
 */

import { openProfileForm } from './profile-ui'
import { openModeHome } from './mode-home'
import { openM3Chat } from './m3-ui'

const KEY = 'costudy.onboarding'

const CSS = `
.ob-mask {
  position: fixed; inset: 0; z-index: 120;
  display: grid; place-items: center;
  background:
    radial-gradient(900px 520px at 76% -10%, rgba(96,150,255,.16), transparent 62%),
    rgba(18, 26, 38, 0.30);
  backdrop-filter: blur(8px);
  opacity: 1;
  transition: opacity 200ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .ob-mask { opacity: 0; } }

.ob-panel {
  width: min(560px, calc(100vw - 56px));
  padding: 26px 28px 22px;
  border-radius: 28px;
  color: #10151c;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(30px) saturate(180%);
  box-shadow: 0 28px 80px rgba(30, 44, 62, 0.26);
  -webkit-app-region: no-drag;
  transform: scale(1);
  transition: transform 240ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    opacity 240ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .ob-panel { opacity: 0; transform: scale(0.97); } }

.ob-step { font-size: 11px; letter-spacing: .08em; color: #8a97a8; text-transform: uppercase; }
.ob-title { margin: 6px 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.ob-sub { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #5a6a7a; }

.ob-field { display: block; margin-bottom: 10px; }
.ob-label { display: block; font-size: 12px; color: #5a6a7a; margin-bottom: 6px; }
.ob-input {
  width: 100%; height: 38px; padding: 0 14px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; color: #10151c; outline: none;
  background: rgba(196, 219, 242, 0.36);
  box-shadow: inset 0 1px 2px rgba(70,100,140,.12);
}
.ob-input:focus { background: rgba(196, 219, 242, 0.52); }
.ob-status { min-height: 18px; font-size: 12px; color: #5a6a7a; margin: 2px 0 12px; }
.ob-status[data-tone='ok'] { color: #1d9a4b; }
.ob-status[data-tone='err'] { color: #d70015; }

.ob-actions { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 18px; }
.ob-btn {
  height: 34px; padding: 0 16px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; cursor: pointer; color: #10151c;
  background: rgba(120,148,178,.14);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.ob-btn:active { transform: scale(0.96); }
.ob-btn.primary {
  color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0);
  box-shadow: 0 8px 20px rgba(10,132,255,.28);
}
.ob-btn:disabled { opacity: .45; cursor: default; }

.ob-divider { height: 1px; background: rgba(120,148,178,.18); margin: 4px 0 16px; }

/* 模式选择已统一到 mode-home 的「＋新建角色」页，这里不再重复一套 */
.ob-modes { display: none !important; grid-template-columns: repeat(3, 1fr); grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ob-mode {
  text-align: left; padding: 14px 14px 12px; border: 0; border-radius: 18px;
  cursor: pointer; font: inherit; color: inherit;
  background: rgba(196, 219, 242, 0.28);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.ob-mode:hover { background: rgba(196, 219, 242, 0.44); }
.ob-mode:active { transform: scale(0.97); }
.ob-mode[data-dim] { opacity: .5; cursor: not-allowed; }
.ob-mode-name { display: block; font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.ob-mode-desc { display: block; font-size: 11px; line-height: 1.5; color: #5a6a7a; }
.ob-mode-tag {
  display: inline-block; margin-bottom: 6px; padding: 1px 7px; border-radius: 999px;
  font-size: 10px; color: #0a5cc4; background: rgba(10,132,255,.12);
}
`

export function showOnboarding(force = false): void {
  if (!force && readDone()) return
  if (document.querySelector('.ob-mask')) return

  if (!document.getElementById('ob-style')) {
    const style = document.createElement('style')
    style.id = 'ob-style'
    style.textContent = CSS
    document.head.appendChild(style)
  }

  const wrap = document.createElement('div')
  wrap.className = 'ob-mask'
  const isWeb = document.documentElement.dataset.platform === 'web'
  const keyInfo = isWeb
    ? '网页端的密钥保存在当前浏览器，未使用系统加密。连接模型时会发送给你在设置里选择的服务。也可以先跳过。'
    : '密钥保存在本机并使用系统加密。完成连接后即可开始伴学问答。'
  wrap.innerHTML = `
    <div class="ob-panel" role="dialog" aria-label="开始使用">
      <div class="ob-step">第 1 步 · 连接模型</div>
      <h1 class="ob-title">${isWeb ? '先给它一把钥匙' : '连接你的模型'}</h1>
      <p class="ob-sub">
        ${keyInfo}
      </p>

      <label class="ob-field">
        <span class="ob-label">API Key</span>
        <input class="ob-input" type="password" data-ob-key placeholder="sk-..." autocomplete="off" spellcheck="false" />
      </label>
      <div class="ob-status" data-ob-status></div>

      <div class="ob-actions">
        <button class="ob-btn" data-ob-skip>先跳过</button>
        ${isWeb ? '' : '<button class="ob-btn" data-ob-settings>模型设置</button>'}
        <button class="ob-btn" data-ob-test>测试连接</button>
        <button class="ob-btn primary" data-ob-save>保存并继续</button>
      </div>

      <div class="ob-divider"></div>

      <div class="ob-step">第 2 步 · 你想怎么造这个角色</div>
      <div class="ob-modes">
        <button class="ob-mode" data-ob-mode="manual">
          <span class="ob-mode-name">自己调参数</span>
          <span class="ob-mode-desc">精细控制性格与教法，AI 只负责收尾提示词</span>
        </button>
        <button class="ob-mode" data-ob-mode="profile">
          <span class="ob-mode-name">描述我自己</span>
          <span class="ob-mode-desc">先立学情：年龄、学段、薄弱点、想学的知识点</span>
        </button>
        <button class="ob-mode" data-ob-mode="chat">
          <span class="ob-mode-name">跟 AI 聊出来</span>
          <span class="ob-mode-desc">一句话说想要谁（比如奶龙），AI 查资料写提示词</span>
        </button>
      </div>
    </div>
  `
  document.body.appendChild(wrap)

  const keyInput = wrap.querySelector<HTMLInputElement>('[data-ob-key]')!
  const status = wrap.querySelector<HTMLElement>('[data-ob-status]')!
  const api = window.costudy

  const say = (text: string, tone: 'ok' | 'err' | '' = ''): void => {
    status.textContent = text
    status.dataset['tone'] = tone
  }

  const done = (): void => {
    writeDone()
    wrap.remove()
    window.setTimeout(() => openModeHome(), 400)
  }

  wrap.querySelector('[data-ob-skip]')?.addEventListener('click', () => {
    writeDone()
    wrap.remove()
    window.__toast?.(isWeb ? '已跳过，右下角的「API Key」随时可以配' : '可在伴学页的「模型设置」继续连接。')
  })

  wrap.querySelector('[data-ob-settings]')?.addEventListener('click', () => {
    writeDone()
    wrap.remove()
    void import('./settings-ui').then((module) => module.openSettings())
  })

  const testButton = wrap.querySelector<HTMLButtonElement>('[data-ob-test]')!
  const saveButton = wrap.querySelector<HTMLButtonElement>('[data-ob-save]')!
  const connect = async (persist: boolean): Promise<void> => {
    const key = keyInput.value.trim()
    if (persist && !key) {
      say('请填写 API Key，或者先跳过。', 'err')
      return
    }
    testButton.disabled = true
    saveButton.disabled = true
    say('正在连接…')
    try {
      const test = await api?.settingsTest?.(key ? { apiKey: key } : undefined)
      if (!test?.ok) {
        say(test?.error ?? '连接失败，请检查模型设置。', 'err')
        return
      }
      if (persist) {
        const result = await api?.settingsSave?.({ apiKey: key })
        if (!result?.ok) {
          say(result?.error ?? '无法保存模型设置。', 'err')
          return
        }
        if (wrap.isConnected) done()
        window.__toast?.('模型已连接')
      } else {
        say('连接正常 · ' + test.ms + 'ms · ' + test.client, 'ok')
      }
    } catch {
      say('暂时无法连接模型，请重试。', 'err')
    } finally {
      testButton.disabled = false
      saveButton.disabled = false
    }
  }
  testButton.addEventListener('click', () => void connect(false))
  saveButton.addEventListener('click', () => void connect(true))

  wrap.querySelectorAll<HTMLElement>('.ob-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('data-dim')) {
        window.__toast?.('这个模块还没做，先用「自己调参数」')
        return
      }
      const mode = btn.getAttribute('data-ob-mode')
      if (mode === 'chat') {
        done()
        window.setTimeout(() => openM3Chat(), 120)
        return
      }
      if (mode === 'profile') {
        done()
        window.setTimeout(() => void openProfileForm(), 120)
        return
      }
      done()
      window.__toast?.('开始吧，右边就是你的角色')
    })
  })
}

function readDone(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'done'
  } catch {
    return false
  }
}

function writeDone(): void {
  try {
    window.localStorage.setItem(KEY, 'done')
  } catch {
    /* 忽略 */
  }
}

/** 调试用：重新看一遍引导 */
export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* 忽略 */
  }
}
