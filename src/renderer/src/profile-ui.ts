/**
 * M2 界面：学情画像表单（玻璃面板，四组字段）。
 *
 * 设计取舍：
 *   · 表单而不是聊天 —— 这几项是"事实"，用填的比用聊的快，也不会有歧义
 *   · 目标知识点用多行文本（一行一个），比"加一行"控件更省事
 *   · 忌口单独一组，因为它是"少做"指令，混在偏好里容易被忽略
 *   · 保存后立刻提示"已写进提示词"，让用户知道填了有用
 */
const STYLE_ID = 'profile-ui-style'

const CSS = `
.pf-entry {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 14px; border: 0; border-radius: 999px;
  cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
  color: #0a5cc4; background: rgba(10, 132, 255, 0.12);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    background-color 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.pf-entry:hover { background: rgba(10, 132, 255, 0.2); }
.pf-entry:active { transform: scale(0.96); }

.pf-mask {
  position: fixed; inset: 0; z-index: 115; display: grid; place-items: center;
  background: rgba(18, 26, 38, 0.28); backdrop-filter: blur(7px);
  opacity: 1; transition: opacity 180ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .pf-mask { opacity: 0; } }

.pf-panel {
  width: min(620px, calc(100vw - 56px)); max-height: min(80vh, 760px);
  overflow-y: auto; padding: 22px 24px 18px; border-radius: 26px; color: #10151c;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: 0 26px 74px rgba(30, 44, 62, 0.26); -webkit-app-region: no-drag;
  transform: scale(1);
  transition: transform 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1)),
    opacity 220ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
@starting-style { .pf-panel { opacity: 0; transform: scale(0.97); } }

.pf-head { display: flex; align-items: center; justify-content: space-between; }
.pf-title { font-size: 17px; font-weight: 700; }
.pf-close { border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #5a6a7a; }
.pf-sub { margin: 6px 0 16px; font-size: 12px; line-height: 1.6; color: #5a6a7a; }

.pf-group { margin-bottom: 16px; }
.pf-group-name { font-size: 12px; font-weight: 700; color: #3c4b5d; margin-bottom: 8px; }
.pf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.pf-field { display: block; margin-bottom: 10px; }
.pf-label { display: block; font-size: 12px; color: #5a6a7a; margin-bottom: 5px; }
.pf-input, .pf-area, .pf-select {
  width: 100%; border: 0; border-radius: 14px; font: inherit; font-size: 13px;
  color: #10151c; outline: none; background: rgba(196, 219, 242, 0.3);
  box-shadow: inset 0 1px 2px rgba(70, 100, 140, 0.1);
}
.pf-input, .pf-select { height: 36px; padding: 0 12px; }
.pf-area { min-height: 62px; padding: 10px 12px; resize: vertical; line-height: 1.6; }
.pf-input:focus, .pf-area:focus, .pf-select:focus { background: rgba(196, 219, 242, 0.46); }
.pf-hint { font-size: 11px; color: #8a97a8; margin-top: 4px; }

.pf-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
.pf-btn {
  height: 34px; padding: 0 16px; border: 0; border-radius: 999px;
  font: inherit; font-size: 13px; cursor: pointer; color: #10151c;
  background: rgba(120, 148, 178, 0.14);
  transition: transform 160ms var(--ease-out, cubic-bezier(0.23,1,0.32,1));
}
.pf-btn:active { transform: scale(0.96); }
.pf-btn.primary {
  color: #fff; background: linear-gradient(180deg, #0a84ff, #0a72e0);
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.26);
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

interface ProfileShape {
  ageBand: string
  education: string
  currentLevel: string
  targetPoints: string[]
  goal: string
  weeklyHours: number
  preferOrder: string
  dislikes: string[]
}

const AGES = ['小学', '初中', '高中', '大学', '工作后']

function listToText(list: string[]): string {
  return (list ?? []).join('\n')
}

function textToList(text: string): string[] {
  return text
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function openProfileForm(): Promise<void> {
  ensureStyle()
  const api = window.costudy
  if (!api?.profileGet) {
    window.__toast?.('学情接口没接上')
    return
  }

  const profile = (await api.profileGet()) as unknown as ProfileShape

  const mask = document.createElement('div')
  mask.className = 'pf-mask'
  mask.innerHTML = `
    <div class="pf-panel" role="dialog" aria-label="学情画像">
      <div class="pf-head">
        <span class="pf-title">学情画像</span>
        <button class="pf-close" data-pf-close aria-label="关闭">✕</button>
      </div>
      <p class="pf-sub">
        这些是你自己说的，会和"程序统计的画像"一起进提示词。填了才有用，不填也不影响使用。
      </p>

      <div class="pf-group">
        <div class="pf-group-name">我是谁</div>
        <div class="pf-row">
          <label class="pf-field">
            <span class="pf-label">学段</span>
            <select class="pf-select" data-pf-age>
              <option value="">未选择</option>
              ${AGES.map((a) => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </label>
          <label class="pf-field">
            <span class="pf-label">身份 / 学历</span>
            <input class="pf-input" data-pf-edu placeholder="如：高二在读 / 工作三年" />
          </label>
        </div>
      </div>

      <div class="pf-group">
        <div class="pf-group-name">现在在哪</div>
        <label class="pf-field">
          <span class="pf-label">自评当前水平</span>
          <textarea class="pf-area" data-pf-level placeholder="如：函数还行，三角函数基本忘光"></textarea>
        </label>
      </div>

      <div class="pf-group">
        <div class="pf-group-name">想学什么</div>
        <label class="pf-field">
          <span class="pf-label">具体知识点（一行一个）</span>
          <textarea class="pf-area" data-pf-points placeholder="正弦定理&#10;余弦定理"></textarea>
        </label>
        <label class="pf-field">
          <span class="pf-label">目标</span>
          <input class="pf-input" data-pf-goal placeholder="如：期末考到 80 分以上" />
        </label>
      </div>

      <div class="pf-group">
        <div class="pf-group-name">怎么学</div>
        <div class="pf-row">
          <label class="pf-field">
            <span class="pf-label">每周可投入（小时）</span>
            <input class="pf-input" data-pf-hours type="number" min="0" max="80" step="1" />
          </label>
          <label class="pf-field">
            <span class="pf-label">偏好顺序</span>
            <select class="pf-select" data-pf-order>
              <option value="">未选择</option>
              <option value="先讲后练">先讲后练</option>
              <option value="先练后讲">先练后讲</option>
            </select>
          </label>
        </div>
        <label class="pf-field">
          <span class="pf-label">明确不要（一行一个）</span>
          <textarea class="pf-area" data-pf-dislikes placeholder="别用鸡汤&#10;别叫我同学"></textarea>
          <div class="pf-hint">这句会直接进提示词，写成命令式的短句最有效。</div>
        </label>
      </div>

      <div class="pf-actions">
        <button class="pf-btn" data-pf-cancel>取消</button>
        <button class="pf-btn primary" data-pf-save>保存</button>
      </div>
    </div>
  `
  document.body.appendChild(mask)

  const q = <T extends HTMLElement>(sel: string): T => mask.querySelector<T>(sel)!
  q<HTMLSelectElement>('[data-pf-age]').value = profile.ageBand || ''
  q<HTMLInputElement>('[data-pf-edu]').value = profile.education || ''
  q<HTMLTextAreaElement>('[data-pf-level]').value = profile.currentLevel || ''
  q<HTMLTextAreaElement>('[data-pf-points]').value = listToText(profile.targetPoints)
  q<HTMLInputElement>('[data-pf-goal]').value = profile.goal || ''
  q<HTMLInputElement>('[data-pf-hours]').value = String(profile.weeklyHours || 0)
  q<HTMLSelectElement>('[data-pf-order]').value = profile.preferOrder || ''
  q<HTMLTextAreaElement>('[data-pf-dislikes]').value = listToText(profile.dislikes)

  const close = (): void => mask.remove()
  q('[data-pf-close]').addEventListener('click', close)
  q('[data-pf-cancel]').addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  q('[data-pf-save]').addEventListener('click', () => {
    void (async () => {
      const result = await api.profileSave({
        ageBand: q<HTMLSelectElement>('[data-pf-age]').value,
        education: q<HTMLInputElement>('[data-pf-edu]').value.trim(),
        currentLevel: q<HTMLTextAreaElement>('[data-pf-level]').value.trim(),
        targetPoints: textToList(q<HTMLTextAreaElement>('[data-pf-points]').value),
        goal: q<HTMLInputElement>('[data-pf-goal]').value.trim(),
        weeklyHours: Number(q<HTMLInputElement>('[data-pf-hours]').value) || 0,
        preferOrder: q<HTMLSelectElement>('[data-pf-order]').value,
        dislikes: textToList(q<HTMLTextAreaElement>('[data-pf-dislikes]').value),
      })
      if (result.ok) {
        close()
        window.__toast?.('已保存，下次对话就按这个来')
      } else {
        window.__toast?.('保存失败：' + (result.error ?? '未知原因'))
      }
    })()
  })
}

/** footer 里挂一个「学情」入口，变体重建后补挂 */
export function installProfileEntry(): void {
  ensureStyle()

  const paint = (): void => {
    const footer = document.querySelector<HTMLElement>('.v-studio .footer-bar')
    if (!footer || footer.querySelector('.pf-entry')) return
    const anchor = footer.querySelector('.pol-entry') ?? footer.querySelector('[data-ai]')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pf-entry'
    btn.title = '填写学情：学段、当前水平、想学的知识点'
    btn.textContent = '学情'
    btn.addEventListener('click', () => void openProfileForm())
    if (anchor?.parentElement === footer) anchor.after(btn)
    else footer.appendChild(btn)
  }

  window.setTimeout(() => {
    paint()
    const observer = new MutationObserver(() => paint())
    observer.observe(document.body, { childList: true, subtree: true })
  }, 420)
}
