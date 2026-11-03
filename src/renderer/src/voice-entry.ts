/**
 * 在角色栏底部（学习者画像下面）挂一个「语音」入口，点开 TTS / ASR 设置。
 *
 * 和 interactions.ts 里挂画像入口是同一个套路：变体重建 DOM 后要能补回来，
 * 所以用 MutationObserver 守着。
 */
import { openVoiceSettings } from './voice-ui'
import { openModelsPanel } from './models-ui'

const STYLE_ID = 'voice-entry-style'

const CSS = `
.voice-entry-btn {
  margin-top: 6px; width: 100%; height: 28px; border: 0; border-radius: 999px;
  cursor: pointer; font: inherit; font-size: 12px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, 0.10);
}
.voice-entry-btn:hover { background: rgba(10, 132, 255, 0.18); }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function mountVoiceEntry(): void {
  const foot = document.querySelector<HTMLElement>('.v-studio .rail-foot')
  if (!foot || foot.querySelector('[data-voice-entry]')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn ghost voice-entry-btn'
  btn.dataset.voiceEntry = ''
  btn.textContent = '语音'
  btn.addEventListener('click', () => void openVoiceSettings())
  // 「模型」放在语音下面：两者都是"接哪家服务"的配置
  if (!foot.querySelector('[data-models-entry]')) {
    const mb = document.createElement('button')
    mb.type = 'button'
    mb.className = 'btn ghost voice-entry-btn'
    mb.dataset.modelsEntry = ''
    mb.textContent = '模型'
    mb.style.marginTop = '6px'
    mb.addEventListener('click', () => void openModelsPanel())
    foot.appendChild(mb)
  }
  foot.appendChild(btn)
}

export function installVoiceEntry(): void {
  ensureStyle()
  mountVoiceEntry()
  const observer = new MutationObserver(() => mountVoiceEntry())
  observer.observe(document.body, { childList: true, subtree: true })
}
