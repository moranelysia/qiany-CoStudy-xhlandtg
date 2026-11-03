export {}

/** 当前学习主题（伴学页「改所学内容」改的就是这三项） */
interface StudyTopic {
  stage: string
  course: string
  goal: string
  updatedAt: string
}

declare global {
  interface AppInfo {
    name: string
    version: string
    electron: string
    node: string
    platform: string
  }

  /** 角色卡列表项 */
  interface CostudyCardSummary {
    id: string
    name: string
    emoji: string
    address: string
    ageRating: string
    updatedAt: string
    isActive: boolean
  }

  /** 角色卡完整字段（编辑器用） */
  interface CostudyCardDetail {
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
    dims: Record<string, number>
  }

  interface Window {
    costudy?: {
      info: () => Promise<AppInfo>

      toggleFullscreen: () => Promise<boolean>
      isFullscreen: () => Promise<boolean>
      onFullscreenChange: (cb: (on: boolean) => void) => void


      /** 最小化到任务栏 */
      minimize: () => void
      /** 关闭窗口并结束整个进程 */
      close: () => void
      toggleMaximize: () => Promise<boolean>
      isMaximized: () => Promise<boolean>
      onMaximizeChange: (cb: (on: boolean) => void) => void


      config: () => Promise<{ appName: string; stage: string }>
      /** P1：会话 */
      sessionEnsure: () => Promise<unknown>
      sessionList: () => Promise<unknown[]>
      sessionMessages: (id: string) => Promise<unknown[]>
      sessionCreate: (title: string) => Promise<unknown>
      sessionSetCurrent: (id: string) => Promise<boolean>
      sessionAdvance: (id: string, to: string) => Promise<{ ok: boolean; phase?: string; error?: string }>
      /** 清空聊天记录（原记录备份在 会话/已删除/） */
      sessionClear: (id?: string) => Promise<{ ok: boolean; removed: number; backup?: string; error?: string }>
      learnReply: (payload: { sessionId?: string; text: string; search?: boolean }) => Promise<{
        ok: boolean
        sessionId?: string
        phase?: string
        reply?: string
        client?: string
        error?: string
        /** 开了联网搜索时，这轮回答引用到的网页 */
        sources?: Array<{ title: string; url: string }>
        /** 开了搜索但没搜成功的原因（回答仍会返回） */
        searchError?: string
      }>

      /** 抓网页正文（M3 的资料补充） */
      webFetch: (url: string) => Promise<{
        ok: boolean
        url?: string
        title?: string
        text?: string
        chars?: number
        truncated?: boolean
        error?: string
      }>

      /** ASR 语音输入配置（不含明文密钥） */
      asrConfig: () => Promise<unknown>
      asrConfigSet: (patch: unknown) => Promise<unknown>
      modelsProbe: (baseUrl: string, apiKey: string) => Promise<{ ok: boolean; models?: string[]; error?: string }>
      outboxList: () => Promise<Array<{ id: string; text: string; at: string; error?: string }>>
      outboxDrop: (id: string) => Promise<unknown[]>
      outboxClear: () => Promise<unknown[]>
      profileState: () => Promise<{ enabled: boolean; lastAt: string; lastCount: number; history: number }>
      profileSetEnabled: (enabled: boolean) => Promise<unknown>
      profileUndo: () => Promise<{ ok: boolean; at?: string; error?: string }>
      modeGet: () => Promise<{ mode: 'chat' | 'work'; allowed: string[] }>
      modeSet: (mode: string) => Promise<{ mode: 'chat' | 'work'; allowed: string[] }>
      /** 代码工作区：范围之外的写入会弹窗要人点头 */
      workspaceGet: () => Promise<{ root: string; fallback: string }>
      workspaceSet: (root: string) => Promise<{ root: string }>
      workspacePick: () => Promise<{ canceled: boolean; root: string }>
      healthCheck: () => Promise<{ at: string; degraded: boolean; items: Array<{ id: string; label: string; ok: boolean; detail: string }> }>
      chartsGet: (id: string) => Promise<string | null>
  /** 选照片：主进程弹对话框、复制进 记忆/图片/ */
  imagePick: () => Promise<{ ok: boolean; canceled?: boolean; id?: string; name?: string; bytes?: number; vision?: boolean; error?: string }>
  /** 按 id 取照片（data URL） */
  imageGet: (id: string) => Promise<{ name: string; mime: string; dataUrl: string } | null>
  /** 粘贴的图（base64）存盘 */
  imagePaste: (payload: { base64: string; mime?: string; name?: string }) => Promise<{
    ok: boolean
    id?: string
    name?: string
    bytes?: number
    vision?: boolean
    error?: string
  }>
  /** 图卡片的附属信息（原理 / 步骤 / 校验结果） */
  chartsRerender: (kind: string, args: unknown) => Promise<{ ok: boolean; id?: string; text?: string }>
  contextStats?: () => Promise<{ messages: number; compressed: number; summaryTokens: number; recentTokens: number; usedTokens: number; windowTokens: number; percent: number; hasSummary: boolean }>
  diagRender?: (info: unknown) => Promise<void>
  chartsMeta: (id: string) => Promise<{ title?: string; kind?: string; principle?: string; steps?: string[]; issues?: string[] } | null>
  /** 存 PNG */
  savePng: (payload: { base64: string; name?: string; path?: string }) => Promise<{
    ok: boolean
    canceled?: boolean
    path?: string
    bytes?: number
    error?: string
  }>
  /** 另存为：photo 存原图 / chart 存 SVG */
  saveAs: (payload: { source: 'photo' | 'chart'; id: string; path?: string }) => Promise<{
    ok: boolean
    canceled?: boolean
    path?: string
    bytes?: number
    error?: string
  }>
      modelsList: () => Promise<{ active: string; profiles: Array<{ id: string; label: string; baseUrl: string; model: string; hasKey: boolean; useFor: string[]; active: boolean }> }>
      modelsSave: (input: unknown) => Promise<unknown>
      modelsRemove: (id: string) => Promise<unknown>
      modelsActivate: (id: string) => Promise<unknown>
      pluginsGet: () => Promise<unknown[]>
      pluginsSet: (id: string, enabled: boolean) => Promise<unknown[]>
      asrProbeLocal: () => Promise<{ ok: boolean; detail: string }>
  asrUseLocal: () => Promise<unknown>
  asrStart: () => Promise<{ ok: boolean; sessionId?: string; error?: string }>
      asrChunk: (base64: string) => Promise<boolean>
      asrStop: () => Promise<string>
      onAsrEvent: (cb: (e: { type: string; text?: string }) => void) => () => void

      /** TTS：配置（不含明文密钥） */
      ttsConfig: () => Promise<unknown>
      ttsConfigSet: (patch: unknown) => Promise<unknown>
      ttsSynthesize: (req: unknown) => Promise<unknown>

      /** 用系统浏览器打开链接（只放行 http/https） */
      openExternal: (url: string) => Promise<boolean>

      /** DeepSeek 官方联网搜索 */
      webSearch: (
        query: string,
        count?: number,
      ) => Promise<{
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
      }>

      /** 草稿卡 */
      draftList: () => Promise<unknown[]>
      draftDrop: (id: string) => Promise<{ ok: boolean }>

      /** M3：一句话 -> 卡片草稿 + 伴学示例 */
      cardChatDraft: (payload: { brief: string; context?: string }) => Promise<{
        ok: boolean
        draft?: Record<string, unknown>
        sample?: string
        question?: string
        ms?: number
        usedSearch?: boolean
        error?: string
      }>
      cardChatApply: (draft: Record<string, string>) => Promise<{ ok: boolean; error?: string }>

      /** M2：学情画像（用户自己填） */
      profileGet: () => Promise<{
        ageBand: string
        education: string
        currentLevel: string
        targetPoints: string[]
        goal: string
        weeklyHours: number
        preferOrder: string
        dislikes: string[]
        updatedAt: string
      }>
      profileSave: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>

      /** M1-1：让模型把当前设定写成最终 system prompt */
      cardPolish: () => Promise<{
        ok: boolean
        text?: string
        ms?: number
        client?: string
        error?: string
      }>

      /** 模型设置（不含密钥明文） */
      settingsGet: () => Promise<{
        baseUrl: string
        model: string
        hasKey: boolean
        source: 'env' | 'stored' | 'none'
        encryption: { available: boolean; backend: string }
      }>
      settingsSave: (patch: {
        apiKey?: string
        baseUrl?: string
        model?: string
      }) => Promise<{ ok: boolean; error?: string }>
      settingsClear: () => Promise<{ ok: boolean }>
      settingsTest: () => Promise<{
        ok: boolean
        ms: number
        client: string
        snippet?: string
        error?: string
      }>

      /** 学习者画像 + 今日待复习 + 未纠正错题 */
      studyTick?: (seconds: number) => Promise<number>
  studyToday?: () => Promise<{ seconds: number; minutes: number; week: number[] }>
  /** 每日对话条数（含"已删除"备份、已去重） */
  statsDaily?: () => Promise<{ byDay: Record<string, number>; total: number; days: number; todayTs: number[] }>
  memoryLibrary?: () => Promise<{
    entries: Array<{ id: string; text: string; kind: string; evidence: string; hits: number; status: 'pending' | 'confirmed'; firstSeen: string; lastSeen: string }>
    counts: { pending: number; confirmed: number; archived: number; total: number }
  }>
  memoryLibrarySearch?: (q: string, k?: number) => Promise<Array<{ id: string; text: string; tags: string[]; evidence: string; hits: number; score: number; matched: string[] }>>
  memoryLibraryArchive?: (id: string) => Promise<boolean>
  memoryLibraryDelete?: (id: string) => Promise<boolean>
  learnOverview: () => Promise<{
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
      }>
      activeCard: () => Promise<{
        name: string
        emoji: string
        address: string
        ageRating: string
        hasContent: boolean
      }>

      /** 当前学习主题：学段 / 课程 / 今天的目标（可改） */
      learnTopic: () => Promise<StudyTopic>
      learnTopicSet: (patch: Partial<StudyTopic>) => Promise<StudyTopic>

      cards: {
        list: () => Promise<CostudyCardSummary[]>
        get: (id: string) => Promise<CostudyCardDetail | null>
        create: (name?: string) => Promise<CostudyCardSummary | null>
        duplicate: (id: string) => Promise<CostudyCardSummary | null>
        remove: (id: string) => Promise<boolean>
        setActive: (id: string) => Promise<boolean>
        importJson: (
          text: string,
        ) => Promise<{ ok: boolean; card?: CostudyCardSummary | null; error?: string }>
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
          patch: Partial<Omit<CostudyCardDetail, 'id'>>,
        ) => Promise<{ ok: boolean; card?: CostudyCardSummary | null; error?: string }>
      }
    }
    __toast?: (msg: string) => void
  }
}
