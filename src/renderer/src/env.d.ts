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
