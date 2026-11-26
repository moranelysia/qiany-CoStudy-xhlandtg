import { contextBridge, ipcRenderer } from 'electron'

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
}

/** 角色卡列表项（不含长文本，界面列表用） */
export interface CardSummary {
  id: string
  name: string
  emoji: string
  address: string
  ageRating: string
  updatedAt: string
  isActive: boolean
}

/** 编辑器用的完整卡片 */
export interface CardDetail {
  id: string
  name: string
  emoji: string
  address: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  mesExample: string
  systemPrompt: string
  postHistoryInstructions: string
  style: string
  rules: string
  behavior: string
  opening: string
  ageRating: string
}

/** learn:overview 的返回结构 */
export interface OverviewPayload {
  card: { name: string; emoji: string; address: string }
  stage: string
  profile: {
    subjects: Array<{ subject: string; points: number; avgMastery: number }>
    weakPoints: Array<{ name: string; mastery: number }>
    errorTypes: Array<{ type: string; count: number }>
    counts: { points: number; dueToday: number; mistakes: number; openMistakes: number }
  }
  due: Array<{ name: string; subject: string; nextReview: string; mastery: number }>
  mistakes: Array<{ point: string; errorType: string; wrongStep: string; recurrences: number }>
  session: { phase: string; goal: string; taught: number; total: number } | null
}

export type CardsApi = {
  list: () => Promise<CardSummary[]>
  get: (id: string) => Promise<CardDetail | null>
  create: (name?: string) => Promise<CardSummary | null>
  duplicate: (id: string) => Promise<CardSummary | null>
  remove: (id: string) => Promise<boolean>
  setActive: (id: string) => Promise<boolean>
  importJson: (text: string) => Promise<{ ok: boolean; card?: CardSummary | null; error?: string }>
  exportJson: (id: string) => Promise<string | null>
  /** AI 写卡：只返回草稿与 diff，不写盘 */
  generate: (keywords: string) => Promise<
    | {
        ok: true
        draft: Record<string, string>
        diff: Array<{ field: string; before: string; after: string }>
        client: string
      }
    | { ok: false; error: string }
  >
  save: (
    id: string,
    patch: Partial<Omit<CardDetail, 'id'>>,
  ) => Promise<{ ok: boolean; card?: CardSummary | null; error?: string }>
}

