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
import { syncCardsToRail, syncDimsFromCard, syncIdentityInputs, syncPreviewReplyName } from './cards-ui'

const STYLE_ID = 'm3-ui-style'

const CSS = `
.m3-mask {
  position: fixed; inset: 0; z-index: 118; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.3); backdrop-filter: blur(8px);
  opacity: 1; transition: opacity 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .m3-mask { opacity: 0; } }
.m3-mask ~ .set-mask { z-index: 119; }

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

.m3-recent { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.m3-recent-item { border: 0; cursor: pointer; font: inherit; font-size: 12px; padding: 5px 10px;
  border-radius: 999px; color: #0a5cc4; background: rgba(10,132,255,.1); }
.m3-recent-item:hover { background: rgba(10,132,255,.18); }

.m3-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 2px 8px; min-height: 120px; }
.m3-msg { max-width: 84%; padding: 9px 13px; border-radius: 16px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.m3-msg.me { align-self: flex-end; color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0); }
.m3-msg.ai { align-self: flex-start; background: rgba(196, 219, 242, 0.32); }
.m3-msg.sys { align-self: center; color: #8a97a8; font-size: 11px; background: transparent; }

.m3-draft { overflow-wrap: anywhere; margin-top: 10px; padding: 14px 16px; border-radius: 18px; background: rgba(10, 132, 255, 0.07); }
.m3-draft-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.m3-draft-identity { display: grid; gap: 4px; flex: 1; min-width: 0; }
.m3-draft-name { min-width: 0; width: min(100%, 220px); padding: 5px 8px; border: 1px solid #b9cee9;
  border-radius: 8px; color: inherit; background: rgba(255, 255, 255, 0.72); font: inherit; font-size: 15px; font-weight: 700; }
.m3-draft-meta { font-size: 11px; color: #5a6a7a; }
.m3-sample {
  margin-top: 8px; padding: 12px 14px; border-radius: 14px; font-size: 13px; line-height: 1.7;
  white-space: pre-wrap; background: rgba(255, 255, 255, 0.7); color: #22303f;
}
.m3-sample-label { font-size: 11px; color: #8a97a8; margin-bottom: 6px; }

.m3-compose { display: flex; gap: 8px; margin-top: 12px; }
.m3-reference { display: flex; gap: 8px; align-items: flex-end; margin-top: 8px; }
.m3-reference[hidden] { display: none; }
.m3-reference textarea { flex: 1; min-width: 0; height: 65px; border-radius: 12px; padding: 6px 10px; resize: vertical; }
.m3-input {
  flex: 1; min-width: 0; height: 38px; padding: 0 14px; border: 0; border-radius: 999px;
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
.m3-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
@media (max-width: 520px) {
  .m3-panel { box-sizing: border-box; width: calc(100vw - 24px); padding: 16px 14px; }
  .m3-compose .m3-btn { padding: 0 11px; flex-shrink: 0; }
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

type DraftShape = Record<string, unknown> & { name?: string; emoji?: string; address?: string }

interface DraftPreview {
  draft: DraftShape
  draftId?: string
  sample?: string
  question?: string
}

export function openM3Chat({ create = false }: { create?: boolean } = {}): void {
  ensureStyle()
  const api = window.costudy
  if (!api?.cardChatDraft || !api.cardChatApply) {
    window.__toast?.('角色生成服务暂不可用，请重新打开伴学后重试。')
    return
  }
  if (document.querySelector('.m3-mask')) return

  const mask = document.createElement('div')
  mask.className = 'm3-mask'
  mask.innerHTML = `
    <div class="m3-panel" role="dialog" aria-label="跟 AI 聊出来">
      <div class="m3-head">
        <span class="m3-title">跟 AI 聊出来</span>
        <button class="m3-close" data-m3-close aria-label="关闭">✕</button>
      </div>
      <p class="m3-sub">
        描述你想要的伴学角色。AI 会写出角色设定和一段问答示例，确认后再保存。
      </p>
      <div class="m3-recent" data-m3-recent></div>
      <div class="m3-log" data-m3-log></div>
      <div class="m3-compose">
        <input class="m3-input" data-m3-input placeholder="我想要一个…来伴学" />
        <button class="m3-btn" data-m3-fetch aria-expanded="false">贴资料</button>
        <button class="m3-btn primary" data-m3-send>发送</button>
      </div>
      <div class="m3-reference" data-m3-reference hidden>
        <textarea aria-label="角色参考资料" maxlength="3000"></textarea>
        <button class="m3-btn" data-m3-use-reference>使用资料</button>
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

  let context = ''
  let revision: DraftShape | undefined
  let saving = false
  let preview: HTMLElement | undefined

  const showError = (message: string): void => {
    say('ai', message)
    const settings = document.createElement('button')
    settings.type = 'button'
    settings.className = 'm3-btn'
    settings.textContent = '模型设置'
    settings.addEventListener('click', () => {
      void import('./settings-ui').then((module) => module.openSettings()).catch(() => {
        window.__toast?.('暂时无法打开模型设置，请重试。')
      })
    })
    log.appendChild(settings)
    log.scrollTop = log.scrollHeight
  }

  const showDraft = ({ draft, draftId, sample, question }: DraftPreview): void => {
    preview?.remove()
    revision = draft
    const box = document.createElement('div')
    box.className = 'm3-draft'
    box.innerHTML = `
      <div class="m3-draft-head">
        <span style="font-size:20px" data-emoji></span>
        <div class="m3-draft-identity">
          <label class="m3-draft-meta" for="m3-draft-name">角色名</label>
          <input class="m3-draft-name" id="m3-draft-name" maxlength="24" required>
          <div class="m3-draft-meta" data-draft-address></div>
        </div>
      </div>
      <div class="m3-sample-label"></div>
      <div class="m3-sample"></div>
      <div class="m3-actions">
        <button class="m3-btn" data-m3-retry>再改改</button>
        <button class="m3-btn primary" data-m3-apply></button>
      </div>
    `
    box.querySelector('[data-emoji]')!.textContent = draft.emoji || '✧'
    const nameInput = box.querySelector<HTMLInputElement>('#m3-draft-name')!
    nameInput.value = draft.name || ''
    nameInput.addEventListener('input', () => {
      revision = { ...draft, name: nameInput.value.trim() || draft.name }
    })
    box.querySelector('[data-draft-address]')!.textContent = '称呼：' + (draft.address || '同学')
    const label = box.querySelector<HTMLElement>('.m3-sample-label')!
    const answer = box.querySelector<HTMLElement>('.m3-sample')!
    if (sample) {
      label.textContent = question ? '伴学示例 · ' + question : '伴学示例'
      answer.textContent = sample
    } else {
      label.remove()
      answer.remove()
    }
    preview = box
    log.appendChild(box)
    log.scrollTop = log.scrollHeight

    box.querySelector('[data-m3-retry]')!.addEventListener('click', () => {
      say('ai', '说一句你想怎么改，比如「少用比喻，多问问我卡在哪一步」。')
      input.focus()
    })
    const adopt = box.querySelector<HTMLButtonElement>('[data-m3-apply]')!
    adopt.textContent = create ? '保存为新角色' : '采用草稿'
    adopt.addEventListener('click', async () => {
      if (send.disabled || saving) return
      const name = nameInput.value.trim()
      if (!name) {
        say('sys', '请填写角色名再保存。')
        nameInput.focus()
        return
      }
      saving = true
      adopt.disabled = true
      let applied
      try {
        applied = await api.cardChatApply({ draft, draftId, create, name })
      } catch {
        say('ai', '保存失败，请检查可用存储空间后重试。草稿仍可重新采用。')
        return
      } finally {
        saving = false
        adopt.disabled = false
      }
      if (!applied.ok) {
        say('ai', applied.error ?? '保存失败，请重试。')
        return
      }
      close()
      window.__toast?.(create ? '已保存为新角色' : '角色卡已更新')
      try {
        await syncCardsToRail()
        await syncIdentityInputs()
        await syncDimsFromCard()
        await syncPreviewReplyName()
      } finally {
        window.dispatchEvent(new CustomEvent('costudy:card-changed'))
      }
    })
  }

  const recent = mask.querySelector<HTMLElement>('[data-m3-recent]')!
  void api.draftList?.().then((result) => {
    const drafts = result as Array<{ id: string; brief: string; draft: DraftShape; sample?: string }>
    if (!drafts.length) return
    const label = document.createElement('span')
    label.textContent = '最近生成'
    label.className = 'm3-draft-meta'
    recent.appendChild(label)
    for (const saved of drafts.slice(0, 6)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'm3-recent-item'
      btn.title = saved.brief
      btn.textContent = (saved.draft.emoji || '✧') + ' ' + (saved.draft.name || '未命名')
      btn.addEventListener('click', () => {
        if (send.disabled || saving) return
        say('sys', '已找回草稿')
        showDraft({ ...saved, draftId: saved.id })
      })
      recent.appendChild(btn)
    }
  }).catch(() => say('sys', '暂时无法读取历史草稿。'))

  say('sys', '试着说：想要一个爱用生活例子讲数学的学姐')
  input.focus()

  const run = async (): Promise<void> => {
    const brief = input.value.trim()
    if (!brief || send.disabled || saving) return
    input.value = ''
    say('me', brief)
    const waiting = say('ai', '正在生成角色设定和伴学示例…')
    send.disabled = true
    let error: string | undefined
    try {
      const references = [
        revision && '【上一版草稿，根据本次要求修改】\n' + JSON.stringify(revision).slice(0, 1900),
        context && '【用户提供的参考资料】\n' + context.slice(0, revision ? 1000 : 2900),
      ].filter(Boolean).join('\n\n')
      const result = await api.cardChatDraft({ brief, context: references, create })
      if (result.ok && result.draft) {
        showDraft({ ...result, draft: result.draft })
      } else {
        error = result.error ?? '没有收到角色草稿，请重试。'
      }
    } catch {
      error = '角色生成请求失败，请重试。'
    } finally {
      waiting.remove()
      send.disabled = false
    }
    if (error) {
      if (!input.value.trim()) input.value = brief
      showError(error)
    }
  }

  const reference = mask.querySelector<HTMLElement>('[data-m3-reference]')!
  const referenceInput = reference.querySelector('textarea')!
  const referenceToggle = mask.querySelector<HTMLButtonElement>('[data-m3-fetch]')!
  const useReference = reference.querySelector<HTMLButtonElement>('[data-m3-use-reference]')!
  referenceInput.placeholder = api.webFetch ? '粘贴网址或角色介绍' : '粘贴角色介绍'
  referenceToggle.addEventListener('click', () => {
    reference.hidden = !reference.hidden
    referenceToggle.setAttribute('aria-expanded', String(!reference.hidden))
    if (!reference.hidden) referenceInput.focus()
  })
  const finishReference = (text: string, message: string): void => {
    context = text
    reference.hidden = true
    referenceToggle.setAttribute('aria-expanded', 'false')
    say('sys', message)
    input.focus()
  }
  useReference.addEventListener('click', async () => {
    const value = referenceInput.value.trim()
    if (!value) {
      finishReference('', '已清空参考资料')
      return
    }
    if (!/^https?:\/\//i.test(value)) {
      finishReference(value, '已添加这段参考资料')
      return
    }
    if (!api.webFetch) {
      say('sys', '请复制网页里的介绍文字，再作为参考资料粘贴。')
      return
    }
    useReference.disabled = true
    const waiting = say('sys', '正在读取网页…')
    try {
      const page = await api.webFetch(value)
      if (page.ok && page.text) {
        finishReference((page.title ? page.title + '\n' : '') + page.text, '已添加网页资料')
      } else {
        say('sys', '读取失败：' + (page.error ?? '网页没有返回正文'))
      }
    } catch {
      say('sys', '读取失败，请检查网址或直接粘贴文字。')
    } finally {
      useReference.disabled = false
      waiting.remove()
    }
  })

  send.addEventListener('click', run)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      void run()
    }
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
    btn.addEventListener('click', () => openM3Chat())
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.appendChild(btn)
  }
  window.setTimeout(() => {
    paint()
    const observer = new MutationObserver(() => paint())
    observer.observe(document.body, { childList: true, subtree: true })
  }, 460)
}
