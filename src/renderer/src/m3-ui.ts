/**
 * M3 界面：跟 AI 聊出来
 *
 * 三段式，和「AI 收尾提示词」保持同一套节奏：
 *   聊一句 → 出草稿 + **伴学示例**（放大给你看）→「就这个」才落盘
 *
 * 为什么示例要占大块版面：
 *   "性格：活泼、爱用比喻"这种描述判断不出像不像；
 *   同一道题用这个口吻讲一遍，才看得出是不是你要的那个感觉。
 */
const STYLE_ID = 'm3-ui-style'

const CSS = `
.m3-mask {
  position: fixed; inset: 0; z-index: 118; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.3); backdrop-filter: blur(8px);
  opacity: 1; transition: opacity 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .m3-mask { opacity: 0; } }

.m3-panel {
  width: min(680px, calc(100vw - 56px)); max-height: min(82vh, 780px);
  display: flex; flex-direction: column; padding: 20px 22px 16px;
  border-radius: 26px; color: #10151c;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 26px 74px rgba(30, 44, 62, 0.26); -webkit-app-region: no-drag;
  transform: scale(1);
  transition: transform 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    opacity 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .m3-panel { opacity: 0; transform: scale(0.97); } }

.m3-head { display: flex; align-items: center; justify-content: space-between; }
.m3-title { font-size: 16px; font-weight: 700; }
.m3-close { border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #5a6a7a; }
.m3-sub { margin: 6px 0 12px; font-size: 12px; line-height: 1.6; color: #5a6a7a; }

.m3-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 2px 8px; min-height: 120px; }
.m3-msg { max-width: 84%; padding: 9px 13px; border-radius: 16px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.m3-msg.me { align-self: flex-end; color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0); }
.m3-msg.ai { align-self: flex-start; background: rgba(196, 219, 242, 0.32); }
.m3-msg.sys { align-self: center; color: #8a97a8; font-size: 11px; background: transparent; }

.m3-draft { margin-top: 10px; padding: 14px 16px; border-radius: 18px; background: rgba(10, 132, 255, 0.07); }
.m3-draft-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.m3-draft-name { font-size: 15px; font-weight: 700; }
.m3-draft-meta { font-size: 11px; color: #5a6a7a; }
.m3-sample {
  margin-top: 8px; padding: 12px 14px; border-radius: 14px; font-size: 13px; line-height: 1.7;
  white-space: pre-wrap; background: rgba(255, 255, 255, 0.7); color: #22303f;
}
.m3-sample-label { font-size: 11px; color: #8a97a8; margin-bottom: 6px; }

.m3-compose { display: flex; gap: 8px; margin-top: 12px; }
.m3-input {
  flex: 1; height: 38px; padding: 0 14px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; color: #10151c; outline: none;
  background: rgba(196, 219, 242, 0.32); box-shadow: inset 0 1px 2px rgba(70,100,140,.1);
}
.m3-input:focus { background: rgba(196, 219, 242, 0.48); }
.m3-btn {
  height: 38px; padding: 0 16px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; cursor: pointer; color: #10151c;
  background: rgba(120, 148, 178, 0.16);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.m3-btn:active { transform: scale(0.96); }
.m3-btn.primary { color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0); box-shadow: 0 8px 20px rgba(10,132,255,.26); }
.m3-btn:disabled { opacity: .5; cursor: default; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

interface DraftShape {
  name?: string
  emoji?: string
  address?: string
  style?: string
  personality?: string
}

export function openM3Chat(): void {
  ensureStyle()
  const api = window.costudy
  if (!api?.cardChatDraft) {
    window.__toast?.('M3 接口没接上')
    return
  }

  const mask = document.createElement('div')
  mask.className = 'm3-mask'
  mask.innerHTML = `
    <div class="m3-panel" role="dialog" aria-label="跟 AI 聊出来">
      <div class="m3-head">
        <span class="m3-title">跟 AI 聊出来</span>
        <button class="m3-close" data-m3-close aria-label="关闭">✕</button>
      </div>
      <p class="m3-sub">
        说一句你想要谁（例：我想要一个奶龙来伴学）。AI 会写出角色设定，并先讲一道题给你听 ——
        你觉得"就是这个人"，再落盘。
      </p>
      <div class="m3-log" data-m3-log></div>
      <div class="m3-compose">
        <input class="m3-input" data-m3-input placeholder="我想要一个…来伴学" />
        <button class="m3-btn" data-m3-fetch title="贴一个网址或一段文字作为资料">贴资料</button>
        <button class="m3-btn primary" data-m3-send>发送</button>
      </div>
    </div>
  `
  document.body.appendChild(mask)

  const log = mask.querySelector<HTMLElement>('[data-m3-log]')!
  const input = mask.querySelector<HTMLInputElement>('[data-m3-input]')!
  const send = mask.querySelector<HTMLButtonElement>('[data-m3-send]')!

  const say = (role: 'me' | 'ai' | 'sys', text: string): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'm3-msg ' + role
    el.textContent = text
    log.appendChild(el)
    log.scrollTop = log.scrollHeight
    return el
  }

  const close = (): void => mask.remove()
  mask.querySelector('[data-m3-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  // 资料：DS 这个接口没有原生联网搜索（模型自己拒绝了），所以由用户提供、我们来抓
  let context = ''

  say('sys', '试着说：我想要一个奶龙来伴学')
  say('sys', '冷门角色可以点「贴资料」，贴一个网址或一段介绍')

  const run = (): void => {
    void (async () => {
      const brief = input.value.trim()
      if (!brief) return
      input.value = ''
      say('me', brief)
      const waiting = say('ai', '正在想这个人会怎么讲话…')
      send.disabled = true
      try {
        const result = await api.cardChatDraft({ brief, context })
        waiting.remove()
        if (!result.ok) {
          say('ai', '没生成成功：' + (result.error ?? '未知原因'))
          return
        }
        const draft = (result.draft ?? {}) as DraftShape
        say(
          'ai',
          '写好了。' +
            (draft.name ? 'TA 叫「' + draft.name + '」' : '') +
            (result.sample ? ' 先听 TA 讲一道题：' : ''),
        )

        const box = document.createElement('div')
        box.className = 'm3-draft'
        box.innerHTML =
          '<div class="m3-draft-head">' +
          '<span style="font-size:20px">' + (draft.emoji ?? '✧') + '</span>' +
          '<div><div class="m3-draft-name">' + (draft.name ?? '未命名') + '</div>' +
          '<div class="m3-draft-meta">称呼：' + (draft.address ?? '同学') + ' · ' +
          (result.ms ?? 0) + 'ms' + (result.usedSearch ? ' · 用了搜索资料' : '') + '</div></div>' +
          '</div>' +
          (result.sample
            ? '<div class="m3-sample-label">伴学示例（同一道题，用 TA 的口吻）</div>' +
              '<div class="m3-sample">' + result.sample + '</div>'
            : '') +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
          '<button class="m3-btn" data-m3-retry>再改改</button>' +
          '<button class="m3-btn primary" data-m3-apply>就这个，开始学</button>' +
          '</div>'
        log.appendChild(box)
        log.scrollTop = log.scrollHeight

        box.querySelector('[data-m3-retry]')?.addEventListener('click', () => {
          input.focus()
          say('ai', '再说一句想改成什么样（比如：再可爱一点 / 别用比喻）。')
        })

        box.querySelector('[data-m3-apply]')?.addEventListener('click', () => {
          void (async () => {
            const applied = await api.cardChatApply?.((result.draft ?? {}) as Record<string, string>)
            if (applied?.ok) {
              window.dispatchEvent(new CustomEvent('costudy:card-changed'))
              close()
              window.__toast?.('角色卡已更新')
            } else {
              window.__toast?.('写入失败：' + (applied?.error ?? '未知原因'))
            }
          })()
        })
      } finally {
        send.disabled = false
      }
    })()
  }

  mask.querySelector('[data-m3-fetch]')?.addEventListener('click', () => {
    void (async () => {
      const raw = window.prompt('贴一个网址，或直接贴一段文字：', '')
      if (!raw || !raw.trim()) return
      const value = raw.trim()

      if (!/^https?:\/\//i.test(value)) {
        context = value
        say('sys', '已把这段文字作为资料（' + value.length + ' 字）')
        return
      }

      const waiting = say('sys', '正在抓取…')
      const page = await api.webFetch?.(value)
      waiting.remove()
      if (page?.ok && page.text) {
        context = (page.title ? page.title + '\n' : '') + page.text
        say('sys', '已抓取「' + (page.title || value) + '」' + (page.chars ?? 0) + ' 字' + (page.truncated ? '（已截断）' : ''))
      } else {
        say('sys', '抓取失败：' + (page?.error ?? '未知原因'))
      }
    })()
  })

  send.addEventListener('click', run)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run()
  })
}

/** footer 与首启引导共用这个入口 */
export function installM3Entry(): void {
  ensureStyle()
  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.m3-entry')) return
    const anchor = footer.querySelector('.pf-entry') ?? footer.querySelector('[data-ai]')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'm3-entry pf-entry'
    btn.title = '一句话描述你想要谁，AI 写设定并演示一段讲课'
    btn.textContent = '聊出来'
    btn.addEventListener('click', openM3Chat)
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.appendChild(btn)
  }
  window.setTimeout(() => {
    paint()
    const observer = new MutationObserver(() => paint())
    observer.observe(document.body, { childList: true, subtree: true })
  }, 460)
}
