import { contextBridge, ipcRenderer } from 'electron'

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
}

const api = {
  info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  /** 切换全屏，返回切换后的状态 */
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:toggleFullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:isFullscreen'),

  /** 订阅全屏状态变化（F11 / Esc / 系统按钮都会触发） */
  onFullscreenChange: (cb: (on: boolean) => void): void => {
    ipcRenderer.on('app:fullscreen-changed', (_e, on: boolean) => cb(on))
  },
}

contextBridge.exposeInMainWorld('costudy', api)

export type CostudyApi = typeof api
