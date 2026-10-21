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
}

contextBridge.exposeInMainWorld('costudy', api)

export type CostudyApi = typeof api
