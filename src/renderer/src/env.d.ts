export {}

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
  }

  interface Window {
    costudy?: {
      info: () => Promise<AppInfo>

      toggleFullscreen: () => Promise<boolean>
      isFullscreen: () => Promise<boolean>
      onFullscreenChange: (cb: (on: boolean) => void) => void

      /** 小窗化：缩成浮在桌面的小窗并置顶；再点一次还原 */
      toggleCompact: () => Promise<boolean>

      /** 最小化到任务栏 */
      minimize: () => void
      /** 关闭窗口并结束整个进程 */
      close: () => void

      config: () => Promise<{ appName: string; stage: string }>
      activeCard: () => Promise<{
        name: string
        emoji: string
        address: string
        ageRating: string
        hasContent: boolean
      }>

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
        save: (
          id: string,
          patch: Partial<Omit<CostudyCardDetail, 'id'>>,
        ) => Promise<{ ok: boolean; card?: CostudyCardSummary | null; error?: string }>
      }
    }
    __toast?: (msg: string) => void
  }
}