const api = {
  info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  /** 切换全屏，返回切换后的状态 */
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:toggleFullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:isFullscreen'),


  /** 最小化到任务栏 */
  minimize: (): void => {
    void ipcRenderer.invoke('app:minimize')
  },

  /** 关闭窗口并结束整个进程 */
  close: (): void => {
    void ipcRenderer.invoke('app:close')
  },
  /** 最大化 / 还原，返回切换后的状态 */
  toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('app:toggleMaximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('app:isMaximized'),

  /** 订阅最大化状态变化（拖拽区双击、系统操作都会触发） */
  onMaximizeChange: (cb: (on: boolean) => void): void => {
    ipcRenderer.on('app:maximize-changed', (_e, on: boolean) => cb(on))
  },



  /** 订阅全屏状态变化（F11 / Esc / 系统按钮都会触发） */
  onFullscreenChange: (cb: (on: boolean) => void): void => {
    ipcRenderer.on('app:fullscreen-changed', (_e, on: boolean) => cb(on))
  },

  /** 应用配置（界面需要的子集） */
  config: (): Promise<{ appName: string; stage: string }> => ipcRenderer.invoke('app:config'),

  /** 当前生效的角色卡摘要 */
  activeCard: (): Promise<{
    name: string
    emoji: string
    address: string
    ageRating: string
    hasContent: boolean
  }> => ipcRenderer.invoke('app:card'),


  /** P1：会话 */
  sessionEnsure: (): Promise<unknown> => ipcRenderer.invoke('session:ensure'),
  sessionList: (): Promise<unknown[]> => ipcRenderer.invoke('session:list'),
  sessionMessages: (id: string): Promise<unknown[]> => ipcRenderer.invoke('session:messages', id),
  sessionCreate: (title: string): Promise<unknown> => ipcRenderer.invoke('session:create', title),
  sessionSetCurrent: (id: string): Promise<boolean> => ipcRenderer.invoke('session:setCurrent', id),
  sessionAdvance: (id: string, to: string): Promise<{ ok: boolean; phase?: string; error?: string }> =>
    ipcRenderer.invoke('session:advance', { id, to }),
  /** 清空聊天记录（会把原记录挪到 会话/已删除/ 备份，不直接销毁） */
  sessionClear: (id?: string): Promise<{ ok: boolean; removed: number; backup?: string; error?: string }> =>
    ipcRenderer.invoke('session:clear', id),

  /** P1：一轮学习对话（落盘 + 调模型） */
  learnReply: (payload: { sessionId?: string; text: string; search?: boolean }): Promise<{
    ok: boolean
    sessionId?: string
    phase?: string
    reply?: string
    client?: string
    error?: string
    /** 开了联网搜索时，这次回答引用了哪些网页 */
    sources?: Array<{ title: string; url: string }>
    /** 开了搜索但没搜成功时的原因（回答仍然会返回，只是没有联网内容） */
    searchError?: string
  }> => ipcRenderer.invoke('learn:reply', payload),

  /** 抓网页正文（M3 的资料补充） */
  webFetch: (url: string): Promise<{
    ok: boolean
    url?: string
    title?: string
    text?: string
    content?: string
    chars?: number
    truncated?: boolean
    error?: string
  }> => ipcRenderer.invoke('web:fetch', url),

  /** ASR 语音输入配置（引擎搬自 Cyrene-Agent，MIT） */
  asrConfig: (): Promise<unknown> => ipcRenderer.invoke('asr:config'),
  asrConfigSet: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('asr:config:set', patch),
  /** 本地系统听写能不能用（有没有中文语音识别器） */
  asrProbeLocal: (): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke('asr:probe-local'),
  /** 一键切换到本地听写（不要密钥） */
  asrUseLocal: (): Promise<unknown> => ipcRenderer.invoke('asr:use-local'),
  outboxList: (): Promise<unknown[]> => ipcRenderer.invoke('outbox:list'),
  outboxDrop: (id: string): Promise<unknown[]> => ipcRenderer.invoke('outbox:drop', id),
  outboxClear: (): Promise<unknown[]> => ipcRenderer.invoke('outbox:clear'),
  profileState: (): Promise<unknown> => ipcRenderer.invoke('profile:state'),
  profileSetEnabled: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke('profile:set-enabled', enabled),
  profileUndo: (): Promise<unknown> => ipcRenderer.invoke('profile:undo'),
  modeGet: (): Promise<unknown> => ipcRenderer.invoke('mode:get'),
  modeSet: (mode: string): Promise<unknown> => ipcRenderer.invoke('mode:set', mode),
  /** 代码工作区：范围之外的写入会弹窗要人点头 */
  workspaceGet: (): Promise<unknown> => ipcRenderer.invoke('workspace:get'),
  workspaceSet: (root: string): Promise<unknown> => ipcRenderer.invoke('workspace:set', root),
  workspacePick: (): Promise<unknown> => ipcRenderer.invoke('workspace:pick'),
  healthCheck: (): Promise<unknown> => ipcRenderer.invoke('health:check'),
  chartsGet: (id: string): Promise<string | null> => ipcRenderer.invoke('charts:get', id),
  /** 选一张照片：主进程弹对话框、复制进 记忆/图片/，返回 id */
  imagePick: (): Promise<{ ok: boolean; canceled?: boolean; id?: string; name?: string; bytes?: number; vision?: boolean; error?: string }> =>
    ipcRenderer.invoke('image:pick'),
  /** 按 id 取图：返回 data URL，直接塞进 <img> */
  imageGet: (id: string): Promise<{ name: string; mime: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('image:get', id),
  /** 粘贴进来的图（base64）：存盘后返回 id */
  imagePaste: (payload: { base64: string; mime?: string; name?: string }): Promise<{
    ok: boolean
    id?: string
    name?: string
    bytes?: number
    vision?: boolean
    error?: string
  }> => ipcRenderer.invoke('image:paste', payload),
  /** 图卡片的附属信息（原理 / 步骤 / 校验结果） */
  chartsRerender: (kind: string, args: unknown): Promise<{ ok: boolean; id?: string; text?: string }> =>
    ipcRenderer.invoke('charts:rerender', kind, args),
  contextStats: (): Promise<unknown> => ipcRenderer.invoke('context:stats'),
  diagRender: (info: unknown): Promise<void> => ipcRenderer.invoke('diag:render', info),
  chartsMeta: (id: string): Promise<{ title?: string; kind?: string; principle?: string; steps?: string[]; issues?: string[] } | null> =>
    ipcRenderer.invoke('charts:meta', id),
  /** 存 PNG（渲染端已把 SVG 光栅化） */
  savePng: (payload: { base64: string; name?: string; path?: string }): Promise<{ ok: boolean; canceled?: boolean; path?: string; bytes?: number; error?: string }> =>
    ipcRenderer.invoke('file:savePng', payload),
  /** 另存为：source='photo' 存原图 / 'chart' 存 SVG；path 只给自检用 */
  saveAs: (payload: { source: 'photo' | 'chart'; id: string; path?: string }): Promise<{
    ok: boolean
    canceled?: boolean
    path?: string
    bytes?: number
    error?: string
  }> => ipcRenderer.invoke('file:saveAs', payload),
  modelsList: (): Promise<unknown> => ipcRenderer.invoke('models:list'),
  modelsProbe: (baseUrl: string, apiKey: string): Promise<{ ok: boolean; models?: string[]; error?: string }> => ipcRenderer.invoke('models:probe', baseUrl, apiKey),
  modelsSave: (input: unknown): Promise<unknown> => ipcRenderer.invoke('models:save', input),
  modelsRemove: (id: string): Promise<unknown> => ipcRenderer.invoke('models:remove', id),
  modelsActivate: (id: string): Promise<unknown> => ipcRenderer.invoke('models:activate', id),
  pluginsGet: (): Promise<unknown> => ipcRenderer.invoke('plugins:get'),
  pluginsSet: (id: string, enabled: boolean): Promise<unknown> => ipcRenderer.invoke('plugins:set', id, enabled),
  asrStart: (): Promise<{ ok: boolean; sessionId?: string; error?: string }> => ipcRenderer.invoke('asr:start'),
  asrChunk: (base64: string): Promise<boolean> => ipcRenderer.invoke('asr:chunk', base64),
  asrStop: (): Promise<string> => ipcRenderer.invoke('asr:stop'),
  onAsrEvent: (cb: (e: unknown) => void): (() => void) => {
    const handler = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on('asr:event', handler)
    return () => ipcRenderer.removeListener('asr:event', handler)
  },

  /** TTS：配置 + 合成（引擎实现搬自 Cyrene-Agent，MIT） */
  ttsConfig: (): Promise<unknown> => ipcRenderer.invoke('tts:config'),
  ttsConfigSet: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('tts:config:set', patch),
  ttsSynthesize: (req: unknown): Promise<unknown> => ipcRenderer.invoke('tts:synthesize', req),

  /** DeepSeek 官方联网搜索（POST /v1/tools/search，按成功请求计费） */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  webSearch: (
    query: string,
    count?: number,
  ): Promise<{
    ok: boolean
    results?: Array<{
      title: string
      url: string
      snippet: string
      summary: string
      content: string
      siteName: string | null
      date: string | null
      authority: number
      score: number
    }>
    error?: string
  }> => ipcRenderer.invoke('web:search', query, count),

  /** 草稿卡：生成即存，关掉面板也能找回 */
  draftList: (): Promise<unknown[]> => ipcRenderer.invoke('draft:list'),
  draftDrop: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('draft:drop', id),

  /** M3：一句话 -> 卡片草稿 + 伴学示例（不写盘） */
  cardChatDraft: (payload: { brief: string; context?: string; create?: boolean }): Promise<{
    ok: boolean
    draft?: Record<string, unknown>
    draftId?: string
    sample?: string
    question?: string
    ms?: number
    usedSearch?: boolean
    error?: string
  }> => ipcRenderer.invoke('card:chat-draft', payload),

  /** M3：采用草稿 */
  cardChatApply: (payload: { draft: Record<string, unknown>; draftId?: string; create?: boolean; name?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('card:chat-apply', payload),

  /** M2：学情画像（用户自己填） */
  profileGet: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('profile:get'),
  profileSave: (patch: Record<string, unknown>): Promise<{ ok: boolean; profile: unknown; error?: string }> =>
    ipcRenderer.invoke('profile:save', patch),

  /** M1-1：让模型把当前设定写成最终 system prompt */
  cardPolish: (): Promise<{ ok: boolean; text?: string; ms?: number; client?: string; error?: string }> =>
    ipcRenderer.invoke('card:polish'),

  /** 模型设置（不含密钥明文） */
  settingsGet: (): Promise<{
    baseUrl: string
    model: string
    hasKey: boolean
    source: 'env' | 'stored' | 'none'
    encryption: { available: boolean; backend: string }
  }> => ipcRenderer.invoke('settings:get'),

  /** 保存设置；apiKey 留空表示只改其他项 */
  settingsSave: (patch: { apiKey?: string; baseUrl?: string; model?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:save', patch),

  settingsClear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('settings:clear'),

  /** 真打一次模型 */
  settingsTest: (): Promise<{ ok: boolean; ms: number; client: string; snippet?: string; error?: string }> =>
    ipcRenderer.invoke('settings:test'),

  /** 学习者画像 + 今日待复习 + 未纠正错题（一次取全，界面上同屏出现） */
  studyTick: (seconds: number): Promise<number> => ipcRenderer.invoke('study:tick', seconds),
  studyToday: (): Promise<{ seconds: number; minutes: number; week: number[] }> => ipcRenderer.invoke('study:today'),
  /** 每日对话条数（含"已删除"备份、已去重）：首页趋势图用 */
  statsDaily: (): Promise<{ byDay: Record<string, number>; total: number; days: number; todayTs: number[] }> =>
    ipcRenderer.invoke('stats:daily'),
  memoryLibrary: (): Promise<unknown> => ipcRenderer.invoke('memory:library'),
  memoryLibrarySearch: (q: string, k?: number): Promise<unknown> => ipcRenderer.invoke('memory:library:search', q, k),
  memoryLibraryArchive: (id: string): Promise<boolean> => ipcRenderer.invoke('memory:library:archive', id),
  /** 物理删除一条记忆（不可恢复） */
  memoryLibraryDelete: (id: string): Promise<boolean> => ipcRenderer.invoke('memory:library:delete', id),
  learnOverview: (): Promise<OverviewPayload> => ipcRenderer.invoke('learn:overview'),
  /** 生成并打开本节课的学习报告（自包含 HTML） */
  learnReportOpen: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('learn:report'),

  /** 当前学习主题：学段 / 课程 / 今天的目标（可改，存 记忆/学习主题.json） */
  learnTopic: (): Promise<{ stage: string; course: string; goal: string; updatedAt: string }> =>
    ipcRenderer.invoke('learn:topic'),
  learnTopicSet: (patch: {
    stage?: string
    course?: string
    goal?: string
  }): Promise<{ stage: string; course: string; goal: string; updatedAt: string }> =>
    ipcRenderer.invoke('learn:topic:set', patch),
  /** 角色卡仓库 */
  cards: {
    list: (): Promise<CardSummary[]> => ipcRenderer.invoke('cards:list'),
    get: (id: string): Promise<CardDetail | null> => ipcRenderer.invoke('cards:get', id),
    create: (name?: string): Promise<CardSummary | null> =>
      ipcRenderer.invoke('cards:create', name),
    duplicate: (id: string): Promise<CardSummary | null> =>
      ipcRenderer.invoke('cards:duplicate', id),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('cards:delete', id),
    setActive: (id: string): Promise<boolean> => ipcRenderer.invoke('cards:setActive', id),
    importJson: (
      text: string,
    ): Promise<{ ok: boolean; card?: CardSummary | null; error?: string }> =>
      ipcRenderer.invoke('cards:import', text),
    exportJson: (id: string): Promise<string | null> => ipcRenderer.invoke('cards:export', id),
    /** AI 写卡：只返回草稿与 diff，不写盘 */
    generate: (keywords: string): Promise<
      | { ok: true; draft: Record<string, string>; diff: Array<{ field: string; before: string; after: string }>; client: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('cards:generate', keywords),
    save: (
      id: string,
      patch: Partial<Omit<CardDetail, 'id'>>,
    ): Promise<{ ok: boolean; card?: CardSummary | null; error?: string }> =>
      ipcRenderer.invoke('cards:save', id, patch),
  } satisfies CardsApi,
}

contextBridge.exposeInMainWorld('costudy', api)

export type CostudyApi = typeof api
