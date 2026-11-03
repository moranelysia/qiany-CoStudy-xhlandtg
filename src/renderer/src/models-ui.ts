/**
 * 模型配置面板（P0）。
 *
 * 以前只能有一套 {apiKey, baseUrl, model}，换模型就把原来的覆盖掉。
 * 现在这里可以放多条：DeepSeek 官方、本地 Ollama、中转站…点一下切换。
 *
 * 密钥永不回显（主进程只返回 hasKey），所以密钥框留空 = 不改。
 */
const STYLE_ID = 'models-ui-style'

const CSS = `
.mo-mask { position: fixed; inset: 0; z-index: 124; display: grid; place-items: center;
  background: rgba(18,26,38,.34); -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); }
.mo-panel { display: flex; flex-direction: column; width: min(600px, calc(100vw - 56px));
  max-height: calc(100vh - 80px); border-radius: 24px; color: #10151c; overflow: hidden;
  background: rgba(255,255,255,.96); -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%); box-shadow: 0 30px 80px rgba(30,44,62,.32);
  -webkit-app-region: no-drag; }
.mo-head { display: flex; align-items: center; gap: 10px; padding: 18px 22px 10px; }
.mo-title { font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
.mo-close { margin-left: auto; width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: rgba(120,148,178,.14); color: #5a6a7a; cursor: pointer; font-size: 13px; }
.mo-body { overflow-y: auto; padding: 4px 22px 12px; }
.mo-card { border-radius: 14px; background: rgba(196,219,242,.18); padding: 12px 14px; margin-bottom: 9px; }
.mo-card[data-active] { background: rgba(10,132,255,.10); box-shadow: inset 0 0 0 1px rgba(10,132,255,.22); }
.mo-row { display: flex; align-items: center; gap: 10px; }
.mo-name { flex: 1; font-size: 13.5px; font-weight: 600; }
.mo-tag { font-size: 10.5px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
  color: #0a5cc4; background: rgba(10,132,255,.12); }
.mo-meta { margin-top: 5px; font-size: 11.5px; color: #8a97a8; word-break: break-all; }
.mo-btn { height: 26px; padding: 0 11px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11.5px; font-weight: 600; background: rgba(120,148,178,.16); color: #10151c; }
.mo-btn:hover { background: rgba(120,148,178,.26); }
.mo-btn.primary { background: #0a84ff; color: #fff; }
.mo-btn.danger { color: #b42318; }
.mo-field { display: block; margin-top: 9px; }
.mo-label { display: block; font-size: 11px; color: #5a6a7a; margin-bottom: 4px; }
.mo-input { width: 100%; box-sizing: border-box; height: 32px; padding: 0 10px; border: 0;
  border-radius: 9px; font: inherit; font-size: 12px; color: inherit;
  background: rgba(255,255,255,.8); box-shadow: inset 0 0 0 1px rgba(92,118,152,.14); }
.mo-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(10,132,255,.16); }
.mo-foot { display: flex; gap: 8px; align-items: center; padding: 12px 22px 18px;
  border-top: .5px solid rgba(120,148,178,.2); }
.mo-status { flex: 1; font-size: 11.5px; color: #5a6a7a; }
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface ProfileView {
  id: string
  label: string
  baseUrl: string
  model: string
  hasKey: boolean
  useFor: string[]
  active: boolean
}

interface Api {
  modelsList?: () => Promise<{ active: string; profiles: ProfileView[] }>
  modelsSave?: (input: unknown) => Promise<{ active: string; profiles: ProfileView[] }>
  modelsRemove?: (id: string) => Promise<{ active: string; profiles: ProfileView[] }>
  modelsActivate?: (id: string) => Promise<{ active: string; profiles: ProfileView[] }>
}

/**
 * 常见国产模型的 OpenAI 兼容入口。
 *
 * 只做"预填模板"：点一下把 baseUrl / model 填进表单，用户还能改。
 * 因为这些厂商的地址和模型名会变，别写死成唯一选项 ——
 * 表单永远是最终真相，模板只是省打字。
 */
const PRESETS: Array<{ label: string; baseUrl: string; model: string; note?: string }> = [
  { label: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'DeepSeek 推理', baseUrl: 'https://api.deepseek.com', model: 'deepseek-reasoner' },
  { label: '阿里通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { label: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { label: '零一万物 Yi', baseUrl: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning' },
  { label: '阶跃星辰 Step', baseUrl: 'https://api.stepfun.com/v1', model: 'step-1-8k' },
  { label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', model: 'abab6.5s-chat' },
  { label: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-standard' },
  { label: '讯飞星火', baseUrl: 'https://spark-api-open.xf-yun.com/v1', model: 'generalv3.5' },
  { label: '字节豆包（火山方舟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '（填你的推理接入点 ID）' },
  { label: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
  { label: '本地 vLLM / LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model' },
]

let panel: HTMLElement | null = null

function esc(text: string): string {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export async function openModelsPanel(): Promise<void> {
  ensureStyle()
  const api = window.costudy as unknown as Api | undefined
  if (!api?.modelsList) {
    window.__toast?.('模型接口不可用')
    return
  }
  if (panel) panel.remove()

  const mask = document.createElement('div')
  mask.className = 'mo-mask'
  mask.innerHTML =
    '<div class="mo-panel" role="dialog" aria-label="模型配置">' +
    '<div class="mo-head"><span class="mo-title">模型</span>' +
    '<button class="mo-close" data-mo-close aria-label="关闭">✕</button></div>' +
    '<div class="mo-body" data-mo-list><div class="mo-meta">加载中…</div></div>' +
    '<div class="mo-body" data-mo-form style="display:none"></div>' +
    '<div class="mo-foot"><button class="mo-btn" data-mo-add>＋ 新增配置</button>' +
    '<span class="mo-status" data-mo-status></span></div>' +
    '</div>'
  document.body.appendChild(mask)
  panel = mask

  const list = mask.querySelector<HTMLElement>('[data-mo-list]')
  const form = mask.querySelector<HTMLElement>('[data-mo-form]')
  const status = mask.querySelector<HTMLElement>('[data-mo-status]')

  const setStatus = (text: string): void => {
    if (status) status.textContent = text
  }

  const close = (): void => {
    mask.remove()
    if (panel === mask) panel = null
  }
  mask.querySelector('[data-mo-close]')?.addEventListener('click', close)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })

  const paint = (data: { active: string; profiles: ProfileView[] }): void => {
    if (!list) return
    list.innerHTML = data.profiles
      .map(
        (p) =>
          '<div class="mo-card"' + (p.active ? ' data-active' : '') + '>' +
          '<div class="mo-row"><span class="mo-name">' + esc(p.label) + '</span>' +
          (p.active ? '<span class="mo-tag">当前</span>' : '') +
          (p.hasKey ? '<span class="mo-tag">有密钥</span>' : '<span class="mo-tag" style="color:#8a5a00;background:rgba(214,158,46,.16)">无密钥</span>') +
          (p.active ? '' : '<button class="mo-btn" data-mo-use="' + esc(p.id) + '">用这个</button>') +
          '<button class="mo-btn" data-mo-edit="' + esc(p.id) + '">编辑</button>' +
          (data.profiles.length > 1 ? '<button class="mo-btn danger" data-mo-del="' + esc(p.id) + '">删除</button>' : '') +
          '</div>' +
          '<div class="mo-meta">' + esc(p.model) + ' · ' + esc(p.baseUrl) +
          (p.useFor.length ? ' · ' + esc(p.useFor.join('/')) : '') + '</div>' +
          '</div>',
      )
      .join('')
  }

  const openForm = (profile?: ProfileView): void => {
    if (!form) return
    form.style.display = 'block'
    form.innerHTML =
      '<div style="font-size:12px;font-weight:600;margin:4px 0 6px">' + (profile ? '编辑配置' : '新增配置') + '</div>' +
      (profile ? '' : '<label class="mo-field"><span class="mo-label">从模板快速添加</span><select class="mo-input" data-fo="preset"><option value="">— 手动填写 —</option>' + PRESETS.map(function (x) { return '<option value="' + x.baseUrl + '|' + x.model + '|' + x.label + '">' + x.label + '</option>' }).join('') + '</select></label>') +
      '<label class="mo-field"><span class="mo-label">名字</span><input class="mo-input" data-fo="label" value="' + esc(profile?.label ?? '') + '" placeholder="例如：DeepSeek 官方 / 本地 Ollama" /></label>' +
      '<label class="mo-field"><span class="mo-label">Base URL</span><input class="mo-input" data-fo="baseUrl" value="' + esc(profile?.baseUrl ?? 'https://api.deepseek.com') + '" /></label>' +
      '<label class="mo-field"><span class="mo-label">模型名</span><button type="button" class="mo-btn" data-fo-probe style="margin-left:6px">拉取列表</button><input class="mo-input" data-fo="model" value="' + esc(profile?.model ?? 'deepseek-flash') + '" /></label>' +
      '<div class="mo-meta" data-fo-models></div>' +
      '<label class="mo-field"><span class="mo-label">API Key</span><input class="mo-input" data-fo="apiKey" type="password" placeholder="' + (profile?.hasKey ? '已配置，留空表示不改' : '本地模型可留空') + '" /></label>' +
      '<div class="mo-row" style="margin-top:10px;justify-content:flex-end">' +
      '<button class="mo-btn" data-fo-cancel>取消</button>' +
      '<button class="mo-btn primary" data-fo-save="' + esc(profile?.id ?? '') + '">保存</button></div>'
    const presetSel = form.querySelector<HTMLSelectElement>('[data-fo="preset"]')
    presetSel?.addEventListener('change', () => {
      const v = presetSel.value
      if (!v) return
      const parts = v.split('|')
      const set = (name: string, value: string): void => {
        const el = form.querySelector<HTMLInputElement>('[data-fo="' + name + '"]')
        if (el) el.value = value
      }
      set('baseUrl', parts[0] ?? '')
      set('model', parts[1] ?? '')
      set('label', parts[2] ?? '')
    })
    const input = (name: string): string =>
      (form.querySelector<HTMLInputElement>('[data-fo="' + name + '"]')?.value ?? '').trim()
        const probeBtn = form.querySelector<HTMLElement>('[data-fo-probe]')
    const modelsHint = form.querySelector<HTMLElement>('[data-fo-models]')
    probeBtn?.addEventListener('click', () => {
      void (async () => {
        const apiAny = window.costudy as unknown as {
          modelsProbe?: (b: string, k: string) => Promise<{ ok: boolean; models?: string[]; error?: string }>
        }
        if (!apiAny.modelsProbe || !modelsHint) return
        modelsHint.textContent = '拉取中…'
        const key = form.querySelector<HTMLInputElement>('[data-fo="apiKey"]')?.value ?? ''
        const res = await apiAny.modelsProbe(input('baseUrl'), key)
        if (!res.ok) {
          modelsHint.textContent = '拉取失败：' + (res.error ?? '未知原因') + '（有些厂商不开放 /models，手填即可）'
          return
        }
        const ids = res.models ?? []
        if (!ids.length) {
          modelsHint.textContent = '这个服务没返回模型列表，手填吧'
          return
        }
        modelsHint.innerHTML = '<div style="margin-bottom:4px">点一个填入：</div>' + ids.slice(0, 40).map(function (id) {
          return '<button type="button" class="mo-btn" data-pick="' + esc(id) + '" style="margin:0 4px 4px 0">' + esc(id) + '</button>'
        }).join('')
        modelsHint.querySelectorAll<HTMLElement>('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () {
            const el = form.querySelector<HTMLInputElement>('[data-fo="model"]')
            if (el) el.value = b.dataset.pick ?? ''
          })
        })
      })()
    })
form.querySelector('[data-fo-cancel]')?.addEventListener('click', () => {
      form.style.display = 'none'
    })
    form.querySelector('[data-fo-save]')?.addEventListener('click', () => {
      void (async () => {
        const id = profile?.id
        const keyInput = form.querySelector<HTMLInputElement>('[data-fo="apiKey"]')
        const apiKey = keyInput?.value ? keyInput.value : undefined
        setStatus('保存中…')
        try {
          const next = await api.modelsSave?.({
            id,
            label: input('label') || '未命名配置',
            baseUrl: input('baseUrl'),
            model: input('model'),
            apiKey,
          })
          if (next) {
            paint(next)
            form.style.display = 'none'
            setStatus('已保存')
            window.__toast?.('模型配置已保存')
          }
        } catch (err) {
          setStatus('保存失败：' + (err instanceof Error ? err.message : String(err)))
        }
      })()
    })
  }

  list?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const use = target.closest<HTMLElement>('[data-mo-use]')
    if (use) {
      void api.modelsActivate?.(use.dataset.moUse ?? '').then((next) => {
        if (next) {
          paint(next)
          setStatus('已切换')
        }
      })
      return
    }
    const del = target.closest<HTMLElement>('[data-mo-del]')
    if (del) {
      void api.modelsRemove?.(del.dataset.moDel ?? '').then((next) => {
        if (next) {
          paint(next)
          setStatus('已删除')
        }
      })
      return
    }
  })

  mask.querySelector('[data-mo-add]')?.addEventListener('click', () => openForm())

  const data = await api.modelsList()
  paint(data)
  window.setTimeout(() => mask.querySelector('[data-mo-add]')?.scrollIntoView({ block: 'nearest' }), 30)
}
