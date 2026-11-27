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
  var BUILD = '20261127-final-review'
  try { window.__COSTUDY_WEB_BUILD = BUILD; console.info('[CoStudy] web bridge ' + BUILD) } catch (e) {}
  /* 角色卡默认值：字段与桌面端 CardDetail 对齐（src/preload 的 CardSummary / CardDetail）。
     dims / teaching / catchphrase 是角色工坊还在用的历史字段，保留以免旧数据丢失。 */
  var CARD_TEXT_FIELDS = ['name', 'emoji', 'address', 'description', 'personality', 'scenario',
    'style', 'rules', 'behavior', 'opening', 'firstMes', 'mesExample', 'systemPrompt',
    'postHistoryInstructions', 'dislikes']
  var CARD_DEFAULTS = {
    id: '',
    name: '温柔学姐',
    emoji: '🌷',
    address: '同学',
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
    dislikes: '',
    ageRating: 'all-ages',
    updatedAt: 0,
    // 历史字段（角色工坊仍会读写）
    catchphrase: '来，我们一起看看',
    stage: '高中',
    exercise: '中',
    errorMode: '立刻纠正',
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
    for (var key of ['catchphrase', 'stage', 'exercise', 'errorMode']) out[key] = c[key]
    return out
  }

  /** 从模型回复里抠出 JSON（允许 ```json 包裹） */
  function pickJson(text) {
    var t = String(text || '')
    var m = t.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch (e) { return null }
  }

  function draftFields(raw) {
    var draft = {}
    CARD_TEXT_FIELDS.forEach(function (field) {
      if (typeof raw?.[field] !== 'string') return
      var value = raw[field].trim()
      if (value) draft[field] = value.slice(0, field === 'name' ? 24 : 1600)
    })
    return draft
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
      topic: { stage: '高中', course: '数学 · 一元二次方程', goal: '弄懂求根公式是怎么来的，能自己解出带分数根的题' },
      profile: {},
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
  if (!Array.isArray(S.cards) || !S.cards.length) S.cards = [DEFAULT_CARD]
  // 旧版复制卡沿用原 ID。保留第一个 ID，给其余副本分配新 ID。
  var reservedCardIds = new Set(S.cards.map(function (card) { return card.id }))
  var seenCardIds = new Set()
  S.cards.forEach(function (card) {
    if (seenCardIds.has(card.id)) {
      do { card.id = uid('role') } while (reservedCardIds.has(card.id))
      reservedCardIds.add(card.id)
    }
    seenCardIds.add(card.id)
  })
  if (!Array.isArray(S.sessions)) S.sessions = []
  S.sessions = S.sessions.filter(function (session) { return session && typeof session.id === 'string' })
  S.sessions.forEach(function (session) {
    if (!session.cardId) session.cardId = activeCard().id
    if (!Array.isArray(session.messages)) session.messages = []
  })
  if (!Array.isArray(S.memories)) S.memories = []
  if (!Array.isArray(S.drafts)) S.drafts = []
  var savedPlugins = Array.isArray(S.plugins) ? S.plugins : []
  S.plugins = defaultPlugins().map(function (plugin) {
    if (plugin.kind === 'capability') return Object.assign(plugin, { installed: false, status: '桌面版' })
    var saved = savedPlugins.find(function (item) { return item && item.id === plugin.id })
    if (typeof saved?.enabled === 'boolean') plugin.enabled = saved.enabled
    return plugin
  })
  if (!S.daily || typeof S.daily !== 'object') S.daily = {}
  if (!S.studyByDay || typeof S.studyByDay !== 'object') S.studyByDay = {}
  if (!S.topic || typeof S.topic !== 'object') {
    S.topic = {
      stage: '高中',
      course: '数学 · 一元二次方程',
      goal: String(S.topic || '弄懂求根公式是怎么来的，能自己解出带分数根的题')
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S))
      return true
    } catch (e) {
      console.warn('[bridge] 存不下', e)
      return false
    }
  }
  function now() { return Date.now() }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10) }

  function activeCard() {
    return S.cards.find(function (c) { return c.id === S.activeCardId }) || S.cards[0]
  }
  function findSession(id) {
    return S.sessions.find(function (item) { return item.id === id })
  }
  function ensureSession() {
    var cardId = activeCard().id
    var current = findSession(S.currentSessionId)
    if (current?.cardId !== cardId) current = S.sessions.find(function (session) { return session.cardId === cardId })
    if (!current) {
      current = { id: uid('session'), cardId: cardId, title: '新对话', createdAt: now(), messages: [] }
      S.sessions.push(current)
    }
    if (!Array.isArray(current.messages)) current.messages = []
    S.currentSessionId = current.id
    return current
  }
  function sessionMeta(current) {
    return { id: current.id, title: current.title, phase: 'opening', point: S.topic.course, count: current.messages.length }
  }
  function indexedMemories() {
    return S.memories.filter(function (entry) {
      return entry && typeof entry.id === 'string' && typeof entry.text === 'string' && entry.text.trim()
    })
  }
  function visibleMemories() {
    return indexedMemories().filter(function (entry) { return !entry.archived })
  }
  function memoryView(entry) {
    return {
      id: entry.id,
      text: entry.text,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      evidence: String(entry.evidence || ''),
      hits: Number(entry.hits) || 0
    }
  }
  function dayKey(t) {
    var d = new Date(t)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  // ---------- 提示词 ----------
  var ROLE_FIELDS = {
    description: '角色背景', personality: '性格和行为倾向', scenario: '情境', style: '说话风格',
    rules: '伴学守则', behavior: '互动节奏', opening: '开场示例', mesExample: '对话示例', dislikes: '避免'
  }
  var DIMENSIONS = {
    warmth: '语气冷静 → 热情', formality: '口语 → 正式', humor: '严肃 → 多用幽默',
    patience: '简明推进 → 换方法耐心陪讲', strict: '宽松 → 严格指出错步',
    proactive: '按需回答 → 主动检查理解', praise: '少夸 → 多指出做对的地方',
    verbosity: '简短 → 详细', abstract: '先举例 → 先讲原理', tempo: '舒缓 → 利落',
    closeness: '保持礼貌距离 → 同伴式关心', stability: '情绪外显 → 平和平稳'
  }
  var TEACHING = {
    socratic: ['用一个有针对性的问题引导学习者说出下一步，先给提示。', '按讲解比例提供提示或直接示范，不要求用反问推进。'],
    diagnose: ['新知识点先用一个短问题定位卡点，再决定怎么教。', '直接从已提出的问题开始，不额外做起点测试。'],
    review: ['相关时提示回顾已谈过或记录的内容。', '当前题做完即可，不主动插入复习。']
  }

  function rolePrompt(card) {
    var c = Object.assign({}, activeCard(), card)
    var dims = Object.assign({}, activeCard().dims, card?.dims)
    var explain = Number.isFinite(dims.explain) ? dims.explain : 38
    var lines = [
      '你是「' + c.name + '」，一位' + (c.stage || '高中') + '阶段的伴学角色，正在陪「' + (c.address || '同学') + '」学习。',
      c.catchphrase ? '常用开场：' + c.catchphrase + '。' : '',
      ...Object.entries(ROLE_FIELDS).map(function (field) {
        var value = String(c[field[0]] || '').trim()
        return value ? field[1] + '：' + value : ''
      }),
      '性格维度（0 靠左，100 靠右）：' + Object.entries(DIMENSIONS).map(function (entry) {
        var value = Number.isFinite(dims[entry[0]]) ? dims[entry[0]] : 50
        return entry[1] + ' ' + Math.round(Math.min(100, Math.max(0, value)))
      }).join('；') + '。',
      '讲解比例 ' + Math.round(Math.min(100, Math.max(0, explain))) + '%（低值先提示，高值先解释）。出题频率：'
        + (c.exercise || '中') + '。错误处理：' + (c.errorMode || '立刻纠正') + '。',
      ...S.plugins.filter(function (plugin) { return plugin.id in TEACHING }).map(function (plugin) {
        return plugin.name + '（' + (plugin.enabled ? '开启' : '关闭') + '）：' + TEACHING[plugin.id][plugin.enabled ? 0 : 1]
      }),
      '【当前是浏览器体验版】你没有工具：不能画图、不能执行代码、不能联网、不能读写文件。'
        + '做不到就直接说明，不要假装做过。',
      '【硬约束】全年龄向：不做心理诊断、不索取真实个人信息、不建立情感依赖话术、不适龄内容一律拒绝。'
    ]
    return lines.filter(Boolean).join('\n')
  }

  function systemPrompt() {
    return [
      rolePrompt(),
      '【本节主题】' + S.topic.course + '\n【今天的目标】' + S.topic.goal,
      ...visibleMemories().slice(-6).map(function (m) { return '【学习者记录】' + m.text })
    ].join('\n')
  }

  // ---------- 模型调用 ----------
  function endpoint(baseUrl) {
    var base = (baseUrl || '').replace(/\/+$/, '')
    if (!base) return ''
    if (/\/chat\/completions$/.test(base)) return base
    // 官方接口要 /chat/completions；已经带 /v1 的保持原样
    if (/\/v1$/.test(base)) return base + '/chat/completions'
    // 自定义代理（如 Cloudflare Worker）通常直接把 /chat/completions 挂在根上，
    // 也有的代理要求 /v1/chat/completions —— 两种都试，先根路径
    return base + '/chat/completions'
  }

  /** 代理地址（Worker）可以不带 Key：Key 存在 Worker 里更安全 */
  function isProxy(base) {
    return !!base && !/api\.deepseek\.com|api\.openai\.com/.test(base)
  }

  async function callModel(messages, settings) {
    var s = settings || S.settings
    if (!s.apiKey && !isProxy(s.baseUrl)) {
      return { ok: false, error: '还没填 API Key。可打开「模型设置」配置后重试。' }
    }
    var url = endpoint(s.baseUrl)
    if (!url) return { ok: false, error: 'Base URL 没填' }
    var modelUrl
    try { modelUrl = new URL(url) } catch (_) {
      return { ok: false, error: 'Base URL 格式不正确。' }
    }
    var local = ['localhost', '127.0.0.1', '[::1]'].includes(modelUrl.hostname)
    if (modelUrl.protocol !== 'https:' && !(local && modelUrl.protocol === 'http:')) {
      return { ok: false, error: '模型地址须使用 HTTPS，本机模型可使用 HTTP。' }
    }
    var res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: s.apiKey
          ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: s.model || 'deepseek-chat', messages: messages, stream: false, temperature: 0.7 }),
        signal: AbortSignal.timeout(25000)
      })
    } catch (e) {
      return {
        ok: false,
        error: e && e.name === 'TimeoutError'
          ? '模型请求超时，请稍后重试。'
          : '浏览器无法连接模型，请检查模型地址、网络和服务端跨域设置。'
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
      return { ok: false, error: '模型请求失败，HTTP ' + res.status + hint }
    }
    try {
      var json = JSON.parse(body)
      var msg = json.choices && json.choices[0] && json.choices[0].message
      var text = msg && typeof msg.content === 'string' ? msg.content.trim() : ''
      return text ? { ok: true, reply: text } : { ok: false, error: '模型没有返回可显示的回答。' }
    } catch (e) {
      return { ok: false, error: '模型返回的数据格式不正确。' }
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
        source: S.settings.apiKey ? 'stored' : 'none',
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
    settingsTest: async function (patch) {
      var start = now()
      var draft = Object.assign({}, S.settings, patch)
      if (draft.apiKey === undefined) draft.apiKey = S.settings.apiKey
      var r = await callModel([{ role: 'user', content: '只回两个字：通了' }], draft)
      return { ok: r.ok, ms: now() - start, client: draft.model, snippet: r.reply, error: r.error }
    },
    modelsList: async function () {
      return [{ id: S.settings.model, label: S.settings.model, baseUrl: S.settings.baseUrl }]
    },
    modelsProbe: async function () {
      var r = await callModel([{ role: 'user', content: 'ping' }])
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    },

    learnTopic: async function () { return Object.assign({}, S.topic) },
    learnTopicSet: async function (patch) {
      for (var field of ['stage', 'course', 'goal']) {
        if (patch && typeof patch[field] === 'string') S.topic[field] = patch[field].trim()
      }
      save()
      return Object.assign({}, S.topic)
    },
    sessionEnsure: async function () { return sessionMeta(ensureSession()) },
    sessionList: async function () {
      return S.sessions.filter(function (session) { return session.messages.length > 0 }).map(function (session) {
        var first = session.messages.find(function (message) { return message.role === 'user' })
        var last = session.messages[session.messages.length - 1]
        return {
          id: session.id,
          title: String(first?.text || session.title || '学习对话').slice(0, 64),
          count: session.messages.filter(function (message) { return message.role === 'user' }).length,
          updatedAt: last.at
        }
      }).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)) })
    },
    activeCard: async function () { return cardDetail(activeCard()) },
    rolePromptPreview: rolePrompt,
    rolePreviewReply: async function (card, question) {
      var text = String(question || '').trim()
      if (!text) return { ok: false, error: '请选择一道预览题。' }
      return callModel([{ role: 'system', content: rolePrompt(card) }, { role: 'user', content: text }])
    },
    sessionMessages: async function (id) {
      var current = findSession(id)
      return current && Array.isArray(current.messages) ? current.messages.slice() : []
    },
    sessionClear: async function (id) {
      var current = id ? findSession(id) : ensureSession()
      if (!current) return { ok: false, removed: 0, error: '找不到这段对话' }
      var removed = current.messages.length
      current.messages = []
      save()
      return { ok: true, removed: removed }
    },
    learnReply: async function (payload) {
      var text = String((payload && payload.text) || '').trim()
      if (!text) return { ok: false, error: '请先输入问题。' }
      var current = ensureSession()
      var previousMessages = current.messages
      var history = previousMessages.slice(-24).map(function (message) {
        return { role: message.role, content: message.text }
      })
      var messages = [{ role: 'system', content: systemPrompt() }]
        .concat(history, { role: 'user', content: text })
      var result = await callModel(messages)
      if (!result.ok) return result
      if (current.messages !== previousMessages) return { ok: false, error: '请求期间已清空对话。可以重新发送。' }
      var at = new Date().toISOString()
      current.messages.push({ role: 'user', text: text, at: at }, { role: 'assistant', text: result.reply, at: at })
      var today = dayKey(now())
      var previousCount = S.daily[today]
      S.daily[today] = (previousCount || 0) + 1
      if (!save()) {
        current.messages.splice(-2)
        if (previousCount === undefined) delete S.daily[today]
        else S.daily[today] = previousCount
        return { ok: false, error: '浏览器无法保存对话，请检查本地存储空间。' }
      }
      return {
        ok: true, sessionId: current.id, reply: result.reply,
        searchError: payload.search ? '网页端暂不支持联网检索' : undefined
      }
    },
    memoryLibrary: async function () {
      var entries = visibleMemories().map(memoryView).reverse()
      return {
        entries: entries,
        counts: {
          total: entries.length,
          tagged: entries.filter(function (entry) { return entry.tags.length }).length,
          archived: indexedMemories().length - entries.length
        }
      }
    },
    memoryLibrarySearch: async function (query, limit) {
      var terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
      if (!terms.length) return []
      return visibleMemories().map(function (entry) {
        var view = memoryView(entry)
        var haystack = [view.text, view.evidence].concat(view.tags).join(' ').toLowerCase()
        view.matched = terms.filter(function (term) { return haystack.includes(term) })
        view.score = view.matched.length
        return view
      }).filter(function (entry) { return entry.score > 0 })
        .sort(function (left, right) { return right.score - left.score })
        .slice(0, Math.min(50, Math.max(1, Number(limit) || 20)))
    },
    memoryLibraryAdd: async function (value) {
      var text = String(value || '').trim().slice(0, 500)
      if (!text) return false
      S.memories.push({ id: uid('memory'), text: text, tags: [], evidence: '手动记录', hits: 0 })
      save()
      return true
    },
    memoryLibraryArchive: async function (id) {
      var entry = visibleMemories().find(function (item) { return item.id === id })
      if (!entry) return false
      entry.archived = true
      save()
      return true
    },
    memoryLibraryDelete: async function (id) {
      var index = S.memories.findIndex(function (entry) { return entry && entry.id === id })
      if (index < 0) return false
      S.memories.splice(index, 1)
      save()
      return true
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
        var previous = S.cards[i]
        S.cards[i] = next
        if (!save()) {
          S.cards[i] = previous
          return { ok: false, error: '浏览器无法保存角色，请检查本地存储空间。' }
        }
        return { ok: true, card: cardSummary(next) }
      },
      create: async function (name, patch) {
        var previousId = S.activeCardId
        var c = normalizeCard(Object.assign({}, patch, {
          id: uid('role'), name: String(name || '').trim() || '新角色', updatedAt: Date.now()
        }))
        S.cards.push(c)
        S.activeCardId = c.id
        if (!save()) {
          S.cards.pop()
          S.activeCardId = previousId
          return null
        }
        return cardSummary(c)
      },
      duplicate: async function (id) {
        var c = S.cards.find(function (x) { return x.id === id })
        if (!c) return null
        var copy = normalizeCard(Object.assign({}, c, {
          id: uid('role'), name: (c.name || '角色') + ' 副本', updatedAt: Date.now()
        }))
        S.cards.push(copy)
        if (save()) return cardSummary(copy)
        S.cards.pop()
        return null
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
        var c = normalizeCard(Object.assign({}, raw, { id: uid('role') }))
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
      cardPolish: async function (p) {
        var r = await callModel([{ role: 'user', content: '把这段话改写得更加具体、更像行为描述：' + JSON.stringify(p || {}) }])
        return r.ok ? { ok: true, text: r.reply } : { ok: false, error: r.error }
      },
    },

    cardChatDraft: async function (payload) {
      var brief = String(payload?.brief || '').trim()
      if (!brief) return { ok: false, error: '请先描述你想要的角色。' }
      var context = String(payload?.context || '').slice(0, 3000)
      var question = 'x² − 5x + 6 = 0 怎么解？'
      var current = activeCard()
      var instructions = [
        '按学习者的需求设计一张全年龄的伴学角色卡。只输出一个 JSON 对象，字段值均为字符串。',
        '字段：name（角色名）, emoji（头像）, address（称呼）, description（来历）, personality（具体性格表现）, scenario（情境）,',
        'style（说话风格）, rules（教学守则）, behavior（在场表现）, opening（开场白）, mesExample（两轮示范对话）,',
        'sample（听到「' + question + '」时，用角色口吻讲出第一步，再问学习者一个问题）。',
        '用户明确指定名字时，name 逐字保留，包括已有作品中的虚构角色名。只描述风格时，可以自拟原创角色名。',
        '改写已有草稿时，保留原名，除非用户明确要求换名。',
        '不模仿真实人物。教学问答用原创表达，不照搬作品台词，不写情感依赖暗示。'
      ]
      var input = ['需求：' + brief.slice(0, 1500), '学段：' + (S.topic?.stage || '高中')]
      if (!payload?.create && current) {
        input.push('当前角色：' + current.name + '；说话风格：' + current.style)
      }
      if (context) input.push('参考资料或待修改的草稿：' + context)
      var started = Date.now()
      var response = await callModel([
        { role: 'system', content: instructions.join('\n') },
        { role: 'user', content: input.join('\n') }
      ])
      if (!response.ok) return { ok: false, error: response.error }
      var result = pickJson(response.reply)
      var draft = draftFields(result)
      if (!draft.name) return { ok: false, error: '模型没有返回完整角色卡，请重试。' }
      if (draft.opening) draft.firstMes = draft.firstMes || draft.opening
      var sample = typeof result.sample === 'string' ? result.sample.trim().slice(0, 1600) : ''
      var saved = {
        id: uid('draft'),
        brief: brief.slice(0, 1500),
        draft: draft,
        sample: sample || draft.mesExample || '',
        question: sample ? question : undefined
      }
      var previousDrafts = S.drafts
      S.drafts = [saved].concat(previousDrafts.slice(0, 19))
      if (!save()) {
        S.drafts = previousDrafts
        return { ok: false, error: '浏览器无法保存草稿，请检查本地存储空间或浏览器设置。' }
      }
      return { ok: true, draft: draft, draftId: saved.id, sample: saved.sample, question: saved.question, ms: Date.now() - started }
    },
    cardChatApply: async function (payload) {
      var previousDrafts = S.drafts
      var saved = payload?.draftId && previousDrafts.find(function (item) { return item.id === payload.draftId })
      if (payload?.draftId && !saved) return { ok: false, error: '这份草稿已采用或删除，请重新生成。' }
      var draft = draftFields(saved ? saved.draft : payload?.draft)
      if (typeof payload?.name === 'string') draft.name = payload.name.trim().slice(0, 24)
      if (!draft.name) return { ok: false, error: '请填写角色名。' }

      var priorCards = S.cards
      var priorId = S.activeCardId
      if (payload?.create) {
        var card = normalizeCard(Object.assign({}, draft, { updatedAt: Date.now() }))
        S.cards = priorCards.concat(card)
        S.activeCardId = card.id
      } else {
        var current = activeCard()
        if (!current) return { ok: false, error: '没有可更新的角色卡' }
        S.cards = priorCards.map(function (card) {
          return card.id === current.id ? Object.assign({}, card, draft, { updatedAt: Date.now() }) : card
        })
      }
      if (saved) S.drafts = previousDrafts.filter(function (item) { return item.id !== saved.id })
      if (!save()) {
        S.cards = priorCards
        S.activeCardId = priorId
        S.drafts = previousDrafts
        return { ok: false, error: '浏览器无法保存角色，请检查本地存储空间或浏览器设置。' }
      }
      return { ok: true }
    },
    draftList: async function () { return S.drafts },
    draftDrop: async function (id) {
      var before = S.drafts
      S.drafts = before.filter(function (item) { return item.id !== id })
      if (S.drafts.length !== before.length && save()) return { ok: true }
      S.drafts = before
      return { ok: false }
    },

    // 插件 / 模式 / 工作区
    pluginsGet: async function () { return S.plugins },
    pluginsSet: async function (id, on) {
      S.plugins.forEach(function (p) { if (p.id === id && p.kind === 'teaching') p.enabled = Boolean(on) })
      save(); return S.plugins
    },
    modeGet: async function () {
      return { mode: 'chat', allowed: ['read'] }
    },
    modeSet: async function () {
      return { mode: 'chat', allowed: ['read'] }
    },
    workspaceGet: async function () {
      return { root: '（浏览器版没有本地工作区）', fallback: '（不可用）' }
    },

    // 统计
    studyToday: async function () {
      var seconds = S.studyByDay[dayKey(now())] || 0
      return { seconds: seconds, minutes: Math.floor(seconds / 60), week: [] }
    },
    statsDaily: async function () {
      var byDay = Object.assign({}, S.daily)
      var counts = Object.values(byDay).filter(function (count) { return count > 0 })
      return { byDay: byDay, total: counts.reduce(function (sum, count) { return sum + count }, 0), days: counts.length, todayTs: [] }
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
  api.exportPng = api.savePng
  api.min = api.minimize

  // 计时：窗口在前台才累加（和桌面版同一口径）
  setInterval(function () {
    if (document.visibilityState === 'visible' && document.querySelector('.v-comp [data-thread]')) {
      var today = dayKey(now())
      S.studyByDay[today] = (S.studyByDay[today] || 0) + 20
      save()
    }
  }, 20000)

  window.costudy = api
  save()
})()
