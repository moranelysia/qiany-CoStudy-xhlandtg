/**
 * 浏览器桥接层：把 Electron preload 暴露的 window.costudy 用纯前端实现一遍。
 *
 * 能做的：
 *   · 角色卡 / 会话 / 设置 / 插件 / 模式 / 记忆库 / 统计 —— 全部存 localStorage
 *   · 对话 —— 浏览器直连 OpenAI 兼容接口（Key 只存在你自己的浏览器里）
 *   · 朗读 —— Web Speech API（speechSynthesis）
 *
 * 做不到的（桌面版才有的能力）：
 *   · 代码执行、MCP 画图/实验、写本地文件、系统级加密
 *   这些接口会返回明确的失败原因，而不是假装成功。
 */
(function () {
  'use strict'

  var KEY = 'costudy.web.v1'

  /* 构建标记：用于确认浏览器加载的是哪一版桥接层 */
  var BUILD = "20261123b"
  try { window.__COSTUDY_WEB_BUILD = BUILD; console.info('[CoStudy] web bridge ' + BUILD) } catch (e) {}
  /* 角色卡默认值：字段与桌面端 CardDetail 对齐（src/preload 的 CardSummary / CardDetail）。
     dims / teaching / catchphrase 是角色工坊还在用的历史字段，保留以免旧数据丢失。 */
  var CARD_TEXT_FIELDS = ['name', 'emoji', 'address', 'description', 'personality', 'scenario',
    'style', 'rules', 'behavior', 'opening', 'firstMes', 'mesExample', 'systemPrompt',
    'postHistoryInstructions']
  var CARD_DEFAULTS = {
    id: '',
    name: '温柔学姐',
    emoji: '🌷',
    address: '学姐',
    description: '耐心、会换着说法讲，直到你真的懂',
    personality: '先听你说完，再指出卡在哪一步；不评判，只纠错',
    scenario: '放学后的自习室',
    style: '句子短，多用「我们」「你看」，偶尔举生活里的例子',
    rules: '不替你做决定；答错了先认可对的部分',
    behavior: '讲一步停一下，等你点头再往下',
    opening: '来，今天想弄懂哪一块？',
    firstMes: '',
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    ageRating: 'all-ages',
    updatedAt: 0,
    // 历史字段（角色工坊仍会读写）
    catchphrase: '来，我们一起看看',
    stage: '高中',
    age: '全年龄',
    dims: { warmth: 78, formality: 24, humor: 62, patience: 86, strict: 28, proactive: 55,
            praise: 70, verbosity: 42, abstract: 35, tempo: 48, closeness: 66, stability: 72 },
    teaching: { socratic: true, diagnose: true, review: true },
    transcript: ''
  }
  var DEFAULT_CARD = Object.assign({}, CARD_DEFAULTS, { id: 'role-web-1', updatedAt: Date.now() })

  /** 把任意来源（localStorage 旧数据 / 导入的 JSON / AI 草稿）规整成完整卡片 */
  function normalizeCard(raw) {
    var c = Object.assign({}, CARD_DEFAULTS, raw || {})
    if (!c.id) c.id = uid('role')
    if (!c.updatedAt) c.updatedAt = Date.now()
    if (typeof c.dims !== 'object' || !c.dims) c.dims = Object.assign({}, CARD_DEFAULTS.dims)
    return c
  }

  /** 列表项：字段名必须和 CardSummary 一致（isActive 而不是 current） */
  function cardSummary(c) {
    return {
      id: c.id,
      name: c.name || '',
      emoji: c.emoji || '',
      address: c.address || '',
      ageRating: c.ageRating || 'all-ages',
      updatedAt: c.updatedAt || 0,
      isActive: c.id === S.activeCardId
    }
  }

  function cardDetail(c) {
    var out = {}
    CARD_TEXT_FIELDS.forEach(function (k) { out[k] = String((c && c[k]) || '') })
    out.id = c.id
    out.ageRating = c.ageRating || 'all-ages'
    out.updatedAt = c.updatedAt || 0
    out.dims = Object.assign({}, c.dims || {})
    return out
  }

  /** 从模型回复里抠出 JSON（允许 ```json 包裹） */
  function pickJson(text) {
    var t = String(text || '')
    var m = t.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch (e) { return null }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY)
      if (raw) {
        var d = JSON.parse(raw)
        if (Array.isArray(d.cards)) d.cards = d.cards.map(normalizeCard)
        return d
      }
    } catch (e) { /* 坏数据就当空 */ }
    return {
      cards: [DEFAULT_CARD],
      activeCardId: DEFAULT_CARD.id,
      settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: '' },
      mode: 'chat',
      plugins: defaultPlugins(),
      sessions: [{ id: 's-1', title: '第一次对话', createdAt: Date.now(), messages: [] }],
      currentSessionId: 's-1',
      memories: [],
      topic: '', profile: {},
      studySeconds: 0,
      daily: {}
    }
  }

  function defaultPlugins() {
    return [
      { id: 'socratic', name: '苏格拉底式提问', desc: '用反问推进，而不是直接给答案', kind: 'teaching', permission: 'read', enabled: true },
      { id: 'diagnose', name: '先诊断再教', desc: '开始前先摸清真实水平', kind: 'teaching', permission: 'read', enabled: true },
      { id: 'review', name: '主动提复习', desc: '记得上次没弄懂的地方', kind: 'teaching', permission: 'read', enabled: true },
      { id: 'plot', name: '数学作图', desc: '函数、几何图（桌面版由本地服务生成）', kind: 'capability', permission: 'read', enabled: false },
      { id: 'code', name: '代码执行', desc: '跑 JavaScript（仅桌面版）', kind: 'capability', permission: 'exec', enabled: false },
      { id: 'english', name: '英语练习', desc: '单词、跟读、纠正', kind: 'capability', permission: 'read', enabled: false },
      { id: 'lab', name: '实验演示', desc: '物理、化学装置图（仅桌面版）', kind: 'capability', permission: 'read', enabled: false }
    ]
  }

  var S = load()
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) { console.warn('[bridge] 存不下', e) }
  }
  function now() { return Date.now() }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10) }

  function activeCard() {
    return S.cards.find(function (c) { return c.id === S.activeCardId }) || S.cards[0]
  }
  function session() {
    return S.sessions.find(function (x) { return x.id === S.currentSessionId }) || S.sessions[0]
  }
  function dayKey(t) {
    var d = new Date(t)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  // ---------- 提示词 ----------
  function systemPrompt() {
    var c = activeCard()
    var dims = c.dims || {}
    var lines = [
      '你是「' + c.name + '」，一位' + (c.stage || '高中') + '阶段的伴学角色，正在陪「' + (c.address || '同学') + '」学习。',
      c.description ? '你的性格：' + c.description + '。' : '',
      c.catchphrase ? '常用开场：' + c.catchphrase + '。' : '',
      '讲解比例 ' + Math.round(dims.explain != null ? dims.explain : 38) + '%（0=纯提问 100=纯讲解）；'
        + '抽象度 ' + Math.round(dims.abstract != null ? dims.abstract : 35) + '（低=多用具体例子）；'
        + '严格度 ' + Math.round(dims.strict != null ? dims.strict : 28) + '；'
        + '鼓励密度 ' + Math.round(dims.praise != null ? dims.praise : 70) + '。',
      '【硬约束】全年龄向：不做心理诊断、不索取真实个人信息、不建立情感依赖话术、不适龄内容一律拒绝。',
      '【当前是浏览器体验版】你没有工具：不能画图、不能执行代码、不能联网、不能读写文件。'
        + '做不到就直接说明，不要假装做过。',
      S.topic ? '【今天的目标】' + S.topic : '',
      S.memories.length
        ? '【关于这个学生，你记得】' + S.memories.slice(-6).map(function (m) { return m.text }).join('；')
        : ''
    ]
    return lines.filter(Boolean).join('\n')
  }

  // ---------- 模型调用 ----------
  function endpoint() {
    var base = (S.settings.baseUrl || '').replace(/\/+$/, '')
    if (!base) return ''
    if (/\/chat\/completions$/.test(base)) return base
    // 官方接口要 /chat/completions；已经带 /v1 的保持原样
    if (/\/v1$/.test(base)) return base + '/chat/completions'
    // 自定义代理（如 Cloudflare Worker）通常直接把 /chat/completions 挂在根上，
    // 也有的代理要求 /v1/chat/completions —— 两种都试，先根路径
    return base + '/chat/completions'
  }

  /** 代理地址（Worker）可以不带 Key：Key 存在 Worker 里更安全 */
  function isProxy() {
    var b = S.settings.baseUrl || ''
    return !!b && !/api\.deepseek\.com|api\.openai\.com/.test(b)
  }

  async function callModel(messages) {
    var s = S.settings
    if (!s.apiKey && !isProxy()) {
      return { ok: false, error: '还没填 API Key：点右上角「设置 → 模型」填一个，再试一次' }
    }
    var url = endpoint()
    if (!url) return { ok: false, error: 'Base URL 没填' }
    var res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: s.apiKey
          ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: s.model || 'deepseek-chat', messages: messages, stream: false, temperature: 0.7 })
      })
    } catch (e) {
      return {
        ok: false,
        error: '浏览器直连失败（' + (e && e.message ? e.message : '网络错误') + '）：'
          + '常见原因是服务端不允许跨域（CORS）。纯静态页面没有后端可以转发请求，'
          + '需要加一个代理，详见「部署说明」。'
      }
    }
    var body = ''
    try { body = await res.text() } catch (e) { /* ignore */ }
    if (!res.ok) {
      var hint = ''
      if (res.status === 401) hint = '（密钥无效或已删除）'
      if (res.status === 402) hint = '（账户余额不足）'
      if (res.status === 404) hint = '（模型名或 Base URL 不对）'
      if (res.status === 429) hint = '（请求太频繁或额度用尽）'
      return { ok: false, error: 'HTTP ' + res.status + hint + '：' + body.slice(0, 200) }
    }
    try {
      var json = JSON.parse(body)
      var msg = json.choices && json.choices[0] && json.choices[0].message
      var text = (msg && msg.content) || ''
      return { ok: true, reply: text.trim() }
    } catch (e) {
      return { ok: false, error: '返回的不是合法 JSON：' + body.slice(0, 160) }
    }
  }

  // ---------- 对外接口 ----------
  var api = {
    // 窗口控制：浏览器里没有意义，做成空操作
    minimize: function () { return Promise.resolve() },
    close: function () { return Promise.resolve() },
    toggleMaximize: function () { return Promise.resolve(false) },
    isMaximized: function () { return Promise.resolve(false) },
    onMaximizeChange: function () { return undefined },
    isFullscreen: function () { return Promise.resolve(false) },
    toggleFullscreen: function () { return Promise.resolve(false) },
    onFullscreenChange: function () { return undefined },

    appInfo: async function () {
      return { name: '伴学 CoStudy（Web 体验版）', version: '0.1.0-web', electron: '—', node: '—', platform: 'browser' }
    },
    appConfig: async function () {
      return { appName: '伴学 CoStudy', version: '0.1.0-web', web: true }
    },

    // 设置
    settingsGet: async function () {
      return {
        hasKey: Boolean(S.settings.apiKey),
        baseUrl: S.settings.baseUrl,
        model: S.settings.model,
        encryption: { available: false, backend: '浏览器 localStorage（未加密，仅存本机）' }
      }
    },
    settingsSave: async function (patch) {
      if (patch && patch.apiKey) S.settings.apiKey = String(patch.apiKey)
      if (patch && patch.baseUrl) S.settings.baseUrl = String(patch.baseUrl).trim()
      if (patch && patch.model) S.settings.model = String(patch.model).trim()
      save()
      return { ok: true }
    },
    settingsClear: async function () {
      S.settings.apiKey = ''
      save()
      return { ok: true }
    },
    settingsTest: async function () {
      var r = await callModel([{ role: 'user', content: '只回两个字：通了' }])
      return r.ok ? { ok: true, detail: r.reply } : { ok: false, error: r.error }
    },
    modelsList: async function () {
      return [{ id: S.settings.model, label: S.settings.model, baseUrl: S.settings.baseUrl }]
    },
    modelsProbe: async function () {
      var r = await callModel([{ role: 'user', content: 'ping' }])
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    },

    cards: {
    // 角色卡（契约与桌面端 preload 一致：list 返回 isActive、save(id, patch)、generate 返回 draft+diff）
      list: async function () {
        return S.cards.map(cardSummary)
      },
      get: async function (id) {
        var c = S.cards.find(function (x) { return x.id === id }) || activeCard()
        return c ? cardDetail(c) : null
      },
      save: async function (id, patch) {
        var i = S.cards.findIndex(function (x) { return x.id === id })
        if (i < 0) return { ok: false, error: '卡片不存在' }
        var next = Object.assign({}, S.cards[i], patch || {})
        next.id = id
        next.updatedAt = Date.now()
        if (next.dims && typeof next.dims !== 'object') next.dims = S.cards[i].dims
        S.cards[i] = next
        save()
        return { ok: true, card: cardSummary(next) }
      },
      create: async function (name) {
        var c = normalizeCard({ name: String(name || '').trim() || '新角色' })
        S.cards.push(c)
        S.activeCardId = c.id
        save()
        return cardSummary(c)
      },
      duplicate: async function (id) {
        var c = S.cards.find(function (x) { return x.id === id })
        if (!c) return null
        var copy = normalizeCard(JSON.parse(JSON.stringify(c)))
        copy.name = (c.name || '角色') + ' 副本'
        copy.updatedAt = Date.now()
        S.cards.push(copy)
        save()
        return cardSummary(copy)
      },
      remove: async function (id) {
        var before = S.cards.length
        S.cards = S.cards.filter(function (x) { return x.id !== id })
        if (S.cards.length === before) return false
        if (!S.cards.length) S.cards = [normalizeCard({ id: 'role-web-1' })]
        if (!S.cards.some(function (x) { return x.id === S.activeCardId })) S.activeCardId = S.cards[0].id
        save()
        return true
      },
      setActive: async function (id) {
        if (!S.cards.some(function (x) { return x.id === id })) return false
        S.activeCardId = id
        save()
        return true
      },
      exportJson: async function (id) {
        var c = S.cards.find(function (x) { return x.id === id }) || activeCard()
        if (!c) return null
        var out = cardDetail(c)
        out.spec = 'chara_card_v2'
        out.spec_version = '2.0'
        return JSON.stringify(out, null, 2)
      },
      importJson: async function (text) {
        var raw = pickJson(text)
        if (!raw || typeof raw !== 'object') return { ok: false, error: '不是合法的角色卡 JSON' }
        var c = normalizeCard(raw)
        S.cards.push(c)
        S.activeCardId = c.id
        save()
        return { ok: true, card: cardSummary(c) }
      },
      /* AI 写卡：返回草稿 + 与当前卡的差异，不落盘（由用户确认后再 save） */
      generate: async function (keywords) {
        var cur = activeCard()
        var ask = [
          '按下面的关键词，写一张伴学角色卡。只输出 JSON，不要解释、不要代码块围栏。',
          '字段：name, emoji, address(怎么称呼学生), description(来历/背景), personality(性格特质，写行为),',
          'scenario(情境), style(说话风格), rules(伴学守则), behavior(在场的样子), opening(开场白),',
          'mesExample(一段示范对话), ageRating(all-ages|teen|adult)。',
          '关键词：' + String(keywords || '')
        ].join('\n')
        var r = await callModel([
          { role: 'system', content: '你在帮人设计伴学角色。只输出一个 JSON 对象。' },
          { role: 'user', content: ask }
        ])
        if (!r.ok) return { ok: false, error: r.error }
        var parsed = pickJson(r.reply)
        if (!parsed) return { ok: false, error: '模型没有给出可解析的 JSON' }
        var draft = {}
        CARD_TEXT_FIELDS.forEach(function (k) {
          if (parsed[k] !== undefined && parsed[k] !== null) draft[k] = String(parsed[k])
        })
        if (parsed.ageRating) draft.ageRating = String(parsed.ageRating)
        if (!draft.name) draft.name = String(keywords || '新角色').slice(0, 12)
        var diff = []
        Object.keys(draft).forEach(function (k) {
          var before = String((cur && cur[k]) || '')
          if (before !== draft[k]) diff.push({ field: k, before: before, after: draft[k] })
        })
        return { ok: true, draft: draft, diff: diff, client: 'browser' }
      },
      cardChatDraft: async function (p) {
        var r = await callModel([
          { role: 'system', content: '你在帮人把一句话需求写成伴学角色卡，只输出 JSON。' },
          { role: 'user', content: String((p && p.brief) || '') }
        ])
        if (!r.ok) return { ok: false, error: r.error }
        var draft = pickJson(r.reply)
        return draft ? { ok: true, draft: draft } : { ok: false, error: '模型没有给出可解析的 JSON' }
      },
      cardPolish: async function (p) {
        var r = await callModel([{ role: 'user', content: '把这段话改写得更加具体、更像行为描述：' + JSON.stringify(p || {}) }])
        return r.ok ? { ok: true, text: r.reply } : { ok: false, error: r.error }
      },
    },

    // 插件 / 模式 / 工作区
    pluginsGet: async function () { return S.plugins },
    pluginsSet: async function (id, on) {
      S.plugins.forEach(function (p) { if (p.id === id) p.enabled = Boolean(on) })
      save(); return { ok: true }
    },
    modeGet: async function () {
      return { mode: S.mode, allowed: S.mode === 'work' ? ['read', 'write', 'exec'] : ['read'] }
    },
    modeSet: async function (m) {
      S.mode = m === 'work' ? 'work' : 'chat'; save()
      return { mode: S.mode, allowed: S.mode === 'work' ? ['read', 'write', 'exec'] : ['read'] }
    },
    workspaceGet: async function () {
      return { root: '（浏览器版没有本地工作区）', fallback: '（不可用）' }
    },

    // 统计
    studyToday: async function () {
      var mins = Math.round(S.studySeconds / 60)
      return { seconds: S.studySeconds, minutes: mins, week: [] }
    },
    statsDaily: async function () {
      var byDay = {}
      for (var i = 6; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i)
        var k = dayKey(d.getTime())
        byDay[k] = S.daily[k] || 0
      }
      var total = Object.keys(byDay).reduce(function (a, k) { return a + byDay[k] }, 0)
      return { byDay: byDay, total: total, days: 7 }
    },

    // 附件 / 导出
    chartsMeta: async function () { return [] },
    imagePick: async function () { return { ok: false, error: '浏览器版暂不支持选图' } },
    savePng: async function (dataUrl) {
      try {
        var a = document.createElement('a')
        a.href = dataUrl; a.download = '伴学-' + Date.now() + '.png'
        document.body.appendChild(a); a.click(); a.remove()
        return { ok: true }
      } catch (e) { return { ok: false, error: String(e) } }
    },
    saveAs: async function (p) { return { ok: false, error: '浏览器版不支持写本地文件' } },
    outboxList: async function () { return [] },
    outboxDrop: async function () { return { ok: true } },

    // 联网
    webSearch: async function () { return { ok: false, error: '静态版没有接入联网检索' } },

    // 语音：朗读走浏览器自带，识别同理
    ttsConfig: async function () { return { engine: 'browser', voice: '' } },
    ttsSynthesize: async function (req) {
      var text = String((req && req.text) || '').slice(0, 400)
      if (!text) return { ok: false, error: '空文本' }
      try {
        var u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'; u.rate = 1
        speechSynthesis.speak(u)
        return { ok: true, engine: 'speechSynthesis' }
      } catch (e) { return { ok: false, error: '浏览器不支持语音合成' } }
    },
    asrConfig: async function () { return { engine: 'browser', language: 'zh-CN' } },
    asrStart: async function () { return { ok: false, error: '浏览器版请直接用输入法，或系统的语音听写' } },
    asrChunk: async function () { return false },
    asrStop: async function () { return '' },
    asrProbeLocal: async function () { return { ok: false, detail: '浏览器环境没有本机听写服务' } },
    asrUseLocal: async function () { return { ok: false } }
  }

  // 别名：真实工程里这些名字在不同版本出现过，两个都挂上
  api.memoryLibraryArchive = api.memoryLibraryArchive
  api.exportPng = api.savePng
  api.min = api.minimize

  // 计时：窗口在前台才累加（和桌面版同一口径）
  setInterval(function () {
    if (document.visibilityState === 'visible') { S.studySeconds += 20; save() }
  }, 20000)

  window.costudy = api
  save()
})()
