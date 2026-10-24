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
